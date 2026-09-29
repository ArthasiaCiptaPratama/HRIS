import {
  isPermissionGrantableTo,
  PERMISSION_LABELS,
  type Permission,
  ROLE,
  ROLE_LABELS,
  type Role,
} from "@hris/shared";
import { type Actor, isGrantActive } from "../../core/access/index.ts";
import { listAuditLogs as listAuditLogRows, writeAudit } from "../../core/audit.ts";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../core/errors.ts";
import type { AuthAdmin } from "../../core/supabase-admin.ts";
import type { Permission as DbPermission } from "../../generated/prisma/client.ts";
import { notify } from "../notification/index.ts";
import * as policy from "./iam.policy.ts";
import * as repository from "./iam.repository.ts";
import type {
  AccountDto,
  AuditLogDto,
  CreateGrantInput,
  GrantDto,
  InviteAccountInput,
  ListAccountsQuery,
  ListAuditLogsQuery,
  ListGrantsQuery,
  MeResponse,
} from "./iam.schema.ts";

// Enum Prisma memakai nama TS (EMPLOYEE_PERSONAL_READ); kode publik mengikuti PLAN §4.2.
// Record memaksa pemetaan lengkap: izin baru di skema tanpa entri di sini = error typecheck.
export const PERMISSION_CODE: Record<DbPermission, Permission> = {
  EMPLOYEE_PERSONAL_READ: "employee.personal.read",
  EMPLOYEE_PERSONAL_WRITE: "employee.personal.write",
  EMPLOYEE_BANK_READ: "employee.bank.read",
  EMPLOYEE_BANK_WRITE: "employee.bank.write",
  EMPLOYEE_DOCUMENTS_READ: "employee.documents.read",
  EMPLOYEE_DOCUMENTS_WRITE: "employee.documents.write",
  CONTRACT_MANAGE: "contract.manage",
  PAYROLL_PERIOD_PREPARE: "payroll.period.prepare",
};
const DB_PERMISSION = Object.fromEntries(
  Object.entries(PERMISSION_CODE).map(([db, code]) => [code, db]),
) as Record<Permission, DbPermission>;

/** D-033: serah-terima Utama butuh password dimasukkan ulang paling lama 5 menit sebelumnya. */
export const PASSWORD_REAUTH_WINDOW_MS = 5 * 60 * 1000;

export interface RequestContext {
  actor: Actor;
  requestId?: string | undefined;
  ip?: string | undefined;
}

type AccountRow = NonNullable<Awaited<ReturnType<typeof repository.findAccountById>>>;
type GrantRow = NonNullable<Awaited<ReturnType<typeof repository.findGrantById>>>;

const toTarget = (a: AccountRow): policy.AccountTarget => ({
  accountId: a.id,
  role: a.role,
  isPrimarySuperAdmin: a.isPrimarySuperAdmin,
  isActive: a.isActive,
});

export function toAccountDto(a: AccountRow): AccountDto {
  return {
    id: a.id,
    email: a.email,
    role: a.role,
    isActive: a.isActive,
    isPrimarySuperAdmin: a.isPrimarySuperAdmin,
    employeeId: a.employeeId,
    lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}

function toGrantDto(g: GrantRow, now: Date): GrantDto {
  return {
    id: g.id,
    accountId: g.accountId,
    permission: PERMISSION_CODE[g.permission],
    expiresAt: g.expiresAt?.toISOString() ?? null,
    reason: g.reason,
    grantedBy: g.grantedBy,
    revokedAt: g.revokedAt?.toISOString() ?? null,
    revokedBy: g.revokedBy,
    isActive: isGrantActive(g, now),
    createdAt: g.createdAt.toISOString(),
  };
}

const skipTake = (q: { page: number; pageSize: number }) => ({
  skip: (q.page - 1) * q.pageSize,
  take: q.pageSize,
});

function auditBase(ctx: RequestContext) {
  return {
    actorAccountId: ctx.actor.accountId,
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
  };
}

async function loadTarget(id: string, tx?: repository.IamTx) {
  const account = await repository.findAccountById(id, tx);
  if (!account) throw new NotFoundError("Akun tidak ditemukan.");
  return account;
}

// PLAN §4.4: sistem menolak aksi apa pun yang membuat SUPER_ADMIN aktif menjadi nol.
async function assertAnotherActiveSuperAdmin(tx: repository.IamTx, excludeAccountId: string) {
  if ((await repository.countActiveSuperAdmins(tx, excludeAccountId)) === 0) {
    throw new BusinessRuleError("Aksi ditolak: harus selalu ada minimal satu SUPER_ADMIN aktif.");
  }
}

// ---------------------------------------------------------------------------
// Notifikasi (PLAN §5.6). Dipanggil SETELAH transaksi commit; notify() tidak pernah melempar.
// Isi tanpa data sensitif: hanya jenis perubahan, label izin/role, email akun terkait.

const DATE_ID = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});
const ACCOUNT_LINK = "/akun";
const MY_ACCESS_LINK = "/profil";

