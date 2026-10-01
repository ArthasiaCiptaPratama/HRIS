import { describe, expect, test } from "bun:test";
import type { Role } from "@hris/shared";
import type { Actor } from "../../../core/access/index.ts";
import {
  canManageMasterData,
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
