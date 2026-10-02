import {
  ONBOARDING_STATUSES,
  type OnboardingBatchInput,
  type OnboardingCandidate,
  type OnboardingStatus,
  onboardingBatchInputSchema,
  onboardingCandidateSchema,
  suggestEmployeeNumbers,
} from "@hris/shared";
import type { Actor } from "../../core/access/index.ts";
import { writeAudit } from "../../core/audit.ts";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors.ts";
import type { AuthAdmin } from "../../core/supabase-admin.ts";
import {
  accountEmailsInUse,
  getEmployeeAccountStates,
  inviteEmployeeAccount,
  listManagerEmployeeIds,
} from "../iam/index.ts";
import { getMasterLookup } from "../organization/index.ts";
import * as policy from "./employee.policy.ts";
import * as employeeRepo from "./employee.repository.ts";
import * as repo from "./onboarding.repository.ts";
import type {
  CandidateListQuery,
  InviteExistingBody,
  OnboardingBatchDto,
  OnboardingCandidateDto,
  OnboardingPreview,
  ProcessResult,
} from "./onboarding.schema.ts";

// D-045 bagian a (design/onboarding-karyawan.md §4–§5): penerimaan calon dari file portal, nomor induk
// otomatis, antrean undangan bertahap. Calon belum APPROVED disembunyikan dari fitur karyawan lain.

export interface OnboardingContext {
  actor: Actor;
  requestId?: string | undefined;
  ip?: string | undefined;
}

export interface InvitationDeps {
  authAdmin: AuthAdmin;
  /** Tujuan tautan undangan/atur password: `<web>/auth/callback`. */
  redirectTo: string;
  /** Batas undangan per jam seluruh sistem (di bawah limit email Supabase Auth). */
  perHour: number;
}

const PROCESS_BATCH = 10;
const ISSUE_MESSAGES: Record<string, string> = {
  EMAIL_DUPLICATE_IN_BATCH: "Email pribadi ganda di daftar ini.",
  EMAIL_TAKEN: "Email sudah dipakai karyawan atau akun lain.",
  NUMBER_DUPLICATE_IN_BATCH: "Nomor induk ganda di daftar ini.",
  NUMBER_TAKEN: "Nomor induk sudah dipakai.",
  COMPANY_OUT_OF_SCOPE: "Perusahaan di luar cakupan akun Anda.",
  COMPANY_INVALID: "Perusahaan tidak ditemukan atau diarsipkan.",
  STATUS_INVALID: "Status kepegawaian tidak ditemukan atau diarsipkan.",
  POSITION_INVALID: "Jabatan tidak ditemukan atau diarsipkan.",
  LOCATION_INVALID: "Lokasi kerja tidak ditemukan atau diarsipkan.",
  GRADE_INVALID: "Grade tidak ditemukan atau diarsipkan.",
  MANAGER_INVALID: "Atasan harus karyawan aktif yang memiliki akun Manager/Super Admin.",
  NUMBER_REQUIRED: "Nomor induk wajib diisi.",
};

function assertCanRun(actor: Actor) {
  if (!policy.canRunOnboarding(actor)) throw new ForbiddenError();
}

/** Cakupan PT aktor untuk query (null = semua PT). */
function companyScope(actor: Actor): string[] | null {
  return actor.companyIds === null ? null : [...actor.companyIds];
}

function auditBase(ctx: OnboardingContext) {
  return {
    actorAccountId: ctx.actor.accountId,
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
  };
}

// ── Analisis baris (pratinjau & simpan memakai fungsi yang sama) ─────────────────────────────────

interface RowAnalysis {
  sourceRow: number;
  candidate: OnboardingCandidate | null;
  employeeNumber: string | null;
  suggested: boolean;
  issues: { field: string | null; code: string; message: string }[];
}