async function notifySuperAdmins(title: string, body: string) {
  const admins = await repository.listActiveSuperAdmins();
  await notify({
    recipients: admins.map((a) => ({ accountId: a.id, email: a.email })),
    type: "iam.super_admin_changed",
    title,
    body,
    link: ACCOUNT_LINK,
    email: true,
  });
}

async function notifyGrantee(
  account: { id: string; email: string },
  type: "iam.grant_created" | "iam.grant_revoked",
  permission: Permission,
  expiresAt: Date | null,
) {
  const label = PERMISSION_LABELS[permission];
  const created = type === "iam.grant_created";
  await notify({
    recipients: [{ accountId: account.id, email: account.email }],
    type,
    title: created ? "Anda mendapat izin akses baru" : "Izin akses Anda dicabut",
    body: created
      ? `Izin "${label}" diberikan${expiresAt ? ` sampai ${DATE_ID.format(expiresAt)}` : ""}.`
      : `Izin "${label}" tidak berlaku lagi.`,
    link: MY_ACCESS_LINK,
    email: true,
  });
}

/** Cron `grant-expiry` (CODEMAP §7): ingatkan pemilik grant yang kedaluwarsa dalam `withinDays` hari. */
export async function notifyExpiringGrants(now: Date = new Date(), withinDays = 3) {
  const until = new Date(now.getTime() + withinDays * 86_400_000);
  const grants = await repository.findGrantsExpiringBetween(now, until);
  let notified = 0;
  for (const grant of grants) {
    const result = await notify(
      {
        recipients: [{ accountId: grant.account.id, email: grant.account.email }],
        type: "iam.grant_expiring",
        title: "Izin akses Anda akan kedaluwarsa",
        body: `Izin "${PERMISSION_LABELS[PERMISSION_CODE[grant.permission]]}" berakhir ${DATE_ID.format(grant.expiresAt as Date)}.`,
        link: MY_ACCESS_LINK,
        dedupeKey: `grant-expiring:${grant.id}`,
        email: true,
      },
      now,
    );
    notified += result.created;
  }
  return { expiring: grants.length, notified };
}

// ---------------------------------------------------------------------------
// Aktor & profil sendiri

export async function loadActor(authUserId: string, now: Date = new Date()): Promise<Actor | null> {
  const account = await repository.findActiveAccountByAuthUserId(authUserId, now);
  if (!account) return null;
  return {
    accountId: account.id,
    authUserId: account.authUserId,
    email: account.email,
    role: account.role,
    employeeId: account.employeeId,
    isPrimarySuperAdmin: account.isPrimarySuperAdmin,
    grants: new Set(
      account.grants
        .filter((grant) => isGrantActive(grant, now))
        .map((g) => PERMISSION_CODE[g.permission]),
    ),
  };
}

export async function getMe(actor: Actor, now: Date = new Date()): Promise<MeResponse> {
  const account = await repository.touchLastLogin(actor.accountId, now);
  return {
    id: account.id,
    email: account.email,
    role: account.role,
    isPrimarySuperAdmin: account.isPrimarySuperAdmin,
    employeeId: account.employeeId,
    lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
    grants: account.grants
      .filter((grant) => isGrantActive(grant, now))
      .map((grant) => ({
        permission: PERMISSION_CODE[grant.permission],
        expiresAt: grant.expiresAt?.toISOString() ?? null,
      })),
  };
}

