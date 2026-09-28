import type { Permission } from "@hris/shared";
import { type Actor, isGrantActive } from "../../core/access/index.ts";
import { writeAudit } from "../../core/audit.ts";
import { ConflictError } from "../../core/errors.ts";
import type { Permission as DbPermission } from "../../generated/prisma/client.ts";
import * as repository from "./iam.repository.ts";
import type { MeResponse } from "./iam.schema.ts";

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