async function analyze(
  actor: Actor,
  raws: unknown[],
  opts: { requireNumber: boolean },
): Promise<RowAnalysis[]> {
  const lookup = await getMasterLookup();
  const rows: RowAnalysis[] = raws.map((raw, index) => {
    const parsed = onboardingCandidateSchema.safeParse(raw);
    const sourceRow =
      typeof (raw as { sourceRow?: unknown })?.sourceRow === "number"
        ? ((raw as { sourceRow: number }).sourceRow as number)
        : index + 1;
    if (!parsed.success) {
      return {
        sourceRow,
        candidate: null,
        employeeNumber: null,
        suggested: false,
        issues: parsed.error.issues.map((issue) => ({
          field: issue.path.length > 0 ? String(issue.path[0]) : null,
          code: "INVALID",
          message: issue.message,
        })),
      };
    }
    return {
      sourceRow,
      candidate: parsed.data,
      employeeNumber: parsed.data.employeeNumber ?? null,
      suggested: false,
      issues: [],
    };
  });
  const push = (row: RowAnalysis, field: string | null, code: string) =>
    row.issues.push({ field, code, message: ISSUE_MESSAGES[code] ?? code });
  const valid = rows.filter((r): r is RowAnalysis & { candidate: OnboardingCandidate } =>
    Boolean(r.candidate),
  );

  // Rujukan master data aktif + cakupan PT (D-040).
  const managers = new Set(await listManagerEmployeeIds());
  const managerRows = await employeeRepo.findManyByIds([
    ...new Set(valid.map((r) => r.candidate.managerId).filter((id): id is string => Boolean(id))),
  ]);
  const activeManagers = new Set(
    managerRows
      .filter((m) => m.isActive && m.onboardingStatus === "APPROVED" && managers.has(m.id))
      .map((m) => m.id),
  );
  const live = <T extends { deleted: boolean }>(
    map: Map<string, T>,
    id: string | null | undefined,
  ) => !id || (map.has(id) && !map.get(id)?.deleted);
  for (const row of valid) {
    const c = row.candidate;
    if (!live(lookup.companies, c.companyId)) push(row, "companyId", "COMPANY_INVALID");
    else if (!policy.canOnboardInCompany(actor, c.companyId))
      push(row, "companyId", "COMPANY_OUT_OF_SCOPE");
    if (!live(lookup.statuses, c.employmentStatusId))
      push(row, "employmentStatusId", "STATUS_INVALID");
    if (!live(lookup.positions, c.positionId)) push(row, "positionId", "POSITION_INVALID");
    if (!live(lookup.locations, c.workLocationId)) push(row, "workLocationId", "LOCATION_INVALID");
    if (!live(lookup.grades, c.gradeId)) push(row, "gradeId", "GRADE_INVALID");
    if (c.managerId && !activeManagers.has(c.managerId)) push(row, "managerId", "MANAGER_INVALID");
  }

  // Email pribadi: unik di daftar, belum dipakai karyawan lain maupun akun login.
  const emails = valid.map((r) => r.candidate.personalEmail);
  const [takenByEmployees, takenByAccounts] = await Promise.all([
    repo.findTakenPersonalEmails(emails),
    accountEmailsInUse(emails),
  ]);
  const takenEmails = new Set([...takenByEmployees, ...takenByAccounts]);
  const emailCount = new Map<string, number>();
  for (const email of emails) emailCount.set(email, (emailCount.get(email) ?? 0) + 1);
  for (const row of valid) {
    const email = row.candidate.personalEmail;
    if ((emailCount.get(email) ?? 0) > 1) push(row, "personalEmail", "EMAIL_DUPLICATE_IN_BATCH");
    else if (takenEmails.has(email)) push(row, "personalEmail", "EMAIL_TAKEN");
  }

  // Nomor induk: isian pengguna dipakai apa adanya; kosong → usulan DD.MM.KODE.NNN per PT (D-045).
  const companyIds = [...new Set(valid.map((r) => r.candidate.companyId))];
  const existingByCompany = new Map<string, string[]>();
  for (const { companyId, employeeNumber } of await repo.employeeNumbersInCompanies(companyIds)) {
    existingByCompany.set(companyId, [...(existingByCompany.get(companyId) ?? []), employeeNumber]);
  }
  const given = valid.map((r) => r.candidate.employeeNumber).filter((n): n is string => Boolean(n));
  for (const companyId of companyIds) {
    const needing = valid.filter(
      (r) => r.candidate.companyId === companyId && !r.candidate.employeeNumber,
    );
    if (needing.length === 0 || opts.requireNumber) continue;
    const code = lookup.companies.get(companyId)?.code;
    if (!code) continue;
    const suggestions = suggestEmployeeNumbers({
      existing: [...(existingByCompany.get(companyId) ?? []), ...given],
      companyCode: code,
      joinDates: needing.map((r) => r.candidate.joinDate),
    });
    needing.forEach((row, i) => {
      row.employeeNumber = suggestions[i] ?? null;
      row.suggested = true;
    });
  }
  const numbers = valid.map((r) => r.employeeNumber).filter((n): n is string => Boolean(n));
  const taken = new Set((await repo.findTakenNumbers(numbers)).map((n) => n.toUpperCase()));
  const numberCount = new Map<string, number>();
  for (const n of numbers)
    numberCount.set(n.toUpperCase(), (numberCount.get(n.toUpperCase()) ?? 0) + 1);
  for (const row of valid) {
    if (!row.employeeNumber) {
      if (opts.requireNumber) push(row, "employeeNumber", "NUMBER_REQUIRED");
      continue;
    }
    const key = row.employeeNumber.toUpperCase();
    if ((numberCount.get(key) ?? 0) > 1) push(row, "employeeNumber", "NUMBER_DUPLICATE_IN_BATCH");
    else if (taken.has(key)) push(row, "employeeNumber", "NUMBER_TAKEN");
  }
  return rows;
}