// ---------------------------------------------------------------------------
// Akun

export async function listAccounts(ctx: RequestContext, query: ListAccountsQuery) {
  if (!policy.canListAccounts(ctx.actor)) throw new ForbiddenError();
  const { skip, take } = skipTake(query);
  const { rows, total } = await repository.listAccounts(
    { role: query.role, isActive: query.isActive, q: query.q },
    skip,
    take,
  );
  return {
    data: rows.map(toAccountDto),
    meta: { page: query.page, pageSize: query.pageSize, total },
  };
}

export async function getAccount(ctx: RequestContext, id: string): Promise<AccountDto> {
  const account = await loadTarget(id);
  if (!policy.canViewAccount(ctx.actor, toTarget(account))) throw new ForbiddenError();
  return toAccountDto(account);
}

export async function inviteAccount(
  ctx: RequestContext,
  input: InviteAccountInput,
  deps: { authAdmin: AuthAdmin; redirectTo: string },
): Promise<AccountDto> {
  if (!policy.canInviteAccount(ctx.actor, input.role)) throw new ForbiddenError();
  const email = input.email.trim().toLowerCase();
  if (await repository.findAccountByEmail(email)) {
    throw new ConflictError("Email sudah terdaftar sebagai akun HRIS.");
  }
  // User Auth bisa sudah ada (mis. dari bootstrap/environment lain berbagi Auth staging, PLAN §3.3).
  const existingUser = await deps.authAdmin.findUserByEmail(email);
  const authUser = existingUser ?? (await deps.authAdmin.inviteUser(email, deps.redirectTo));
  const account = await repository.withTransaction(async (tx) => {
    const created = await repository.createAccount(tx, {
      authUserId: authUser.id,
      email,
      role: input.role,
    });
    await writeAudit(
      {
        ...auditBase(ctx),
        action: "iam.account.invite",
        entityType: "iam.account",
        entityId: created.id,
        after: { email, role: input.role, invitationEmailSent: !existingUser },
      },
      tx,
    );
    return created;
  });
  if (input.role === ROLE.SUPER_ADMIN) {
    await notifySuperAdmins(
      "SUPER_ADMIN baru diundang",
      `${email} diundang sebagai SUPER_ADMIN oleh ${ctx.actor.email}.`,
    );
  }
  return toAccountDto(account);
}

export async function changeRole(ctx: RequestContext, id: string, newRole: Role, now = new Date()) {
  let previousRole: Role = newRole;
  const result = await repository.withTransaction(async (tx) => {
    const target = await loadTarget(id, tx);
    if (!policy.canChangeRole(ctx.actor, toTarget(target), newRole)) throw new ForbiddenError();
    if (target.role === newRole) throw new ConflictError("Akun sudah memiliki role tersebut.");
    if (target.role === ROLE.SUPER_ADMIN && target.isActive) {
      await assertAnotherActiveSuperAdmin(tx, target.id);
    }
    previousRole = target.role;
    const updated = await repository.updateAccountRole(tx, target.id, newRole);
    // D-028: grant yang tidak berlaku untuk role baru dicabut supaya tidak "hidup kembali" bila role berubah lagi.
    const stale = (await repository.findActiveGrants(tx, target.id, now)).filter(
      (g) => !isPermissionGrantableTo(PERMISSION_CODE[g.permission], newRole),
    );
    await repository.revokeGrants(
      tx,
      stale.map((g) => g.id),
      ctx.actor.accountId,
      now,
    );
    await writeAudit(
      {
        ...auditBase(ctx),
        action: "iam.account.change_role",
        entityType: "iam.account",
        entityId: target.id,
        before: { role: target.role },
        after: { role: newRole, revokedGrants: stale.map((g) => PERMISSION_CODE[g.permission]) },
      },
      tx,
    );
    return toAccountDto(updated);
  });
  // PLAN §4.4: perubahan role SUPER_ADMIN → notifikasi ke semua SUPER_ADMIN.
  if (previousRole === ROLE.SUPER_ADMIN || newRole === ROLE.SUPER_ADMIN) {
    await notifySuperAdmins(
      "Perubahan role SUPER_ADMIN",
      `Role ${result.email} diubah dari ${ROLE_LABELS[previousRole]} menjadi ${ROLE_LABELS[newRole]} oleh ${ctx.actor.email}.`,
    );
  }
  return result;
}

