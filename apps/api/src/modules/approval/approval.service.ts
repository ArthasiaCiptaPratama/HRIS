import type { ApprovalDecisionBody, ApprovalSubject, BulkApprovalDecisionBody } from "@hris/shared";
import { ROLE } from "@hris/shared";
import type { Actor } from "../../core/access/index.ts";
import { hiddenFilter } from "../../core/access/index.ts";
import { writeAudit } from "../../core/audit.ts";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors.ts";
import { employeesWithActiveAccount } from "../iam/index.ts";
import * as policy from "./approval.policy.ts";
import * as repository from "./approval.repository.ts";

// Mesin approval (PLAN §5.2, D-010, D-068, D-069). Modul pemilik subjek (attendance, leave):
//   1. membuat permintaan lewat createApprovalRequest (di transaksinya sendiri),
//   2. mendaftarkan handler status final lewat registerApprovalHandler (dipanggil di transaksi keputusan).
//      Efek luar (notifikasi, FCM) didaftarkan lewat `afterCommit` → dijalankan setelah transaksi commit.
// Aturan paralel: kedua langkah setuju → APPROVED; salah satu menolak → REJECTED final.

export interface RequestContext {
  actor: Actor;
  requestId?: string | undefined;
  ip?: string | undefined;
}

export type ApprovalTx = repository.ApprovalTx;
/** Read-only impact summary; running requests keep their original approvers. */
export const countPendingRequestsForEmployees = (tx: ApprovalTx, employeeIds: string[]) =>
  repository.countPendingByRequester(tx, employeeIds);
export type FinalStatus = "APPROVED" | "REJECTED" | "CANCELLED";
/** Tugas setelah keputusan final ter-commit (gagal = diabaikan; keputusan sudah berlaku). */
export type AfterCommit = (task: () => Promise<unknown>) => void;
export type ApprovalHandler = (
  tx: ApprovalTx,
  event: {
    requestId: string;
    subjectId: string;
    status: FinalStatus;
    decidedAt: Date;
    afterCommit: AfterCommit;
  },
) => Promise<void>;

const handlers = new Map<ApprovalSubject, ApprovalHandler>();

/**
 * Pemeriksaan tambahan sebelum keputusan (mis. TM-D6: lembur melewati batas PP 35/2021 wajib alasan).
 * Melempar error = keputusan dibatalkan. Satu guard per jenis subjek.
 */
export type ApprovalGuard = (
  tx: ApprovalTx,
  input: { subjectId: string; decision: "APPROVED" | "REJECTED"; note: string | null },
) => Promise<void>;
const guards = new Map<ApprovalSubject, ApprovalGuard>();
export function registerApprovalGuard(subject: ApprovalSubject, guard: ApprovalGuard) {
  guards.set(subject, guard);
}

/** Dipanggil modul pemilik subjek saat wiring (app.ts). Satu handler per jenis subjek. */
export function registerApprovalHandler(subject: ApprovalSubject, handler: ApprovalHandler) {
  handlers.set(subject, handler);
}

export interface CreateApprovalInput {
  subjectType: ApprovalSubject;
  subjectId: string;
  requesterEmployeeId: string;
  /** TM-D24: akun HR yang mengajukan atas nama karyawan (tidak boleh memutus langkahnya). */
  submittedByAccountId?: string | null;
  companyId: string;
  managerEmployeeId: string | null;
  /** PARALLEL = atasan + HR (tanpa atasan → HR saja, EMP-D8 Q-A); SINGLE eksplisit = atasan (lembur). */
  mode?: "PARALLEL" | "SINGLE";
}

/**
 * ORG-D9: snapshot atasan saat pengajuan. Atasan tanpa akun aktif tertaut (role apa pun) belum bisa
 * memutuskan → disimpan null = "tanpa atasan" (EMP-D8 Q-A: satu langkah HR untuk mode paralel).
 * Akun yang dibuat kemudian tidak memindahkan pengajuan yang sudah berjalan.
 */