export async function previewBatch(
  ctx: OnboardingContext,
  raws: unknown[],
): Promise<OnboardingPreview> {
  assertCanRun(ctx.actor);
  const rows = await analyze(ctx.actor, raws, { requireNumber: false });
  return {
    rows: rows.map((r) => ({
      sourceRow: r.sourceRow,
      employeeNumber: r.employeeNumber,
      suggested: r.suggested,
      issues: r.issues,
    })),
    valid: rows.every((r) => r.issues.length === 0),
  };
}

// ── Simpan batch (satu transaksi) ─────────────────────────────────────────────────────────────────

export async function createBatch(
  ctx: OnboardingContext,
  body: OnboardingBatchInput,
): Promise<OnboardingBatchDto> {
  assertCanRun(ctx.actor);
  const input = onboardingBatchInputSchema.parse(body);
  // Server memvalidasi ulang semua baris; nomor induk wajib (hasil pratinjau / isian pengguna).
  const analysis = await analyze(ctx.actor, input.candidates, { requireNumber: true });
  const problems = analysis.filter((r) => r.issues.length > 0);
  if (problems.length > 0) {
    throw new BusinessRuleError(
      "Sebagian calon belum valid. Muat ulang pratinjau dan perbaiki barisnya.",
      problems.map((r) => ({ sourceRow: r.sourceRow, issues: r.issues })),
    );
  }
  const companyIds = [...new Set(input.candidates.map((c) => c.companyId))];
  try {
    const batchId = await employeeRepo.withTransaction(async (tx) => {
      const invitedCount = input.candidates.filter((c) => c.invite).length;
      const batch = await repo.createBatch(tx, {
        name: input.name,
        actorAccountId: ctx.actor.accountId,
        companyId: companyIds.length === 1 ? (companyIds[0] as string) : null,
        sourceFileName: input.sourceFileName ?? null,
        sourceFileSha256: input.sourceFileSha256 ?? null,
        createdCount: input.candidates.length,
        invitedCount,
      });
      for (const c of input.candidates) {
        const status: OnboardingStatus = c.invite ? "INVITED" : "NOT_INVITED";
        const employee = await repo.createCandidate(tx, {
          employeeNumber: c.employeeNumber as string,
          fullName: c.fullName,
          personalEmail: c.personalEmail,
          phoneNumber: c.phoneNumber ?? null,
          gender: c.gender ?? null,
          joinDate: new Date(`${c.joinDate}T00:00:00.000Z`),
          companyId: c.companyId,
          employmentStatusId: c.employmentStatusId,
          positionId: c.positionId,
          workLocationId: c.workLocationId ?? null,
          gradeId: c.gradeId ?? null,
          managerId: c.managerId ?? null,
          onboardingStatus: status,
          onboardingBatchId: batch.id,
        });
        await repo.addEvent(tx, {
          employeeId: employee.id,
          fromStatus: null,
          toStatus: status,
          actorAccountId: ctx.actor.accountId,
        });
        if (c.invite) {
          await repo.queueInvitation(tx, {
            employeeId: employee.id,
            email: c.personalEmail,
            queuedBy: ctx.actor.accountId,
          });
        }
        await writeAudit(
          {
            ...auditBase(ctx),
            action: "employee.onboarding.create",
            entityType: "employee.employee",
            entityId: employee.id,
            // Tanpa email/nama (data pribadi calon) — cukup rujukan & status.
            after: { batchId: batch.id, companyId: c.companyId, status, source: "onboarding" },
          },
          tx,
        );
      }
      return batch.id;
    });
    return getBatch(ctx, batchId);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new ConflictError("Nomor induk atau email sudah dipakai. Muat ulang pratinjau.");
    }
    throw error;
  }
}

