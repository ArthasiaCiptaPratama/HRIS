import { describe, expect, test } from "bun:test";
import type { Permission, Role } from "@hris/shared";
import type { Actor, EmployeeTarget } from "../../../core/access/index.ts";
import {
  assetListScope,
  canAcknowledge,
  canManageAssetMasters,
  canManageAssets,
  canSeeAssetPrice,
  canViewAsset,
  canViewEmployeeAssets,
} from "../asset.policy.ts";

// Matriks akses aset & APD (ARS-D3, PLAN §4.3 baris "aset"): SA semua; HR PT sendiri (kelola butuh
// `asset.manage`); MANAGER tim tanpa harga; karyawan milik sendiri tanpa harga + konfirmasi terima.
type Who = "SA" | "HR" | "MGR" | "EMP";
type Rel = "other" | "team" | "self";
const ROLE_OF: Record<Who, Role> = {
  SA: "SUPER_ADMIN",
  HR: "HR_ADMIN",
  MGR: "MANAGER",
  EMP: "EMPLOYEE",
};
const MANAGE: Permission[] = ["asset.manage"];

function actor(
  who: Who,
  grants: Permission[] = [],
  companyIds: string[] | null = who === "SA" ? null : ["co-A"],
): Actor {
  return {
    accountId: `acc-${who}`,
    authUserId: `auth-${who}`,
    email: `${who}@example.test`,
    role: ROLE_OF[who],
    employeeId: `emp-${who}`,
    isPrimarySuperAdmin: false,
    grants: new Set(grants),
    companyIds: companyIds === null ? null : new Set(companyIds),
  };
}
function holder(who: Who, rel: Rel, companyId = "co-A"): EmployeeTarget {
  return {
    employeeId: rel === "self" ? `emp-${who}` : "emp-target",
    managerId: rel === "team" ? `emp-${who}` : "emp-boss",
    companyId,
  };
}

describe("kelola aset & APD (asset.manage)", () => {
  test.each([
    ["SA", [], "co-A", true],
    ["SA", [], "co-B", true],
    ["HR", MANAGE, "co-A", true],
    ["HR", MANAGE, "co-B", false], // PT lain (D-040)
    ["HR", [], "co-A", false], // tanpa grant
    ["MGR", [], "co-A", false],
    ["EMP", [], "co-A", false],
  ] as const)("%s grant=%p PT=%s → %p", (who, grants, companyId, expected) => {
    expect(canManageAssets(actor(who, [...grants]), companyId)).toBe(expected);
    expect(canSeeAssetPrice(actor(who, [...grants]), companyId)).toBe(expected);
  });

  test("master kategori aset & jenis APD: SA atau HR ber-grant (PT mana pun)", () => {
    expect(canManageAssetMasters(actor("SA"))).toBe(true);
    expect(canManageAssetMasters(actor("HR", MANAGE))).toBe(true);
    expect(canManageAssetMasters(actor("HR"))).toBe(false);
    expect(canManageAssetMasters(actor("MGR"))).toBe(false);
    expect(canManageAssetMasters(actor("EMP"))).toBe(false);
  });
});

describe("lihat aset (pemegang = karyawan)", () => {
  test.each([
    ["SA", "other", "co-B", true],
    ["HR", "other", "co-A", true], // HR tanpa grant tetap melihat di PT-nya
    ["HR", "other", "co-B", false],
    ["MGR", "team", "co-A", true],
    ["MGR", "other", "co-A", false],
    ["MGR", "self", "co-A", true],
    ["EMP", "self", "co-A", true],
    ["EMP", "other", "co-A", false],
    ["EMP", "team", "co-A", false], // EMPLOYEE tidak punya tim
  ] as const)("%s → pemegang %s di %s = %p", (who, rel, companyId, expected) => {
    const a = actor(who);
    const h = holder(who, rel, companyId);
    expect(canViewEmployeeAssets(a, h)).toBe(expected);
    expect(canViewAsset(a, { companyId }, h)).toBe(expected);
  });

  test("aset tanpa pemegang: hanya SA & HR PT itu", () => {
    expect(canViewAsset(actor("SA"), { companyId: "co-B" }, null)).toBe(true);
    expect(canViewAsset(actor("HR"), { companyId: "co-A" }, null)).toBe(true);
    expect(canViewAsset(actor("HR"), { companyId: "co-B" }, null)).toBe(false);
    expect(canViewAsset(actor("MGR"), { companyId: "co-A" }, null)).toBe(false);
    expect(canViewAsset(actor("EMP"), { companyId: "co-A" }, null)).toBe(false);
  });

  test("MANAGER & karyawan tidak pernah melihat harga, termasuk aset sendiri", () => {
    expect(canSeeAssetPrice(actor("MGR"), "co-A")).toBe(false);
    expect(canSeeAssetPrice(actor("EMP"), "co-A")).toBe(false);
  });
});

describe("cakupan daftar & konfirmasi terima", () => {
  test("daftar aset: SA semua PT, HR PT ditugaskan, MANAGER tim, EMPLOYEE tidak (pakai /self/assets)", () => {
    expect(assetListScope(actor("SA"))).toEqual({ kind: "all" });
    expect(assetListScope(actor("HR", [], ["co-A", "co-B"]))).toEqual({
      kind: "companies",
      companyIds: ["co-A", "co-B"],
    });
    expect(assetListScope(actor("HR", [], []))).toBeNull();
    expect(assetListScope(actor("MGR"))).toEqual({ kind: "team", managerId: "emp-MGR" });
    expect(assetListScope(actor("EMP"))).toBeNull();
    expect(assetListScope({ ...actor("MGR"), employeeId: null })).toBeNull();
  });

  test('konfirmasi "Sudah saya terima": hanya pemegangnya sendiri (ARS-D2)', () => {
    expect(canAcknowledge(actor("EMP"), holder("EMP", "self"))).toBe(true);
    expect(canAcknowledge(actor("MGR"), holder("MGR", "self"))).toBe(true);
    expect(canAcknowledge(actor("MGR"), holder("MGR", "team"))).toBe(false);
    expect(canAcknowledge(actor("HR", MANAGE), holder("HR", "other"))).toBe(false);
    expect(canAcknowledge(actor("SA"), holder("SA", "other"))).toBe(false);
  });
});
