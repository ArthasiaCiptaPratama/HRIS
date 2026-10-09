import { describe, expect, test } from "bun:test";
import type { Permission, Role } from "@hris/shared";
import type { Actor } from "../../../core/access/index.ts";
import {
  type AccountTarget,
  canAssignCompanies,
  canChangeRole,
  canGrantTo,
  canInviteAccount,
  canListAccounts,
  canManageGrants,
  canManageOwnDashboardLayout,
  canReadAuditLogs,
  canSetActive,
  canTransferPrimary,
  canViewAccount,
} from "../iam.policy.ts";

// Matriks akses IAM (PLAN §4.3 "Akun & sistem", §4.4 Super Admin Utama, D-028, keputusan 2026-09-28:
// HR hanya menonaktifkan EMPLOYEE & MANAGER; tidak ada yang mengubah/menonaktifkan dirinya sendiri).
type Who = "UTAMA" | "SA" | "HR" | "MGR" | "EMP";

function actor(who: Who, id = `acc-${who}`): Actor {
  const role: Role =
    who === "UTAMA" || who === "SA"
      ? "SUPER_ADMIN"
      : who === "HR"
        ? "HR_ADMIN"
        : who === "MGR"
          ? "MANAGER"
          : "EMPLOYEE";
  return {
    accountId: id,
    authUserId: `auth-${id}`,
    email: `${id}@example.test`,
    role,
    employeeId: null,
    isPrimarySuperAdmin: who === "UTAMA",
    grants: new Set<Permission>(),
    companyIds: who === "SA" || who === "UTAMA" ? null : new Set<string>(),
  };
}

// D-065: susunan dashboard milik akun sendiri — hanya role yang melihat dashboard agregat (SA/HR).
describe("susunan dashboard", () => {
  test.each([
    ["UTAMA", true],
    ["SA", true],
    ["HR", true],
    ["MGR", false],
    ["EMP", false],
  ] as const)("canManageOwnDashboardLayout %s = %s", (who, allowed) => {
    expect(canManageOwnDashboardLayout(actor(who))).toBe(allowed);
  });
});

function target(role: Role, extra: Partial<AccountTarget> = {}): AccountTarget {
  return {
    accountId: `target-${role}`,
    role,
    isPrimarySuperAdmin: false,
    isActive: true,
    ...extra,
  };
}

const SELF = (who: Who): AccountTarget => ({
  accountId: `acc-${who}`,
  role: actor(who).role,
  isPrimarySuperAdmin: who === "UTAMA",
  isActive: true,
});

describe("daftar & detail akun", () => {
  test.each([
    ["UTAMA", true],
    ["SA", true],
    ["HR", true],
    ["MGR", false],
    ["EMP", false],
  ] as const)("%s melihat daftar akun = %p", (who, ok) => {
    expect(canListAccounts(actor(who))).toBe(ok);
    expect(canViewAccount(actor(who), target("EMPLOYEE"))).toBe(ok);
  });

  test("setiap akun boleh melihat akunnya sendiri", () => {
    for (const who of ["MGR", "EMP"] as const)
      expect(canViewAccount(actor(who), SELF(who))).toBe(true);
  });
});

describe("undang akun (PLAN §4.3: SA ✅ HR ✅; role SUPER_ADMIN hanya Utama)", () => {
  test.each([
    ["UTAMA", "SUPER_ADMIN", true],
    ["UTAMA", "HR_ADMIN", true],
    ["SA", "SUPER_ADMIN", false],
    ["SA", "HR_ADMIN", true],
    ["SA", "MANAGER", true],
    ["SA", "EMPLOYEE", true],
    ["HR", "EMPLOYEE", true],
    ["HR", "MANAGER", false],
    ["HR", "HR_ADMIN", false],
    ["MGR", "EMPLOYEE", false],
    ["EMP", "EMPLOYEE", false],
  ] as const)("%s mengundang %s = %p", (who, role, ok) => {
    expect(canInviteAccount(actor(who), role)).toBe(ok);
  });
});

describe("ubah role (D-028; §4.4 hak eksklusif Utama)", () => {
  test.each([
    ["SA", "EMPLOYEE", "MANAGER", true],
    ["SA", "MANAGER", "HR_ADMIN", true],
    ["SA", "HR_ADMIN", "EMPLOYEE", true],
    ["SA", "EMPLOYEE", "SUPER_ADMIN", false],
    ["SA", "SUPER_ADMIN", "EMPLOYEE", false],
    ["UTAMA", "EMPLOYEE", "SUPER_ADMIN", true],
    ["UTAMA", "SUPER_ADMIN", "HR_ADMIN", true],
    ["HR", "EMPLOYEE", "MANAGER", false],
    ["MGR", "EMPLOYEE", "MANAGER", false],
    ["EMP", "EMPLOYEE", "MANAGER", false],
  ] as const)("%s: %s → %s = %p", (who, from, to, ok) => {
    expect(canChangeRole(actor(who), target(from), to)).toBe(ok);
  });

  test("akun Utama tidak bisa diubah akun lain", () => {
    expect(
      canChangeRole(actor("SA"), target("SUPER_ADMIN", { isPrimarySuperAdmin: true }), "EMPLOYEE"),
    ).toBe(false);
  });

  test("tidak ada yang mengubah role dirinya sendiri (termasuk Utama)", () => {
    expect(canChangeRole(actor("SA"), SELF("SA"), "HR_ADMIN")).toBe(false);
    expect(canChangeRole(actor("UTAMA"), SELF("UTAMA"), "HR_ADMIN")).toBe(false);
  });
});