// ── Batch & progres ────────────────────────────────────────────────────────────────────────────────

async function toBatchDto(batch: NonNullable<Awaited<ReturnType<typeof repo.findBatch>>>) {
  const counts = await repo.invitationCountsForBatch(batch.id);
  const count = (status: string) => counts.find((c) => c.status === status)?._count._all ?? 0;
  return {
    id: batch.id,
    name: batch.name,
    companyId: batch.companyId,
    createdCount: batch.createdCount,
    invitedCount: batch.invitedCount,
    createdAt: batch.createdAt.toISOString(),
    invitations: { queued: count("QUEUED"), sent: count("SENT"), failed: count("FAILED") },
  };
}

export async function listBatches(ctx: OnboardingContext): Promise<OnboardingBatchDto[]> {
  assertCanRun(ctx.actor);
  const batches = await repo.listBatches(companyScope(ctx.actor));
  return Promise.all(batches.map(toBatchDto));
}

export async function getBatch(ctx: OnboardingContext, id: string): Promise<OnboardingBatchDto> {
  assertCanRun(ctx.actor);
  const batch = await repo.findBatch(id);
  const scope = companyScope(ctx.actor);
  // Batch lintas PT (companyId null) hanya untuk SA; HR → 404 di luar cakupan (D-040).
  if (!batch || (scope !== null && (!batch.companyId || !scope.includes(batch.companyId)))) {
    throw new NotFoundError("Penerimaan tidak ditemukan.");
  }
  return toBatchDto(batch);
}

// ── Antrean undangan ──────────────────────────────────────────────────────────────────────────────

/**
 * Kirim ≤ 10 undangan tertua (dalam cakupan aktor; null = sistem/cron = semua) tanpa melewati batas per
 * jam. Dipanggil berkala oleh halaman progres HR dan cron harian cadangan (Vercel Hobby, D-045).
 */
export async function processInvitations(
  actor: Actor | null,
  deps: InvitationDeps,
  now = new Date(),
): Promise<ProcessResult> {
  if (actor) assertCanRun(actor);
  const scope = actor ? companyScope(actor) : null;
  const sentLastHour = await repo.countSentSince(new Date(now.getTime() - 60 * 60 * 1000));
  const room = Math.max(0, deps.perHour - sentLastHour);
  const queue = room > 0 ? await repo.takeQueued(scope, Math.min(PROCESS_BATCH, room)) : [];
  let sent = 0;
  let failed = 0;
  for (const item of queue) {
    const outcome = await inviteEmployeeAccount({
      email: item.email,
      employeeId: item.employeeId,
      actorAccountId: item.queuedBy,
      authAdmin: deps.authAdmin,
      redirectTo: deps.redirectTo,
    });
    if (outcome.ok) {
      sent += 1;
      await repo.markInvitation(item.id, {
        status: "SENT",
        attempts: item.attempts + 1,
        sentAt: now,
      });
    } else if (outcome.code === "EMPLOYEE_HAS_ACCOUNT") {
      // Akun sudah ada (mis. kirim ulang setelah akun dibuat): kirim tautan atur password saja.
      try {
        await deps.authAdmin.sendPasswordSetupEmail(item.email, deps.redirectTo);
        sent += 1;
        await repo.markInvitation(item.id, {
          status: "SENT",
          attempts: item.attempts + 1,
          sentAt: now,
        });
      } catch {
        failed += 1;
        await repo.markInvitation(item.id, {
          status: "FAILED",
          attempts: item.attempts + 1,
          lastErrorCode: "INVITE_FAILED",
        });
      }
    } else {
      failed += 1;
      await repo.markInvitation(item.id, {
        status: "FAILED",
        attempts: item.attempts + 1,
        lastErrorCode: outcome.code,
      });
    }
  }
  const remaining = await repo.countQueued(scope);
  return {
    processed: queue.length,
    sent,
    failed,
    remaining,
    rateLimited: remaining > 0 && sentLastHour + sent >= deps.perHour,
  };
}

