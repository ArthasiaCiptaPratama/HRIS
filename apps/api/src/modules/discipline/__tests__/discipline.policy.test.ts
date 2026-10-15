import { describe, expect, test } from "bun:test";
import type { Permission, Role } from "@hris/shared";
import type { Actor, EmployeeTarget } from "../../../core/access/index.ts";
import {
  canAcknowledge,
  canChangeSettings,
  canDeliver,
  canManageViolationTypes,
  canReadDisciplineMasters,
  canSeeInternalNotes,
  canViewLetter,
  canWriteLetters,
  type LetterTarget,
  letterListScope,
} from "../discipline.policy.ts";

// Matriks akses surat peringatan (ARS-D10/ARS-D13, PLAN §4.3 baris "surat peringatan"): SA semua; HR
// ber-grant read/write PT ditugaskan (draft & tulis hanya write); MANAGER tim; karyawan miliknya.
type Who = "SA" | "HR" | "MGR" | "EMP";
type Rel = "other" | "team" | "self";
const ROLE_OF: Record<Who, Role> = {
  SA: "SUPER_ADMIN",
  HR: "HR_ADMIN",
  MGR: "MANAGER",
  EMP: "EMPLOYEE",
};
const READ: Permission[] = ["employee.discipline.read"];
const WRITE: Permission[] = ["employee.discipline.write"];

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
function employee(who: Who, rel: Rel, companyId = "co-A"): EmployeeTarget {
  return {
    employeeId: rel === "self" ? `emp-${who}` : "emp-target",
    managerId: rel === "team" ? `emp-${who}` : "emp-boss",
    companyId,
  };
}
const letter = (
  status: LetterTarget["status"] = "ISSUED",
  companyId = "co-A",
  managerEmployeeId: string | null = "emp-boss",
): LetterTarget => ({ companyId, status, managerEmployeeId });

describe("tulis SP & master (employee.discipline.write)", () => {
  test.each([
    ["SA", [], "co-B", true],
    ["HR", WRITE, "co-A", true],
    ["HR", WRITE, "co-B", false], // PT lain (D-040)
    ["HR", READ, "co-A", false], // hanya lihat
    ["HR", [], "co-A", false],
    ["MGR", [], "co-A", false],
    ["EMP", [], "co-A", false],
  ] as const)("%s grant=%p PT=%s → %p", (who, grants, companyId, expected) => {
    expect(canWriteLetters(actor(who, [...grants]), companyId)).toBe(expected);
  });

  test("master jenis pelanggaran: SA / HR ber-grant write; baca: + HR read", () => {
    expect(canManageViolationTypes(actor("SA"))).toBe(true);
    expect(canManageViolationTypes(actor("HR", WRITE))).toBe(true);
    expect(canManageViolationTypes(actor("HR", READ))).toBe(false);
    expect(canManageViolationTypes(actor("MGR"))).toBe(false);
    expect(canReadDisciplineMasters(actor("HR", READ))).toBe(true);
    expect(canReadDisciplineMasters(actor("HR"))).toBe(false);
    expect(canReadDisciplineMasters(actor("MGR"))).toBe(false);
    expect(canReadDisciplineMasters(actor("EMP"))).toBe(false);
  });

  test("pengaturan masa berlaku hanya SA (ARS-D8)", () => {
    expect(canChangeSettings(actor("SA"))).toBe(true);
    expect(canChangeSettings(actor("HR", WRITE))).toBe(false);
  });
});

