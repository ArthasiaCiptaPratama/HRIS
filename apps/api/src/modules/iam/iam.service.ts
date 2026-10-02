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
import { getMasterLookup } from "../organization/index.ts";
import * as policy from "./iam.policy.ts";
import * as repository from "./iam.repository.ts";
import type {
  AccountDto,
  AssignCompaniesInput,
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
  EMPLOYEE_ONBOARDING_REVIEW: "employee.onboarding.review",
};
const DB_PERMISSION = Object.fromEntries(
  Object.entries(PERMISSION_CODE).map(([db, code]) => [code, db]),
) as Record<Permission, DbPermission>;

/** D-033: serah-terima Utama butuh password dimasukkan ulang paling lama 5 menit sebelumnya. */
export const PASSWORD_REAUTH_WINDOW_MS = 5 * 60 * 1000;

// D-040: cakupan PT untuk akun yang tertaut karyawan. Data ada di modul employee, yang sudah
// meng-import iam — jadi disuntik lewat app.ts (PLAN §3.2: iam tidak membaca tabel employee).
export interface IamEmployeeScope {
  companyOfEmployees(employeeIds: string[]): Promise<Map<string, string>>;
  employeeIdsInCompanies(companyIds: string[]): Promise<string[]>;
  /** Label karyawan untuk audit log: "Nama (nomor induk)". */
  employeeLabels(employeeIds: string[]): Promise<Map<string, string>>;
}

let employeeScope: IamEmployeeScope | undefined;

export function configureIam(next: { employeeScope: IamEmployeeScope }): void {
  employeeScope = next.employeeScope;
}

function scopeSource(): IamEmployeeScope {
  // Gagal tertutup: tanpa konfigurasi, cakupan HR tidak bisa dipastikan.
  if (!employeeScope) throw new Error("iam: employeeScope belum dikonfigurasi (configureIam)");
  return employeeScope;
}

export interface RequestContext {
  actor: Actor;
  requestId?: string | undefined;
  ip?: string | undefined;
}

type AccountRow = NonNullable<Awaited<ReturnType<typeof repository.findAccountById>>>;
type GrantRow = NonNullable<Awaited<ReturnType<typeof repository.findGrantById>>>;

const toTarget = (a: AccountRow, companyId: string | null = null): policy.AccountTarget => ({
  accountId: a.id,
  role: a.role,
  isPrimarySuperAdmin: a.isPrimarySuperAdmin,
  isActive: a.isActive,
  companyId,
});

/** Target lengkap dengan PT karyawan tertaut (D-040). */
async function scopedTarget(a: AccountRow): Promise<policy.AccountTarget> {
  if (!a.employeeId) return toTarget(a);
  const companies = await scopeSource().companyOfEmployees([a.employeeId]);
  return toTarget(a, companies.get(a.employeeId) ?? null);
}

/** DTO akun + penugasan PT (satu query untuk banyak akun). */
async function accountDtos(rows: AccountRow[], tx?: repository.IamTx): Promise<AccountDto[]> {
  const assignments = await repository.findCompanyAssignments(
    rows.map((row) => row.id),
    tx,
  );
  const byAccount = new Map<string, string[]>();
  for (const { accountId, companyId } of assignments) {
    byAccount.set(accountId, [...(byAccount.get(accountId) ?? []), companyId]);
  }
  return rows.map((row) => toAccountDto(row, byAccount.get(row.id) ?? []));
}

export function toAccountDto(a: AccountRow, companyIds: string[] = []): AccountDto {
  return {
    id: a.id,
    email: a.email,
    role: a.role,
    isActive: a.isActive,
    isPrimarySuperAdmin: a.isPrimarySuperAdmin,
    employeeId: a.employeeId,
    companyIds,
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
    // D-040: SUPER_ADMIN semua PT; HR_ADMIN PT yang ditugaskan. MANAGER/EMPLOYEE dilengkapi modul
    // employee (PT tempat ia terdaftar) lewat app.ts — iam tidak membaca tabel employee (PLAN §3.2).
    companyIds:
      account.role === "SUPER_ADMIN"
        ? null
        : account.role === "HR_ADMIN"
          ? new Set(account.companies.map((c) => c.companyId))
          : new Set<string>(),
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
    onboarding: actor.onboarding ?? null,
  };
}

// ---------------------------------------------------------------------------
// Akun