/** Kirim ulang / undang sekarang (status Belum diundang, Diundang, atau undangan gagal). */
export async function resendInvitation(ctx: OnboardingContext, employeeId: string) {
  assertCanRun(ctx.actor);
  const candidate = await repo.findCandidate(employeeId);
  if (!candidate || !policy.canOnboardInCompany(ctx.actor, candidate.companyId)) {
    throw new NotFoundError("Calon tidak ditemukan.");
  }
  const reinvitable: OnboardingStatus[] = ["NOT_INVITED", "INVITED"];
  const existingInvite = candidate.onboardingStatus === "APPROVED" && candidate.completionRequired;
  if (!reinvitable.includes(candidate.onboardingStatus) && !existingInvite) {
    throw new BusinessRuleError("Calon ini sudah aktivasi; undangan tidak perlu dikirim ulang.");
  }
  const [account] = await getEmployeeAccountStates([employeeId]);
  if (account?.hasLoggedIn) {
    throw new BusinessRuleError("Akun sudah pernah login; minta calon memakai Lupa password.");
  }
  if (await repo.hasOpenInvitation(employeeId)) {
    throw new ConflictError("Undangan untuk calon ini masih dalam antrean.");
  }
  const email = candidate.personalEmail ?? candidate.workEmail;
  if (!email) throw new BusinessRuleError("Calon belum punya email.");
  await employeeRepo.withTransaction(async (tx) => {
    await repo.queueInvitation(tx, { employeeId, email, queuedBy: ctx.actor.accountId });
    if (candidate.onboardingStatus === "NOT_INVITED") {
      await repo.setStatus(tx, employeeId, "INVITED");
      await repo.addEvent(tx, {
        employeeId,
        fromStatus: "NOT_INVITED",
        toStatus: "INVITED",
        actorAccountId: ctx.actor.accountId,
      });
    }
    await writeAudit(
      {
        ...auditBase(ctx),
        action: "employee.onboarding.invite_queued",
        entityType: "employee.employee",
        entityId: employeeId,
      },
      tx,
    );
  });
  return { employeeId, queued: true };
}