describe("nonaktifkan / aktifkan kembali akun", () => {
  test.each([
    ["SA", "EMPLOYEE", true],
    ["SA", "MANAGER", true],
    ["SA", "HR_ADMIN", true],
    ["SA", "SUPER_ADMIN", false],
    ["UTAMA", "SUPER_ADMIN", true],
    ["HR", "EMPLOYEE", true],
    ["HR", "MANAGER", true],
    ["HR", "HR_ADMIN", false],
    ["HR", "SUPER_ADMIN", false],
    ["MGR", "EMPLOYEE", false],
    ["EMP", "EMPLOYEE", false],
  ] as const)("%s → akun %s = %p", (who, role, ok) => {
    expect(canSetActive(actor(who), target(role))).toBe(ok);
  });

  test("akun Utama tidak bisa dinonaktifkan siapa pun, diri sendiri pun tidak", () => {
    expect(canSetActive(actor("SA"), target("SUPER_ADMIN", { isPrimarySuperAdmin: true }))).toBe(
      false,
    );
    expect(canSetActive(actor("UTAMA"), SELF("UTAMA"))).toBe(false);
    expect(canSetActive(actor("HR"), SELF("HR"))).toBe(false);
  });
});

describe("serah-terima status Utama (§4.4)", () => {
  test("hanya Utama, ke SUPER_ADMIN lain yang aktif", () => {
    expect(canTransferPrimary(actor("UTAMA"), target("SUPER_ADMIN"))).toBe(true);
    expect(canTransferPrimary(actor("SA"), target("SUPER_ADMIN"))).toBe(false);
    expect(canTransferPrimary(actor("UTAMA"), target("HR_ADMIN"))).toBe(false);
    expect(canTransferPrimary(actor("UTAMA"), target("SUPER_ADMIN", { isActive: false }))).toBe(
      false,
    );
    expect(canTransferPrimary(actor("UTAMA"), SELF("UTAMA"))).toBe(false);
  });
});

describe("grant izin (§4.2: hanya SA; hanya ke HR_ADMIN/MANAGER sesuai daftar)", () => {
  test.each([
    ["SA", true],
    ["UTAMA", true],
    ["HR", false],
    ["MGR", false],
    ["EMP", false],
  ] as const)("%s mengelola grant = %p", (who, ok) => {
    expect(canManageGrants(actor(who))).toBe(ok);
  });

  test.each([
    ["HR_ADMIN", "employee.personal.read", true],
    ["HR_ADMIN", "contract.manage", true],
    ["MANAGER", "employee.bank.read", true],
    ["MANAGER", "contract.manage", false],
    ["MANAGER", "payroll.period.prepare", false],
    ["EMPLOYEE", "employee.personal.read", false],
    ["SUPER_ADMIN", "employee.personal.read", false],
  ] as const)("grant ke %s: %s = %p", (role, permission, ok) => {
    expect(canGrantTo(actor("SA"), target(role), permission)).toBe(ok);
  });

  test("tidak ke akun nonaktif, dan HR tidak bisa memberi grant", () => {
    expect(
      canGrantTo(actor("SA"), target("HR_ADMIN", { isActive: false }), "employee.personal.read"),
    ).toBe(false);
    expect(canGrantTo(actor("HR"), target("MANAGER"), "employee.personal.read")).toBe(false);
  });
});

describe("audit log (§4.3: hanya SUPER_ADMIN)", () => {
  test.each([
    ["UTAMA", true],
    ["SA", true],
    ["HR", false],
    ["MGR", false],
    ["EMP", false],
  ] as const)("%s = %p", (who, ok) => {
    expect(canReadAuditLogs(actor(who))).toBe(ok);
  });
});

// D-040: HR_ADMIN hanya akun karyawan di PT yang ditugaskan (akun belum tertaut karyawan tetap terlihat);
// penugasan PT hanya oleh SUPER_ADMIN dan hanya untuk akun HR_ADMIN.
describe("D-040 cakupan perusahaan akun", () => {
  const hrA = { ...actor("HR"), companyIds: new Set(["co-A"]) };
  const emp = (companyId: string | null) => target("EMPLOYEE", { companyId });

  test.each([
    ["co-A", true],
    ["co-B", false],
    [null, true],
  ] as const)("HR PT co-A → akun karyawan PT %s: lihat & nonaktifkan = %p", (companyId, ok) => {
    expect(canViewAccount(hrA, emp(companyId))).toBe(ok);
    expect(canSetActive(hrA, emp(companyId))).toBe(ok);
  });

  test("SA melihat & menonaktifkan akun PT mana pun", () => {
    expect(canViewAccount(actor("SA"), emp("co-B"))).toBe(true);
    expect(canSetActive(actor("SA"), emp("co-B"))).toBe(true);
  });

  test.each([
    ["SA", "HR_ADMIN", true],
    ["UTAMA", "HR_ADMIN", true],
    ["SA", "MANAGER", false],
    ["SA", "SUPER_ADMIN", false],
    ["HR", "HR_ADMIN", false],
    ["MGR", "HR_ADMIN", false],
  ] as const)("canAssignCompanies %s → akun %s = %p", (who, role, ok) => {
    expect(canAssignCompanies(actor(who), target(role))).toBe(ok);
  });
});