export async function setAccountActive(
  ctx: RequestContext,
  id: string,
  isActive: boolean,
  deps: { authAdmin: AuthAdmin },
): Promise<AccountDto> {
  const result = await repository.withTransaction(async (tx) => {
    const target = await loadTarget(id, tx);
    if (!policy.canSetActive(ctx.actor, toTarget(target))) throw new ForbiddenError();
    if (target.isActive === isActive) {
      throw new ConflictError(isActive ? "Akun sudah aktif." : "Akun sudah nonaktif.");
    }
    if (!isActive && target.role === ROLE.SUPER_ADMIN)
      await assertAnotherActiveSuperAdmin(tx, target.id);
    const updated = await repository.setAccountActive(tx, target.id, isActive);
    await writeAudit(
      {
        ...auditBase(ctx),
        action: isActive ? "iam.account.reactivate" : "iam.account.deactivate",
        entityType: "iam.account",
        entityId: target.id,
        before: { isActive: target.isActive },
        after: { isActive },
      },
      tx,
    );
    // Di dalam transaksi: bila ban/unban Supabase gagal, perubahan DB & audit ikut dibatalkan.
    await deps.authAdmin.setBanned(target.authUserId, !isActive);
    return toAccountDto(updated);
  });
  if (result.role === ROLE.SUPER_ADMIN) {
    await notifySuperAdmins(
      isActive ? "SUPER_ADMIN diaktifkan kembali" : "SUPER_ADMIN dinonaktifkan",
      `Akun ${result.email} ${isActive ? "diaktifkan kembali" : "dinonaktifkan"} oleh ${ctx.actor.email}.`,
    );
  }
  return result;
}

export async function transferPrimary(
  ctx: RequestContext & { passwordAuthAt: Date | undefined },
  targetAccountId: string,
  now = new Date(),
) {
  // D-033: konfirmasi password = login ulang di klien; bukti dari klaim `amr` token.
  const fresh =
    ctx.passwordAuthAt !== undefined &&
    now.getTime() - ctx.passwordAuthAt.getTime() <= PASSWORD_REAUTH_WINDOW_MS;
  if (!ctx.actor.isPrimarySuperAdmin) throw new ForbiddenError();
  if (!fresh) {
    throw new ForbiddenError(
      "Konfirmasi password diperlukan. Masuk ulang lalu ulangi dalam 5 menit.",
    );
  }
  const result = await repository.withTransaction(async (tx) => {
    const target = await loadTarget(targetAccountId, tx);
    if (!policy.canTransferPrimary(ctx.actor, toTarget(target))) {
      throw new BusinessRuleError(
        "Status Utama hanya bisa diserahkan ke SUPER_ADMIN lain yang aktif.",
      );
    }
    // Urutan penting: index unik parsial hanya mengizinkan satu baris Utama.
    await repository.setPrimaryFlag(tx, ctx.actor.accountId, false);
    const updated = await repository.setPrimaryFlag(tx, target.id, true);
    await writeAudit(
      {
        ...auditBase(ctx),
        action: "iam.account.transfer_primary_super_admin",
        entityType: "iam.account",
        entityId: target.id,
        before: { primaryAccountId: ctx.actor.accountId },
        after: { primaryAccountId: target.id },
      },
      tx,
    );
    return toAccountDto(updated);
  });
  await notifySuperAdmins(
    "Status Super Admin Utama berpindah",
    `Status Utama diserahkan dari ${ctx.actor.email} kepada ${result.email}.`,
  );
  return result;
}

// ---------------------------------------------------------------------------
// Grant

export async function listGrants(ctx: RequestContext, query: ListGrantsQuery, now = new Date()) {
  if (!policy.canManageGrants(ctx.actor)) throw new ForbiddenError();
  const { skip, take } = skipTake(query);
  const { rows, total } = await repository.listGrants(
    {
      accountId: query.accountId,
      permission: query.permission ? DB_PERMISSION[query.permission] : undefined,
      active: query.active,
    },
    now,
    skip,
    take,
  );
  return {
    data: rows.map((g) => toGrantDto(g, now)),
    meta: { page: query.page, pageSize: query.pageSize, total },
  };
}

