import type { ApprovalDecisionBody, ApprovalSubject, BulkApprovalDecisionBody } from "@hris/shared";
import { ROLE } from "@hris/shared";
import type { Actor } from "../../core/access/index.ts";
import { writeAudit } from "../../core/audit.ts";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors.ts";
import * as policy from "./approval.policy.ts";
import * as repository from "./approval.repository.ts";

// Mesin approval (PLAN §5.2, D-010, D-068, D-069). Modul pemilik subjek (attendance, leave):
//   1. membuat permintaan lewat createApprovalRequest (di transaksinya sendiri),
//   2. mendaftarkan handler status final lewat registerApprovalHandler (dipanggil di transaksi keputusan).
// Aturan paralel: kedua langkah setuju → APPROVED; salah satu menolak → REJECTED final.

export interface RequestContext {
  actor: Actor;
  requestId?: string | undefined;
  ip?: string | undefined;
}

export type ApprovalTx = repository.ApprovalTx;
export type FinalStatus = "APPROVED" | "REJECTED" | "CANCELLED";
export type ApprovalHandler = (
  tx: ApprovalTx,
  event: { requestId: string; subjectId: string; status: FinalStatus; decidedAt: Date },
) => Promise<void>;

const handlers = new Map<ApprovalSubject, ApprovalHandler>();

/** Dipanggil modul pemilik subjek saat wiring (app.ts). Satu handler per jenis subjek. */
export function registerApprovalHandler(subject: ApprovalSubject, handler: ApprovalHandler) {
  handlers.set(subject, handler);
}

export interface CreateApprovalInput {
  subjectType: ApprovalSubject;
  subjectId: string;
  requesterEmployeeId: string;
  companyId: string;
  managerEmployeeId: string | null;
  /** PARALLEL = atasan + HR (bawaan); SINGLE = atasan saja (lembur, PLAN §5.2). */
  mode?: "PARALLEL" | "SINGLE";
}

export async function createApprovalRequest(tx: ApprovalTx, input: CreateApprovalInput) {
  const mode = input.mode ?? "PARALLEL";
  return repository.createRequest(
    tx,
    {
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      requesterEmployeeId: input.requesterEmployeeId,
      companyId: input.companyId,
      managerEmployeeId: input.managerEmployeeId,
      mode,
    },
    mode === "PARALLEL" ? ["MANAGER", "HR"] : ["MANAGER"],
  );
}

// ── Tampilan ───────────────────────────────────────────────────────────────────

export interface ApprovalStepView {
  kind: "MANAGER" | "HR";
  decision: "PENDING" | "APPROVED" | "REJECTED";
  decidedAt: string | null;
  note: string | null;
  isOverride: boolean;
  /** Hak aktor atas langkah ini (untuk tombol di UI). */
  myRight: policy.StepRight;
}

export interface ApprovalView {
  id: string;
  subjectType: ApprovalSubject;
  subjectId: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  createdAt: string;
  decidedAt: string | null;
  steps: ApprovalStepView[];
  /** Aktor bisa memutuskan sekarang tanpa alasan wajib (punya langkah regular yang masih menunggu). */
  canDecide: boolean;
  /** Aktor hanya bisa mengambil alih (alasan wajib). */
  canOverride: boolean;
}

export function toView(actor: Actor, row: repository.ApprovalRow): ApprovalView {
  const steps = row.steps.map((step) => ({
    kind: step.kind,
    decision: step.decision,
    decidedAt: step.decidedAt?.toISOString() ?? null,
    note: step.note,
    isOverride: step.isOverride,
    myRight:
      row.status === "PENDING" && step.decision === "PENDING"
        ? policy.stepRight(actor, row, step.kind)
        : null,
  }));
  const decidedByMe = new Set(
    row.steps.filter((s) => s.decidedByAccountId === actor.accountId).map((s) => s.kind),
  );
  const regular = steps.some((s) => s.myRight === "regular") && decidedByMe.size === 0;
  return {
    id: row.id,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    steps,
    canDecide: regular,
    canOverride: !regular && steps.some((s) => s.myRight === "override"),
  };
}

/** Status approval untuk banyak subjek (dipakai modul pemilik untuk daftar/inbox). */
export async function getApprovalViews(
  actor: Actor,
  subjectType: ApprovalSubject,
  subjectIds: string[],
): Promise<Map<string, ApprovalView>> {
  const rows = await repository.findBySubjects(subjectType, subjectIds);
  return new Map(rows.map((row) => [row.subjectId, toView(actor, row)]));
}

/** Permintaan PENDING yang bisa diputuskan aktor (regular), atau semua PENDING dalam cakupan untuk SA/HR override. */
export async function listActionable(
  actor: Actor,
  subjectType: ApprovalSubject,
  options: { includeOverride?: boolean; take?: number } = {},
): Promise<ApprovalView[]> {
  const or: object[] = [];
  if (actor.employeeId) or.push({ managerEmployeeId: actor.employeeId });
  if (actor.role === ROLE.SUPER_ADMIN) or.push({}); // semua; disaring stepRight di bawah
  if (actor.role === ROLE.HR_ADMIN) {
    or.push({ companyId: { in: [...(actor.companyIds ?? [])] } });
  }
  if (or.length === 0) return [];
  const rows = await repository.listRequests(
    { subjectType, status: "PENDING", OR: or },
    options.take ?? 1000,
  );
  return rows
    .map((row) => toView(actor, row))
    .filter((view) => view.canDecide || (options.includeOverride === true && view.canOverride));
}