export async function listAccounts(ctx: RequestContext, query: ListAccountsQuery) {
  if (!policy.canListAccounts(ctx.actor)) throw new ForbiddenError();
  const { skip, take } = skipTake(query);
  // D-040: HR hanya akun karyawan di PT yang ditugaskan (+ akun yang belum tertaut karyawan).
  const employeeScopeFilter =
    ctx.actor.role === ROLE.HR_ADMIN
      ? {
          employeeScope: {
            employeeIds: await scopeSource().employeeIdsInCompanies([
              ...(ctx.actor.companyIds ?? []),
            ]),
          },
        }
      : {};
  const { rows, total } = await repository.listAccounts(
    { role: query.role, isActive: query.isActive, q: query.q, ...employeeScopeFilter },
    skip,
    take,
  );
  return {
    data: await accountDtos(rows),
    meta: { page: query.page, pageSize: query.pageSize, total },
  };
}

export async function getAccount(ctx: RequestContext, id: string): Promise<AccountDto> {
  const account = await loadTarget(id);
  if (!policy.canViewAccount(ctx.actor, await scopedTarget(account))) {
    // PROMPT §5: akun di luar cakupan PT HR = tidak boleh diketahui keberadaannya.
    if (policy.canListAccounts(ctx.actor)) throw new NotFoundError("Akun tidak ditemukan.");
    throw new ForbiddenError();
  }
  return (await accountDtos([account]))[0] as AccountDto;
}

export async function inviteAccount(
  ctx: RequestContext,
  input: InviteAccountInput,
  deps: { authAdmin: AuthAdmin; redirectTo: string },
): Promise<AccountDto> {
  if (!policy.canInviteAccount(ctx.actor, input.role)) throw new ForbiddenError();
  const email = input.email.trim().toLowerCase();
  if (await repository.findAccountByEmail(email)) {
    throw new ConflictError("Email sudah terdaftar sebagai akun Akselerasi Arthasia.");
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
    // D-040: penugasan PT hanya berarti untuk HR_ADMIN → dicabut bila role berubah dari HR_ADMIN.
    const removedCompanies =
      newRole === ROLE.HR_ADMIN
        ? []
        : (await repository.findCompanyAssignments([target.id], tx)).map((a) => a.companyId);
    if (removedCompanies.length > 0) {
      await repository.replaceCompanyAssignments(tx, target.id, [], ctx.actor.accountId);
    }
    await writeAudit(
      {
        ...auditBase(ctx),
        action: "iam.account.change_role",
        entityType: "iam.account",
        entityId: target.id,
        before: { role: target.role },
        after: {
          role: newRole,
          revokedGrants: stale.map((g) => PERMISSION_CODE[g.permission]),
          ...(removedCompanies.length > 0 ? { removedCompanyIds: removedCompanies } : {}),
        },
      },
      tx,
    );
    return (await accountDtos([updated], tx))[0] as AccountDto;
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
    const scoped = await scopedTarget(target);
    if (!policy.canViewAccount(ctx.actor, scoped)) throw new NotFoundError("Akun tidak ditemukan.");
    if (!policy.canSetActive(ctx.actor, scoped)) throw new ForbiddenError();
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
    return (await accountDtos([updated], tx))[0] as AccountDto;
  });
  if (result.role === ROLE.SUPER_ADMIN) {
    await notifySuperAdmins(
      isActive ? "SUPER_ADMIN diaktifkan kembali" : "SUPER_ADMIN dinonaktifkan",
      `Akun ${result.email} ${isActive ? "diaktifkan kembali" : "dinonaktifkan"} oleh ${ctx.actor.email}.`,
    );
  }
  return result;
}