export async function createGrant(ctx: RequestContext, input: CreateGrantInput, now = new Date()) {
  if (!policy.canManageGrants(ctx.actor)) throw new ForbiddenError();
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    throw new BusinessRuleError("Masa berlaku grant harus di masa depan.");
  }
  const result = await repository.withTransaction(async (tx) => {
    const target = await loadTarget(input.accountId, tx);
    if (!policy.canGrantTo(ctx.actor, toTarget(target), input.permission)) {
      throw new BusinessRuleError(
        "Izin ini tidak bisa diberikan ke akun tersebut (role/status tidak sesuai).",
      );
    }
    const active = await repository.findActiveGrants(tx, target.id, now);
    if (active.some((g) => PERMISSION_CODE[g.permission] === input.permission)) {
      throw new ConflictError("Akun sudah memiliki grant aktif untuk izin ini.");
    }
    const grant = await repository.createGrant(tx, {
      accountId: target.id,
      permission: DB_PERMISSION[input.permission],
      expiresAt,
      reason: input.reason ?? null,
      grantedBy: ctx.actor.accountId,
    });
    await writeAudit(
      {
        ...auditBase(ctx),
        action: "iam.grant.create",
        entityType: "iam.permission_grant",
        entityId: grant.id,
        after: {
          accountId: target.id,
          permission: input.permission,
          expiresAt: input.expiresAt ?? null,
        },
        reason: input.reason ?? null,
      },
      tx,
    );
    return { dto: toGrantDto(grant, now), grantee: { id: target.id, email: target.email } };
  });
  await notifyGrantee(result.grantee, "iam.grant_created", input.permission, expiresAt);
  return result.dto;
}

export async function revokeGrant(
  ctx: RequestContext,
  id: string,
  reason: string | undefined,
  now = new Date(),
) {
  if (!policy.canManageGrants(ctx.actor)) throw new ForbiddenError();
  const result = await repository.withTransaction(async (tx) => {
    const grant = await repository.findGrantById(id, tx);
    if (!grant) throw new NotFoundError("Grant tidak ditemukan.");
    if (grant.revokedAt) throw new ConflictError("Grant sudah dicabut.");
    const revoked = await repository.revokeGrant(tx, grant.id, ctx.actor.accountId, now);
    await writeAudit(
      {
        ...auditBase(ctx),
        action: "iam.grant.revoke",
        entityType: "iam.permission_grant",
        entityId: grant.id,
        before: { accountId: grant.accountId, permission: PERMISSION_CODE[grant.permission] },
        reason: reason ?? null,
      },
      tx,
    );
    const owner = await loadTarget(grant.accountId, tx);
    return { dto: toGrantDto(revoked, now), grantee: { id: owner.id, email: owner.email } };
  });
  await notifyGrantee(result.grantee, "iam.grant_revoked", result.dto.permission, null);
  return result.dto;
}

// ---------------------------------------------------------------------------
// Audit log

export async function listAuditLogs(ctx: RequestContext, query: ListAuditLogsQuery) {
  if (!policy.canReadAuditLogs(ctx.actor)) throw new ForbiddenError();
  const { skip, take } = skipTake(query);
  const { rows, total } = await listAuditLogRows(
    {
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
      actorAccountId: query.actorAccountId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    },
    skip,
    take,
  );
  const data: AuditLogDto[] = rows.map((row) => ({
    id: row.id,
    actorAccountId: row.actorAccountId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    before: row.before ?? null,
    after: row.after ?? null,
    reason: row.reason,
    requestId: row.requestId,
    ip: row.ip,
    occurredAt: row.occurredAt.toISOString(),
  }));
  return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
}

// ---------------------------------------------------------------------------
// Bootstrap & pemulihan (script)

export type BootstrapOutcome = "created" | "promoted" | "unchanged";