async function decidingManager(managerEmployeeId: string | null): Promise<string | null> {
  if (managerEmployeeId === null) return null;
  const withAccount = await employeesWithActiveAccount([managerEmployeeId]);
  return withAccount.has(managerEmployeeId) ? managerEmployeeId : null;
}

/**
 * Audit PM T4: atasan karyawan berubah → langkah atasan yang masih menunggu ikut pindah ke atasan baru
 * (atasan tanpa akun aktif = null, sama seperti saat pengajuan). Langkah yang sudah diputus tidak disentuh.
 * Dipanggil modul employee di transaksi perubahan atasan. Mengembalikan jumlah permintaan yang dipindah.
 */
export async function reassignPendingManagerSteps(
  tx: ApprovalTx,
  requesterEmployeeId: string,
  managerEmployeeId: string | null,
): Promise<number> {
  const next = await decidingManager(managerEmployeeId);
  return repository.reassignPendingManager(tx, requesterEmployeeId, next);
}

/** Audit PM T4: atasan dinonaktifkan → permintaan yang menunggunya diputus SA / diambil alih HR. */
export async function releasePendingManagerSteps(
  tx: ApprovalTx,
  managerEmployeeId: string,
): Promise<number> {
  return repository.clearPendingManager(tx, managerEmployeeId);
}

export async function createApprovalRequest(tx: ApprovalTx, input: CreateApprovalInput) {
  const managerEmployeeId = await decidingManager(input.managerEmployeeId);
  // EMP-D8 Q-A: tanpa pemutus atasan, pengajuan paralel cukup satu langkah HR.
  const hrOnly = (input.mode ?? "PARALLEL") === "PARALLEL" && managerEmployeeId === null;
  const mode = hrOnly ? "SINGLE" : (input.mode ?? "PARALLEL");
  return repository.createRequest(
    tx,
    {
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      requesterEmployeeId: input.requesterEmployeeId,
      submittedByAccountId: input.submittedByAccountId ?? null,
      companyId: input.companyId,
      managerEmployeeId,
      mode,
    },
    hrOnly ? ["HR"] : mode === "PARALLEL" ? ["MANAGER", "HR"] : ["MANAGER"],
  );
}

// ── Tampilan ───────────────────────────────────────────────────────────────────