// ── Keputusan ──────────────────────────────────────────────────────────────────

export interface DecisionResult {
  requestId: string;
  status: ApprovalView["status"];
}

async function decideInTx(
  tx: ApprovalTx,
  ctx: RequestContext,
  requestId: string,
  body: ApprovalDecisionBody,
  now: Date,
): Promise<DecisionResult> {
  const row = await repository.findRequest(tx, requestId);
  if (!row) throw new NotFoundError();
  const anyRight = row.steps.some((step) => policy.stepRight(ctx.actor, row, step.kind) !== null);
  // Tidak berhak sama sekali → sama dengan tidak ada (tidak membocorkan keberadaan).
  if (!anyRight && !policy.canViewApproval(ctx.actor, row)) throw new NotFoundError();
  if (row.status !== "PENDING") throw new ConflictError("Pengajuan ini sudah diputuskan.");

  // Pemisahan tugas: akun yang sudah memutuskan satu langkah tidak memutuskan langkah lain.
  if (row.steps.some((step) => step.decidedByAccountId === ctx.actor.accountId)) {
    throw new ForbiddenError("Langkah lain harus diputuskan orang yang berbeda.");
  }
  const pending = row.steps.filter((step) => step.decision === "PENDING");
  const rights = pending.map((step) => ({
    step,
    right: policy.stepRight(ctx.actor, row, step.kind),
  }));
  // Satu langkah regular per keputusan (mis. HR yang juga atasan pengaju tetap hanya satu langkah).
  let chosen = rights.filter((r) => r.right === "regular").slice(0, 1);
  let isOverride = false;
  if (chosen.length === 0) {
    // Mengambil alih: semua langkah menunggu yang boleh di-override (SA bisa keduanya sekaligus).
    const overrides = rights.filter((r) => r.right === "override");
    if (overrides.length === 0) throw new ForbiddenError();
    if (!body.note) {
      throw new BusinessRuleError("Alasan wajib diisi saat mengambil alih keputusan.");
    }
    chosen = overrides;
    isOverride = true;
  }

  for (const { step } of chosen) {
    const updated = await repository.decideStep(tx, step.id, {
      decision: body.decision,
      decidedByAccountId: ctx.actor.accountId,
      decidedAt: now,
      note: body.note ?? null,
      isOverride,
    });
    if (updated.count !== 1)
      throw new ConflictError("Langkah ini baru saja diputuskan pihak lain.");
  }

  const decisions = row.steps.map((step) =>
    chosen.some((c) => c.step.id === step.id) ? body.decision : step.decision,
  );
  const status: ApprovalView["status"] = decisions.includes("REJECTED")
    ? "REJECTED"
    : decisions.every((d) => d === "APPROVED")
      ? "APPROVED"
      : "PENDING";

  if (status !== "PENDING") {
    await repository.setStatus(tx, row.id, status, now);
    const handler = handlers.get(row.subjectType);
    if (handler)
      await handler(tx, { requestId: row.id, subjectId: row.subjectId, status, decidedAt: now });
  }

  await writeAudit(
    {
      actorAccountId: ctx.actor.accountId,
      action: isOverride ? "approval.override" : "approval.decide",
      entityType: `approval.${row.subjectType.toLowerCase()}`,
      entityId: row.id,
      before: { status: row.status },
      after: { decision: body.decision, steps: chosen.map((c) => c.step.kind), status },
      reason: body.note ?? null,
      requestId: ctx.requestId ?? null,
      ip: ctx.ip ?? null,
    },
    tx,
  );
  return { requestId: row.id, status };
}

export async function decide(
  ctx: RequestContext,
  requestId: string,
  body: ApprovalDecisionBody,
  now = new Date(),
): Promise<DecisionResult> {
  return repository.withTransaction((tx) => decideInTx(tx, ctx, requestId, body, now));
}

export interface BulkResultItem {
  requestId: string;
  status?: ApprovalView["status"];
  error?: string;
}

/** Persetujuan massal (D-068): tiap permintaan diputuskan di transaksinya sendiri; gagal satu tidak membatalkan yang lain. */
export async function decideBulk(
  ctx: RequestContext,
  body: BulkApprovalDecisionBody,
  now = new Date(),
): Promise<BulkResultItem[]> {
  const results: BulkResultItem[] = [];
  for (const requestId of new Set(body.requestIds)) {
    try {
      const result = await decide(
        ctx,
        requestId,
        { decision: body.decision, note: body.note },
        now,
      );
      results.push(result);
    } catch (error) {
      results.push({
        requestId,
        error: error instanceof Error ? error.message : "Gagal memutuskan.",
      });
    }
  }
  return results;
}

/** Pembatalan oleh modul pemilik (yang sudah memeriksa hak pengaju) selama belum final. */
export async function cancelApprovalRequest(
  tx: ApprovalTx,
  subjectType: ApprovalSubject,
  subjectId: string,
  now = new Date(),
): Promise<boolean> {
  const row = await repository.findBySubject(tx, subjectType, subjectId);
  if (!row) return false;
  const updated = await repository.setStatus(tx, row.id, "CANCELLED", now);
  return updated.count === 1;
}

export async function getApproval(ctx: RequestContext, requestId: string): Promise<ApprovalView> {
  const row = await repository.findRequest(undefined, requestId);
  if (!row || !policy.canViewApproval(ctx.actor, row)) throw new NotFoundError();
  return toView(ctx.actor, row);
}