// PLAN §4.4: akun Utama pertama dibuat lewat script bootstrap (bukan halaman pendaftaran).
// Idempoten: aman dijalankan ulang ke DB mana pun (PLAN §3.3).
export async function bootstrapPrimarySuperAdmin(input: {
  authUserId: string;
  email: string;
}): Promise<{ outcome: BootstrapOutcome; accountId: string }> {
  const email = input.email.trim().toLowerCase();
  return repository.withTransaction(async (tx) => {
    const primary = await repository.findPrimarySuperAdmin(tx);
    if (primary && primary.authUserId !== input.authUserId) {
      throw new ConflictError(
        "Sudah ada Super Admin Utama lain. Pemindahan status Utama hanya lewat recover-primary-admin.",
      );
    }
    if (primary) return { outcome: "unchanged" as const, accountId: primary.id };

    const existing = await repository.findAccountByAuthUserId(tx, input.authUserId);
    const account = existing
      ? await repository.promoteToPrimarySuperAdmin(tx, existing.id)
      : await repository.createPrimarySuperAdmin(tx, input.authUserId, email);
    await writeAudit(
      {
        actorAccountId: null,
        action: "iam.account.bootstrap_primary_super_admin",
        entityType: "iam.account",
        entityId: account.id,
        before: existing
          ? { role: existing.role, isPrimarySuperAdmin: existing.isPrimarySuperAdmin }
          : null,
        after: { role: account.role, isPrimarySuperAdmin: true, email: account.email },
        reason: "bootstrap-super-admin script",
      },
      tx,
    );
    return {
      outcome: existing ? ("promoted" as const) : ("created" as const),
      accountId: account.id,
    };
  });
}

// PLAN §4.4: pemulihan manual oleh developer bila akun Utama hilang; tidak bisa dari aplikasi.
export async function recoverPrimarySuperAdmin(input: { targetEmail: string; reason: string }) {
  const email = input.targetEmail.trim().toLowerCase();
  const result = await repository.withTransaction(async (tx) => {
    const target = await repository.findAccountByEmail(email, tx);
    if (!target) throw new NotFoundError("Akun tujuan tidak ditemukan.");
    if (target.role !== ROLE.SUPER_ADMIN || !target.isActive) {
      throw new BusinessRuleError("Akun tujuan harus SUPER_ADMIN yang aktif.");
    }
    const previous = await repository.findPrimarySuperAdmin(tx);
    if (previous?.id === target.id)
      return { outcome: "unchanged" as const, accountId: target.id, previousId: previous.id };
    if (previous) await repository.setPrimaryFlag(tx, previous.id, false);
    await repository.setPrimaryFlag(tx, target.id, true);
    await writeAudit(
      {
        actorAccountId: null,
        action: "iam.account.recover_primary_super_admin",
        entityType: "iam.account",
        entityId: target.id,
        before: { primaryAccountId: previous?.id ?? null },
        after: { primaryAccountId: target.id },
        reason: `recover-primary-admin script: ${input.reason}`,
      },
      tx,
    );
    return {
      outcome: "recovered" as const,
      accountId: target.id,
      previousId: previous?.id ?? null,
      email: target.email,
    };
  });
  if (result.outcome === "recovered") {
    await notifySuperAdmins(
      "Status Super Admin Utama dipulihkan",
      `Status Utama dipindahkan ke ${result.email} lewat script pemulihan. Alasan: ${input.reason}`,
    );
  }
  return result;
}

// ---------------------------------------------------------------------------
// Akun uji/dev lewat script (bukan dari aplikasi). Idempoten; tidak untuk SUPER_ADMIN (pakai bootstrap).

export async function provisionAccount(input: {
  authUserId: string;
  email: string;
  role: Exclude<Role, "SUPER_ADMIN">;
  employeeId: string | null;
}): Promise<{ outcome: "created" | "updated" | "unchanged"; accountId: string }> {
  const email = input.email.trim().toLowerCase();
  return repository.withTransaction(async (tx) => {
    const existing = await repository.findAccountByAuthUserId(tx, input.authUserId);
    if (existing?.role === ROLE.SUPER_ADMIN) {
      throw new ConflictError("Akun ini SUPER_ADMIN; tidak diubah oleh script akun dev.");
    }
    if (existing && existing.role === input.role && existing.employeeId === input.employeeId) {
      return { outcome: "unchanged" as const, accountId: existing.id };
    }
    const account = existing
      ? await repository.linkEmployee(
          tx,
          (await repository.updateAccountRole(tx, existing.id, input.role)).id,
          input.employeeId,
        )
      : await repository.linkEmployee(
          tx,
          (
            await repository.createAccount(tx, {
              authUserId: input.authUserId,
              email,
              role: input.role,
            })
          ).id,
          input.employeeId,
        );
    await writeAudit(
      {
        actorAccountId: null,
        action: "iam.account.provision_script",
        entityType: "iam.account",
        entityId: account.id,
        before: existing ? { role: existing.role, employeeId: existing.employeeId } : null,
        after: { email, role: input.role, employeeId: input.employeeId },
        reason: "create-dev-account script",
      },
      tx,
    );
    return {
      outcome: existing ? ("updated" as const) : ("created" as const),
      accountId: account.id,
    };
  });
}