export interface ApprovalStepView {
  kind: "MANAGER" | "HR";
  decision: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
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

/** Pemisahan tugas: akun yang sudah memutuskan satu langkah tidak memutuskan langkah lain (view & keputusan). */
const decidedAnyStep = (actor: Actor, row: repository.ApprovalRow) =>
  row.steps.some((step) => step.decidedByAccountId === actor.accountId);

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
  const decided = decidedAnyStep(actor, row);
  const regular = !decided && steps.some((s) => s.myRight === "regular");
  return {
    id: row.id,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    steps,
    canDecide: regular,
    canOverride: !decided && !regular && steps.some((s) => s.myRight === "override"),
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
  if (actor.role === ROLE.HR_ADMIN) {
    or.push({ companyId: { in: [...(actor.companyIds ?? [])] } });
  }
  // SA: semua (disaring stepRight di bawah) — tanpa OR, karena `OR: [{}]` tidak cocok dengan baris mana pun.
  const isSa = actor.role === ROLE.SUPER_ADMIN;
  if (!isSa && or.length === 0) return [];
  const rows = await repository.listRequests(
    {
      ...hiddenFilter(actor, "requesterEmployeeId"),
      subjectType,
      status: "PENDING",
      ...(isSa ? {} : { OR: or }),
    },
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
  afterCommit: AfterCommit,
): Promise<DecisionResult> {
  const row = await repository.findRequest(tx, requestId);
  if (!row) throw new NotFoundError();
  const anyRight = row.steps.some((step) => policy.stepRight(ctx.actor, row, step.kind) !== null);
  // Tidak berhak sama sekali → sama dengan tidak ada (tidak membocorkan keberadaan).
  if (!anyRight && !policy.canViewApproval(ctx.actor, row)) throw new NotFoundError();
  if (row.status !== "PENDING") throw new ConflictError("Pengajuan ini sudah diputuskan.");
  await guards.get(row.subjectType as ApprovalSubject)?.(tx, {
    subjectId: row.subjectId,
    decision: body.decision,
    note: body.note ?? null,
  });

  if (decidedAnyStep(ctx.actor, row)) {
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
      await handler(tx, {
        requestId: row.id,
        subjectId: row.subjectId,
        status,
        decidedAt: now,
        afterCommit,
      });
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
  const tasks: (() => Promise<unknown>)[] = [];
  const result = await repository.withTransaction((tx) =>
    decideInTx(tx, ctx, requestId, body, now, (task) => tasks.push(task)),
  );
  for (const task of tasks) {
    try {
      await task();
    } catch {
      // Efek setelah commit bersifat tambahan (notifikasi): keputusan tetap berlaku.
    }
  }
  return result;
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
  if (updated.count !== 1) return false;
  // Langkah yang masih menunggu ikut ditutup → tidak tampil "Menunggu" di web/app.
  await repository.cancelPendingSteps(tx, row.id, now);
  return true;
}

export async function getApproval(ctx: RequestContext, requestId: string): Promise<ApprovalView> {
  const row = await repository.findRequest(undefined, requestId);
  if (!row || !policy.canViewApproval(ctx.actor, row)) throw new NotFoundError();
  return toView(ctx.actor, row);
}

/** EMP-D8 P1: catat penginput bila satu-satunya langkah masih harus diverifikasi orang lain. */
export async function setApprovalSubmitter(tx: ApprovalTx, requestId: string, accountId: string) {
  await repository.setSubmitter(tx, requestId, accountId);
}

/** EMP-D8 P1: referensi pengajuan menunggu; modul pemilik tetap memeriksa kelayakan subjeknya. */
export const pendingRequestsForSubjects = repository.pendingRequestsForSubjects;

/** EMP-D8 P1: keputusan sistem tanpa akun, atomik bersama handler subjek dan audit. */
export async function autoApproveRequest(
  tx: ApprovalTx,
  requestId: string,
  now: Date,
  note: string,
): Promise<boolean> {
  const row = await repository.findRequest(tx, requestId);
  if (row?.status !== "PENDING") return false;
  if (
    row.steps.length === 0 ||
    row.steps.some((s) => s.decision === "REJECTED" || s.decision === "CANCELLED")
  ) {
    throw new ConflictError("Pengajuan tidak dapat disetujui otomatis.");
  }
  const handler = handlers.get(row.subjectType);
  if (!handler) throw new BusinessRuleError("Handler persetujuan belum dikonfigurasi.");
  const claimed = await repository.setStatus(tx, row.id, "APPROVED", now);
  if (claimed.count !== 1) return false;
  for (const step of row.steps.filter((s) => s.decision === "PENDING")) {
    const updated = await repository.decideStep(tx, step.id, {
      decision: "APPROVED",
      decidedByAccountId: null,
      decidedAt: now,
      note,
      isOverride: false,
    });
    if (updated.count !== 1)
      throw new ConflictError("Langkah ini baru saja diputuskan pihak lain.");
  }
  // Persetujuan otomatis hanya untuk subjek tanpa efek luar setelah commit.
  await handler(tx, {
    requestId: row.id,
    subjectId: row.subjectId,
    status: "APPROVED",
    decidedAt: now,
    afterCommit: () => {
      throw new BusinessRuleError("Persetujuan otomatis tidak mendukung efek setelah commit.");
    },
  });
  await writeAudit(
    {
      actorAccountId: null,
      action: "approval.auto_approve",
      entityType: `approval.${row.subjectType.toLowerCase()}`,
      entityId: row.id,
      before: { status: row.status },
      after: {
        status: "APPROVED",
        steps: row.steps.filter((s) => s.decision === "PENDING").map((s) => s.kind),
      },
      reason: note,
    },
    tx,
  );
  return true;
}