/** D-045 poin 9: undang karyawan existing (tetap APPROVED, wajib melengkapi data kosong di bagian b). */
export async function inviteExisting(ctx: OnboardingContext, body: InviteExistingBody) {
  assertCanRun(ctx.actor);
  const ids = body.employees.map((e) => e.employeeId);
  const [rows, accounts, takenAccountEmails, takenPersonal] = await Promise.all([
    repo.findEmployeesForInvite(ids),
    getEmployeeAccountStates(ids),
    accountEmailsInUse(body.employees.map((e) => e.email)),
    repo.findTakenPersonalEmails(body.employees.map((e) => e.email)),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const hasAccount = new Set(accounts.map((a) => a.employeeId));
  const skipped: { employeeId: string; code: string; message: string }[] = [];
  const skip = (employeeId: string, code: string, message: string) =>
    skipped.push({ employeeId, code, message });
  const accepted: { employeeId: string; email: string; ownEmail: boolean }[] = [];
  const seen = new Set<string>();
  for (const { employeeId, email } of body.employees) {
    const row = byId.get(employeeId);
    if (!row || !policy.canOnboardInCompany(ctx.actor, row.companyId)) {
      skip(employeeId, "NOT_FOUND", "Karyawan tidak ditemukan.");
    } else if (row.onboardingStatus !== "APPROVED" || !row.isActive) {
      skip(employeeId, "NOT_ELIGIBLE", "Hanya karyawan aktif yang sudah terdaftar.");
    } else if (hasAccount.has(employeeId)) {
      skip(employeeId, "HAS_ACCOUNT", "Karyawan ini sudah punya akun login.");
    } else if (seen.has(email)) {
      skip(employeeId, "EMAIL_DUPLICATE", "Email ganda di daftar ini.");
    } else if (
      takenAccountEmails.has(email) ||
      (takenPersonal.includes(email) && row.personalEmail !== email)
    ) {
      skip(employeeId, "EMAIL_TAKEN", "Email sudah dipakai karyawan atau akun lain.");
    } else if (await repo.hasOpenInvitation(employeeId)) {
      skip(employeeId, "QUEUED", "Undangan masih dalam antrean.");
    } else {
      seen.add(email);
      accepted.push({ employeeId, email, ownEmail: row.personalEmail === email });
    }
  }
  await employeeRepo.withTransaction(async (tx) => {
    for (const { employeeId, email } of accepted) {
      await repo.updateForExistingInvite(tx, employeeId, {
        personalEmail: email,
        completionRequired: true,
      });
      await repo.queueInvitation(tx, { employeeId, email, queuedBy: ctx.actor.accountId });
      await writeAudit(
        {
          ...auditBase(ctx),
          action: "employee.onboarding.invite_existing",
          entityType: "employee.employee",
          entityId: employeeId,
          after: { completionRequired: true },
        },
        tx,
      );
    }
  });
  return { queued: accepted.length, skipped };
}

// ── Daftar calon (menu Penerimaan) ──────────────────────────────────────────────────────────────

export async function listCandidates(ctx: OnboardingContext, query: CandidateListQuery) {
  assertCanRun(ctx.actor);
  const scope = companyScope(ctx.actor);
  if (query.companyId && scope !== null && !scope.includes(query.companyId)) {
    return { rows: [] as OnboardingCandidateDto[], total: 0, counts: emptyCounts() };
  }
  const base: repo.CandidateWhere = {
    // Calon (belum APPROVED) + karyawan existing yang diundang melengkapi data (D-045 poin 9).
    OR: [{ onboardingStatus: { not: "APPROVED" } }, { completionRequired: true }],
    ...(scope === null ? {} : { companyId: { in: scope } }),
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.batchId ? { onboardingBatchId: query.batchId } : {}),
    ...(query.q
      ? {
          AND: [
            {
              OR: [
                { fullName: { contains: query.q, mode: "insensitive" as const } },
                { employeeNumber: { contains: query.q, mode: "insensitive" as const } },
                { personalEmail: { contains: query.q, mode: "insensitive" as const } },
              ],
            },
          ],
        }
      : {}),
  };
  const where: repo.CandidateWhere = query.status
    ? { AND: [base, { onboardingStatus: query.status }] }
    : base;
  const [{ rows, total }, grouped] = await Promise.all([
    repo.listCandidates(where, (query.page - 1) * query.pageSize, query.pageSize),
    repo.countCandidatesByStatus(base),
  ]);
  const ids = rows.map((r) => r.id);
  const [invitations, accounts] = await Promise.all([
    repo.latestInvitations(ids),
    getEmployeeAccountStates(ids),
  ]);
  const latest = new Map<string, (typeof invitations)[number]>();
  for (const inv of invitations) if (!latest.has(inv.employeeId)) latest.set(inv.employeeId, inv);
  const accountOf = new Map(accounts.map((a) => [a.employeeId, a]));
  const counts = emptyCounts();
  for (const g of grouped) counts[g.onboardingStatus] = g._count._all;
  return {
    rows: rows.map((r) => {
      const inv = latest.get(r.id);
      const account = accountOf.get(r.id);
      return {
        id: r.id,
        employeeNumber: r.employeeNumber,
        fullName: r.fullName,
        email: r.personalEmail ?? r.workEmail,
        companyId: r.companyId,
        positionId: r.positionId,
        employmentStatusId: r.employmentStatusId,
        joinDate: r.joinDate.toISOString().slice(0, 10),
        onboardingStatus: r.onboardingStatus,
        completionRequired: r.completionRequired,
        batchId: r.onboardingBatchId,
        invitation: inv
          ? {
              status: inv.status,
              sentAt: inv.sentAt?.toISOString() ?? null,
              errorCode: inv.lastErrorCode,
            }
          : null,
        account: account ? { hasLoggedIn: account.hasLoggedIn } : null,
      };
    }),
    total,
    counts,
  };
}

function emptyCounts() {
  return Object.fromEntries(ONBOARDING_STATUSES.map((s) => [s, 0])) as Record<
    OnboardingStatus,
    number
  >;
}

// ── Login pertama (dipanggil saat aktor dimuat) ─────────────────────────────────────────────────

export async function markActivatedOnLogin(employeeId: string): Promise<void> {
  await repo.activateIfInvited(employeeId);
}