// ── Dipakai modul employee lewat index.ts (D-035) ─────────────────────────────

export interface EmployeeAccountLink {
  accountId: string;
  role: Role;
  isActive: boolean;
}

export async function getAccountLinksForEmployees(
  employeeIds: string[],
): Promise<Map<string, EmployeeAccountLink>> {
  const rows = await repository.findAccountsByEmployeeIds([...new Set(employeeIds)]);
  return new Map(
    rows.map((row) => [
      row.employeeId as string,
      { accountId: row.id, role: row.role, isActive: row.isActive },
    ]),
  );
}

export interface AccountSummary {
  accountId: string;
  employeeId: string | null;
  role: Role;
  email: string;
}

/** Pelaku perubahan (mis. riwayat kepegawaian "diubah oleh"): akun yang sudah dihapus tidak ada di map. */
export async function getAccountSummaries(
  accountIds: string[],
): Promise<Map<string, AccountSummary>> {
  const rows = await repository.findAccountsByIds([...new Set(accountIds)]);
  return new Map(
    rows.map((row) => [
      row.id,
      { accountId: row.id, employeeId: row.employeeId, role: row.role, email: row.email },
    ]),
  );
}

/** PLAN §4.1: manager_id wajib menunjuk ke karyawan ber-akun MANAGER/SUPER_ADMIN (aktif). */
export async function listManagerEmployeeIds(): Promise<string[]> {
  return repository.findEmployeeIdsByRoles({ in: [ROLE.MANAGER, ROLE.SUPER_ADMIN] });
}

export type AccountDeactivationOutcome = "none" | "already_inactive" | "deactivated";

/**
 * PLAN §4.5 + D-035: karyawan nonaktif tidak bisa login → akun yang tertaut ikut dinonaktifkan
 * (+ ban Supabase) di transaksi pemanggil. Aturan D-034 tetap berlaku: bila aktor tidak boleh
 * menonaktifkan akun itu (mis. SUPER_ADMIN), seluruh aksi ditolak.
 */
export async function deactivateAccountOfEmployee(
  ctx: RequestContext,
  employeeId: string,
  deps: { authAdmin: AuthAdmin },
  tx: repository.IamTx,
): Promise<AccountDeactivationOutcome> {
  const account = await repository.findAccountByEmployeeId(tx, employeeId);
  if (!account) return "none";
  if (!account.isActive) return "already_inactive";
  if (!policy.canSetActive(ctx.actor, toTarget(account))) {
    throw new BusinessRuleError(
      `Karyawan ini memiliki akun ${ROLE_LABELS[account.role]} yang tidak boleh Anda nonaktifkan. ` +
        "Minta Super Admin Utama menonaktifkan akunnya lebih dulu.",
    );
  }
  if (account.role === ROLE.SUPER_ADMIN) await assertAnotherActiveSuperAdmin(tx, account.id);
  await repository.setAccountActive(tx, account.id, false);
  await writeAudit(
    {
      ...auditBase(ctx),
      action: "iam.account.deactivate",
      entityType: "iam.account",
      entityId: account.id,
      before: { isActive: true },
      after: { isActive: false, cause: "employee.deactivate" },
    },
    tx,
  );
  // Terakhir: bila ban Supabase gagal, transaksi pemanggil dibatalkan seluruhnya.
  await deps.authAdmin.setBanned(account.authUserId, true);
  return "deactivated";
}
