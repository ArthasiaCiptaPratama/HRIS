import { describe, expect, test } from "bun:test";
import type { Role } from "@hris/shared";
import type { Actor } from "../../../core/access/index.ts";
import {
  canManageMasterData,
  canManageOrgPost,
  canManageOrgStructure,
  canReadMasterData,
  canViewMasterDataAdmin,
} from "../organization.policy.ts";

const actor = (role: Role): Actor => ({
  accountId: `acc-${role}`,
  authUserId: `auth-${role}`,
  email: `${role}@example.test`,
  role,
  employeeId: null,
  isPrimarySuperAdmin: false,
  grants: new Set(),
  companyIds: null,
});

describe("ORG-D2 kelola struktur per PT", () => {
  test.each(["L6", "L7"] as const)("pos %s di unit ber-PT hanya SA", (level) => {
    const hr: Actor = {
      ...actor("HR_ADMIN"),
      grants: new Set(["org.structure.manage"]),
      companyIds: new Set(["own"]),
    };
    expect(canManageOrgPost(hr, { companyId: "own", level })).toBe(false);
    expect(canManageOrgPost(actor("SUPER_ADMIN"), { companyId: "own", level })).toBe(true);
  });
  test.each([
    ["SUPER_ADMIN", false, null, true],
    ["SUPER_ADMIN", false, "other", true],
    ["HR_ADMIN", true, "own", true],
    ["HR_ADMIN", false, "own", false],
    ["HR_ADMIN", true, "other", false],
    ["HR_ADMIN", true, null, false],
    ["MANAGER", true, "own", false],
    ["EMPLOYEE", true, "own", false],
  ] as const)("%s grant=%s PT=%s → %s", (role, granted, companyId, expected) => {
    const subject: Actor = {
      ...actor(role),
      grants: new Set(granted ? ["org.structure.manage"] : []),
      companyIds: new Set(["own"]),
    };
    expect(canManageOrgStructure(subject, companyId)).toBe(expected);
  });
});

// PLAN §4.3: struktur organisasi, jabatan, level, lokasi → 👁 semua role.
describe("canReadMasterData", () => {
  test.each(["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"] as const)("%s = true", (role) => {
    expect(canReadMasterData(actor(role))).toBe(true);
  });

  test("tanpa akun ditolak", () => {
    expect(canReadMasterData({ ...actor("EMPLOYEE"), accountId: "" })).toBe(false);
  });
});

// D-049 / PLAN §4.3 "Kebijakan": kelola master data (tambah, ubah, arsip, pulihkan, hapus, gabungkan)
// ✅ SUPER_ADMIN saja; HR_ADMIN 👁 (daftar admin + jumlah pemakai, tanpa aksi); MANAGER/EMPLOYEE hanya
// pilihan aktif lewat /master-data.
describe("D-049 master data", () => {
  test.each([
    ["SUPER_ADMIN", true, true],
    ["HR_ADMIN", false, true],
    ["MANAGER", false, false],
    ["EMPLOYEE", false, false],
  ] as const)("%s: kelola = %s, lihat daftar admin = %s", (role, manage, view) => {
    expect(canManageMasterData(actor(role))).toBe(manage);
    expect(canViewMasterDataAdmin(actor(role))).toBe(view);
  });

  test("SUPER_ADMIN non-Utama juga boleh kelola (bukan hak eksklusif Utama, §4.4)", () => {
    expect(canManageMasterData({ ...actor("SUPER_ADMIN"), isPrimarySuperAdmin: false })).toBe(true);
  });

  test("grant apa pun tidak memberi HR hak kelola", () => {
    const hr = { ...actor("HR_ADMIN"), grants: new Set(["employee.personal.write"] as never[]) };
    expect(canManageMasterData(hr)).toBe(false);
  });
});