// D-040: set penugasan PT akun HR_ADMIN (hanya SUPER_ADMIN) + audit + notifikasi ke akun itu.
export async function assignCompanies(
  ctx: RequestContext,
  id: string,
  input: AssignCompaniesInput,
): Promise<AccountDto> {
  const lookup = await getMasterLookup();
  for (const companyId of input.companyIds) {
    const company = lookup.companies.get(companyId);
    if (!company || company.deleted) {
      throw new BusinessRuleError("Perusahaan tidak ditemukan atau sudah tidak aktif.");
    }
  }
  const { dto, changed } = await repository.withTransaction(async (tx) => {
    const target = await loadTarget(id, tx);
    if (!policy.canAssignCompanies(ctx.actor, toTarget(target))) throw new ForbiddenError();
    const before = (await repository.findCompanyAssignments([target.id], tx)).map(
      (a) => a.companyId,
    );
    const same =
      before.length === input.companyIds.length &&
      input.companyIds.every((companyId) => before.includes(companyId));
    if (!same) {
      await repository.replaceCompanyAssignments(
        tx,
        target.id,
        input.companyIds,
        ctx.actor.accountId,
      );
      await writeAudit(
        {
          ...auditBase(ctx),
          action: "iam.account.assign_companies",
          entityType: "iam.account",
          entityId: target.id,
          before: { companyIds: before },
          after: { companyIds: input.companyIds },
        },
        tx,
      );
    }
    return { dto: toAccountDto(target, input.companyIds), changed: !same };
  });
  if (changed) {
    const codes = input.companyIds.map((companyId) => lookup.companies.get(companyId)?.code ?? "?");
    await notify({
      recipients: [{ accountId: dto.id, email: dto.email }],
      type: "iam.companies_assigned",
      title: "Penugasan perusahaan Anda diperbarui",
      body:
        codes.length > 0
          ? `Anda sekarang mengelola karyawan perusahaan: ${codes.join(", ")}.`
          : "Anda tidak lagi ditugaskan ke perusahaan mana pun.",
      link: "/personal/pegawai-aktif/semua",
      email: true,
    });
  }
  return dto;
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
  // Label terbaca: email aktor & akun (tabel milik iam); nama karyawan lewat penyaring yang disuntik.
  const accountIds = new Set<string>();
  const employeeIds = new Set<string>();
  for (const row of rows) {
    if (row.actorAccountId) accountIds.add(row.actorAccountId);
    if (row.entityId && row.entityType === "iam.account") accountIds.add(row.entityId);
    if (row.entityId && row.entityType === "employee.employee") employeeIds.add(row.entityId);
  }
  const [accounts, employees] = await Promise.all([
    repository.findAccountsByIds([...accountIds]),
    employeeIds.size > 0
      ? scopeSource().employeeLabels([...employeeIds])
      : new Map<string, string>(),
  ]);
  const emailOf = new Map(accounts.map((a) => [a.id, a.email]));
  const entityLabel = (type: string, id: string | null) => {
    if (!id) return null;
    if (type === "iam.account") return emailOf.get(id) ?? null;
    if (type === "employee.employee") return employees.get(id) ?? null;
    return null;
  };
  const data: AuditLogDto[] = rows.map((row) => ({
    id: row.id,
    actorAccountId: row.actorAccountId,
    actorEmail: row.actorAccountId ? (emailOf.get(row.actorAccountId) ?? null) : null,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    entityLabel: entityLabel(row.entityType, row.entityId),
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

/** D-045 d: calon dipulihkan → akun calon aktif lagi (+ ban Supabase dibuka), di transaksi pemanggil. */
export async function reactivateAccountOfEmployee(
  ctx: RequestContext,
  employeeId: string,
  deps: { authAdmin: AuthAdmin },
  tx: repository.IamTx,
): Promise<"none" | "already_active" | "reactivated"> {
  const account = await repository.findAccountByEmployeeId(tx, employeeId);
  if (!account) return "none";
  if (account.isActive) return "already_active";
  await repository.setAccountActive(tx, account.id, true);
  await writeAudit(
    {
      ...auditBase(ctx),
      action: "iam.account.reactivate",
      entityType: "iam.account",
      entityId: account.id,
      before: { isActive: false },
      after: { isActive: true, cause: "employee.onboarding.restore" },
    },
    tx,
  );
  await deps.authAdmin.setBanned(account.authUserId, false);
  return "reactivated";
}

/**
 * D-045 d (design §11): hapus permanen akun calon batal > 30 hari. User Supabase Auth TIDAK dihapus
 * (PLAN §3.2.7): tetap di-ban & emailnya diganti alamat anonim supaya email pribadi bisa dipakai lagi.
 * Mengembalikan alamat yang pernah dipakai akun (untuk membersihkan notifikasi/antrean email).
 */
export async function purgeAccountOfEmployee(
  employeeId: string,
  deps: { authAdmin: AuthAdmin; anonymousDomain: string },
  tx: repository.IamTx,
): Promise<{ accountId: string; emails: string[] } | null> {
  const account = await repository.findAccountByEmployeeId(tx, employeeId);
  if (!account) return null;
  await repository.deleteAccount(tx, account.id);
  await deps.authAdmin.setBanned(account.authUserId, true);
  await deps.authAdmin.updateUserEmail(
    account.authUserId,
    `deleted-${crypto.randomUUID()}@${deps.anonymousDomain}`,
  );
  return {
    accountId: account.id,
    emails: [account.email, account.loginEmail].filter((e): e is string => Boolean(e)),
  };
}

// ── D-045: undangan akun untuk calon/karyawan dari onboarding (dipanggil modul employee) ─────────

export type EmployeeInviteOutcome =
  | { ok: true; accountId: string; emailSent: boolean }
  | { ok: false; code: "EMAIL_HAS_ACCOUNT" | "EMPLOYEE_HAS_ACCOUNT" | "INVITE_FAILED" };

/**
 * Undang lewat Supabase Auth lalu buat akun EMPLOYEE yang tertaut karyawan (satu transaksi + audit).
 * Hasil berupa kode (bukan exception) supaya antrean undangan mencatat kegagalan per calon. User Auth
 * yang sudah ada (lingkungan lain berbagi Auth staging, D-023) dipakai ulang tanpa email.
 */
export async function inviteEmployeeAccount(input: {
  email: string;
  employeeId: string;
  actorAccountId: string | null;
  authAdmin: AuthAdmin;
  redirectTo: string;
  requestId?: string | null;
}): Promise<EmployeeInviteOutcome> {
  const email = input.email.trim().toLowerCase();
  if (await repository.findAccountByEmail(email)) return { ok: false, code: "EMAIL_HAS_ACCOUNT" };
  const linked = await repository.findAccountsForEmployees([input.employeeId]);
  if (linked.length > 0) return { ok: false, code: "EMPLOYEE_HAS_ACCOUNT" };
  let authUser: { id: string };
  let emailSent = false;
  try {
    const existing = await input.authAdmin.findUserByEmail(email);
    if (existing) authUser = existing;
    else {
      authUser = await input.authAdmin.inviteUser(email, input.redirectTo);
      emailSent = true;
    }
  } catch {
    return { ok: false, code: "INVITE_FAILED" };
  }
  const account = await repository.withTransaction(async (tx) => {
    const created = await repository.createEmployeeAccount(tx, {
      authUserId: authUser.id,
      email,
      employeeId: input.employeeId,
    });
    await writeAudit(
      {
        actorAccountId: input.actorAccountId,
        requestId: input.requestId ?? null,
        action: "iam.account.invite",
        entityType: "iam.account",
        entityId: created.id,
        after: { role: "EMPLOYEE", employeeId: input.employeeId, source: "onboarding", emailSent },
      },
      tx,
    );
    return created;
  });
  return { ok: true, accountId: account.id, emailSent };
}

/** Email login yang sudah dipakai akun lain (pratinjau penerimaan, D-045). */
export async function accountEmailsInUse(emails: string[]): Promise<Set<string>> {
  const rows = await repository.findAccountEmails(emails.map((e) => e.toLowerCase()));
  return new Set(rows.map((row) => row.email.toLowerCase()));
}

export interface EmployeeAccountState {
  employeeId: string;
  accountId: string;
  email: string;
  hasLoggedIn: boolean;
  isActive: boolean;
}

/** Status akun per karyawan (daftar penerimaan & kirim ulang). */
/**
 * D-047: penerima notifikasi "data onboarding menunggu review" — semua SUPER_ADMIN aktif + HR_ADMIN
 * aktif yang ditugaskan di PT itu dan memegang grant `employee.onboarding.review` yang berlaku.
 */
export async function listOnboardingReviewers(
  companyId: string,
  now: Date = new Date(),
): Promise<{ accountId: string; email: string }[]> {
  const [admins, hrs] = await Promise.all([
    repository.listActiveSuperAdmins(),
    repository.findOnboardingReviewerHrs(companyId, now),
  ]);
  return [...admins, ...hrs].map((a) => ({ accountId: a.id, email: a.email }));
}

export async function getEmployeeAccountStates(
  employeeIds: string[],
): Promise<EmployeeAccountState[]> {
  const rows = await repository.findAccountsForEmployees(employeeIds);
  return rows.map((row) => ({
    employeeId: row.employeeId as string,
    accountId: row.id,
    email: row.email,
    hasLoggedIn: row.lastLoginAt !== null,
    isActive: row.isActive,
  }));
}