describe("lihat SP (ARS-D13)", () => {
  test.each([
    ["SA", [], "other", "co-B", true],
    ["HR", READ, "other", "co-A", true],
    ["HR", WRITE, "other", "co-A", true],
    ["HR", READ, "other", "co-B", false],
    ["HR", [], "other", "co-A", false], // tanpa grant = tidak terlihat
    ["MGR", [], "team", "co-A", true],
    ["MGR", [], "other", "co-A", false],
    ["MGR", [], "self", "co-A", true],
    ["EMP", [], "self", "co-A", true],
    ["EMP", [], "other", "co-A", false],
  ] as const)("%s grant=%p → SP %s di %s = %p", (who, grants, rel, companyId, expected) => {
    expect(
      canViewLetter(
        actor(who, [...grants]),
        letter("ISSUED", companyId),
        employee(who, rel, companyId),
      ),
    ).toBe(expected);
  });

  test("atasan saat terbit tetap melihat walau karyawan pindah tim", () => {
    expect(
      canViewLetter(actor("MGR"), letter("ISSUED", "co-A", "emp-MGR"), employee("MGR", "other")),
    ).toBe(true);
  });

  test("draft hanya SA & HR ber-grant write", () => {
    const draft = letter("DRAFT", "co-A", null);
    expect(canViewLetter(actor("SA"), draft, employee("SA", "other"))).toBe(true);
    expect(canViewLetter(actor("HR", WRITE), draft, employee("HR", "other"))).toBe(true);
    expect(canViewLetter(actor("HR", READ), draft, employee("HR", "other"))).toBe(false);
    expect(canViewLetter(actor("MGR"), draft, employee("MGR", "team"))).toBe(false);
    expect(canViewLetter(actor("EMP"), draft, employee("EMP", "self"))).toBe(false);
  });

  test("SP dicabut & kedaluwarsa tetap terlihat sebagai riwayat", () => {
    expect(canViewLetter(actor("EMP"), letter("REVOKED"), employee("EMP", "self"))).toBe(true);
    expect(canViewLetter(actor("MGR"), letter("EXPIRED"), employee("MGR", "team"))).toBe(true);
  });
});

describe("konfirmasi (ARS-D9)", () => {
  test('"Sudah disampaikan": atasan tim / atasan saat terbit, bukan karyawan sendiri', () => {
    expect(canDeliver(actor("MGR"), letter(), employee("MGR", "team"))).toBe(true);
    expect(
      canDeliver(actor("MGR"), letter("ISSUED", "co-A", "emp-MGR"), employee("MGR", "other")),
    ).toBe(true);
    expect(canDeliver(actor("MGR"), letter(), employee("MGR", "other"))).toBe(false);
    expect(canDeliver(actor("HR", WRITE), letter(), employee("HR", "other"))).toBe(false);
    expect(canDeliver(actor("EMP"), letter(), employee("EMP", "self"))).toBe(false);
  });

  test("karyawan tanpa atasan: penulis SP PT itu yang menyampaikan", () => {
    const noBoss = { employeeId: "emp-target", managerId: null, companyId: "co-A" };
    expect(canDeliver(actor("HR", WRITE), letter("ISSUED", "co-A", null), noBoss)).toBe(true);
    expect(canDeliver(actor("HR", READ), letter("ISSUED", "co-A", null), noBoss)).toBe(false);
    expect(canDeliver(actor("SA"), letter("ISSUED", "co-A", null), noBoss)).toBe(true);
  });

  test('"Sudah menerima": hanya karyawan penerima', () => {
    expect(canAcknowledge(actor("EMP"), employee("EMP", "self"))).toBe(true);
    expect(canAcknowledge(actor("MGR"), employee("MGR", "team"))).toBe(false);
    expect(canAcknowledge(actor("SA"), employee("SA", "other"))).toBe(false);
  });
});

describe("cakupan daftar", () => {
  test("SA semua + draft; HR write PT + draft; HR read PT tanpa draft; MANAGER tim; lainnya tidak", () => {
    expect(letterListScope(actor("SA"))).toEqual({ kind: "all", drafts: true });
    expect(letterListScope(actor("HR", WRITE))).toEqual({
      kind: "companies",
      companyIds: ["co-A"],
      draftCompanyIds: ["co-A"],
    });
    expect(letterListScope(actor("HR", READ))).toEqual({
      kind: "companies",
      companyIds: ["co-A"],
      draftCompanyIds: [],
    });
    expect(letterListScope(actor("HR"))).toBeNull();
    expect(letterListScope(actor("HR", WRITE, []))).toBeNull();
    expect(letterListScope(actor("MGR"))).toEqual({ kind: "team", managerId: "emp-MGR" });
    expect(letterListScope(actor("EMP"))).toBeNull();
  });
});

describe("catatan internal (alasan eskalasi, bukti ALPHA)", () => {
  test("SA & HR ber-grant SP saja", () => {
    expect(canSeeInternalNotes(actor("SA"), "co-B")).toBe(true);
    expect(canSeeInternalNotes(actor("HR", READ), "co-A")).toBe(true);
    expect(canSeeInternalNotes(actor("HR", READ), "co-B")).toBe(false);
    expect(canSeeInternalNotes(actor("HR"), "co-A")).toBe(false);
    expect(canSeeInternalNotes(actor("MGR"), "co-A")).toBe(false);
    expect(canSeeInternalNotes(actor("EMP"), "co-A")).toBe(false);
  });
});
