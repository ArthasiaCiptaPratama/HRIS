import { describe, expect, test } from "bun:test";
import type { Permission, Role } from "@hris/shared";
import type { Actor, EmployeeTarget } from "../../../core/access/index.ts";
import {
  canChangePhoto,
  canCreateInCompany,
  canDeactivateEmployee,
  canImportEmployees,
  canManageArchive,
  canManageEmployees,
  canOnboardInCompany,
  canPrintEmployee,
  canReadArchive,
  canReadBank,
  canReadDocuments,
  canReadOrgStructure,
  canReadPersonal,
  canReviewDataChange,
  canReviewOnboarding,
  canRunOnboarding,
  canSeeArchiveCost,
  canSubmitDataChange,
  canViewDashboard,
  canViewDataChangeQueue,
  canViewEmployee,
  canWriteDocuments,
  canWriteSensitiveViaImport,
  directoryCompanyIds,
  employeeListScope,
  seesAllSensitiveDocuments,
} from "../employee.policy.ts";

// Matriks akses karyawan (PLAN §4.3 "Karyawan", §4.2 grant; D-035: MANAGER hanya baca tim).
type Who = "SA" | "HR" | "MGR" | "EMP";
type Rel = "other" | "team" | "self";

const ROLE_OF: Record<Who, Role> = {
  SA: "SUPER_ADMIN",
  HR: "HR_ADMIN",
  MGR: "MANAGER",
  EMP: "EMPLOYEE",
};

// D-040: default semua aktor non-SA berada/ditugaskan di PT "co-A"; target juga di "co-A".
function actor(
  who: Who,
  grants: Permission[] = [],
  employeeId: string | null = `emp-${who}`,
  companyIds: string[] | null = who === "SA" ? null : ["co-A"],
): Actor {
  return {
    accountId: `acc-${who}`,
    authUserId: `auth-${who}`,
    email: `${who}@example.test`,
    role: ROLE_OF[who],
    employeeId,
    isPrimarySuperAdmin: false,
    grants: new Set(grants),
    companyIds: companyIds === null ? null : new Set(companyIds),
  };
}

function target(who: Who, rel: Rel, companyId = "co-A"): EmployeeTarget {
  if (rel === "self") return { employeeId: `emp-${who}`, managerId: null, companyId };
  if (rel === "team") return { employeeId: "emp-team", managerId: `emp-${who}`, companyId };
  return { employeeId: "emp-other", managerId: "emp-someone-else", companyId };
}

describe("employeeListScope", () => {
  test.each([
    ["SA", "all"],
    ["HR", "companies"],
    ["MGR", "team"],
    ["EMP", null],
  ] as const)("%s → %s", (who, scope) => {
    expect(employeeListScope(actor(who))).toBe(scope);
  });

  test("MANAGER tanpa data karyawan tidak punya tim", () => {
    expect(employeeListScope(actor("MGR", [], null))).toBeNull();
  });
});

describe("canViewEmployee (data kerja)", () => {
  test.each([
    ["SA", "other", true],
    ["HR", "other", true],
    ["MGR", "team", true],
    ["MGR", "other", false],
    ["MGR", "self", true],
    ["EMP", "self", true],
    ["EMP", "other", false],
  ] as const)("%s → %s = %s", (who, rel, allowed) => {
    expect(canViewEmployee(actor(who), target(who, rel))).toBe(allowed);
  });
});

describe("canManageEmployees (tambah/ubah/ubah status/aktifkan)", () => {
  test.each([
    ["SA", true],
    ["HR", true],
    ["MGR", false],
    ["EMP", false],
  ] as const)("%s = %s", (who, allowed) => {
    expect(canManageEmployees(actor(who))).toBe(allowed);
  });
});

describe("canChangePhoto (foto profil; PLAN §4.3 'ubah data diri sendiri: … foto', D-037)", () => {
  test.each([
    ["SA", "other", true],
    ["SA", "self", true],
    ["HR", "other", true],
    ["HR", "self", true],
    ["MGR", "self", true],
    ["MGR", "team", false],
    ["MGR", "other", false],
    ["EMP", "self", true],
    ["EMP", "other", false],
  ] as const)("%s → %s = %s", (who, rel, allowed) => {
    expect(canChangePhoto(actor(who), target(who, rel))).toBe(allowed);
  });

  test("akun tanpa data karyawan tidak punya foto 'sendiri'", () => {
    expect(canChangePhoto(actor("EMP", [], null), target("EMP", "other"))).toBe(false);
  });
});

describe("canPrintEmployee (unduh formulir data pegawai .xlsx)", () => {
  test.each([
    ["SA", "other", true],
    ["SA", "self", true],
    ["HR", "other", true],
    ["HR", "self", true],
    ["MGR", "team", false],
    ["MGR", "self", false],
    ["EMP", "self", false],
  ] as const)("%s → %s = %s", (who, rel, allowed) => {
    expect(canPrintEmployee(actor(who), target(who, rel))).toBe(allowed);
  });
});

describe("canDeactivateEmployee", () => {
  test.each([
    ["SA", "other", true],
    ["HR", "other", true],
    ["HR", "self", false],
    ["SA", "self", false],
    ["MGR", "team", false],
    ["EMP", "other", false],
  ] as const)("%s → %s = %s", (who, rel, allowed) => {
    expect(canDeactivateEmployee(actor(who), target(who, rel))).toBe(allowed);
  });
});

describe("canReadPersonal (NIK, NPWP, KK, alamat, keluarga)", () => {
  const P: Permission = "employee.personal.read";
  test.each([
    ["SA", [], "other", true],
    ["HR", [], "other", false],
    ["HR", [P], "other", true],
    ["HR", [], "self", true],
    ["MGR", [P], "team", true],
    ["MGR", [P], "other", false],
    ["MGR", [], "team", false],
    ["EMP", [], "self", true],
    ["EMP", [], "other", false],
    // Grant yang tidak boleh untuk role penerima tidak berlaku (hasPermission).
    ["EMP", [P], "other", false],
    // Grant rekening tidak membuka data pribadi.
    ["HR", ["employee.bank.read"], "other", false],
  ] as const)("%s %j → %s = %s", (who, grants, rel, allowed) => {
    expect(canReadPersonal(actor(who, [...grants]), target(who, rel))).toBe(allowed);
  });
});

describe("canReadBank (rekening)", () => {
  const B: Permission = "employee.bank.read";
  test.each([
    ["SA", [], "other", true],
    ["HR", [], "other", false],
    ["HR", [B], "other", true],
    ["MGR", [B], "team", true],
    ["MGR", [B], "other", false],
    ["EMP", [], "self", true],
    ["EMP", [], "other", false],
    ["HR", ["employee.personal.read"], "other", false],
  ] as const)("%s %j → %s = %s", (who, grants, rel, allowed) => {
    expect(canReadBank(actor(who, [...grants]), target(who, rel))).toBe(allowed);
  });
});

describe("canReadOrgStructure (direktori: semua role 👁)", () => {
  test.each(["SA", "HR", "MGR", "EMP"] as const)("%s = true", (who) => {
    expect(canReadOrgStructure(actor(who))).toBe(true);
  });
});

// D-040: cakupan perusahaan. HR hanya PT yang ditugaskan; SA semua; MANAGER tim lintas PT; EMPLOYEE diri sendiri.
describe("D-040 cakupan perusahaan", () => {
  const P: Permission = "employee.personal.read";
  const B: Permission = "employee.bank.read";

  test.each([
    // [aktor, PT aktor, relasi, PT target, boleh lihat?]
    ["SA", null, "other", "co-B", true],
    ["HR", ["co-A"], "other", "co-A", true],
    ["HR", ["co-A"], "other", "co-B", false],
    ["HR", ["co-A", "co-B"], "other", "co-B", true],
    ["HR", [], "other", "co-A", false],
    ["MGR", ["co-A"], "team", "co-B", true],
    ["MGR", ["co-A"], "other", "co-A", false],
    ["EMP", ["co-A"], "self", "co-A", true],
    ["EMP", ["co-A"], "other", "co-A", false],
  ] as const)("%s PT %j → %s di %s: lihat = %s", (who, companies, rel, company, allowed) => {
    const a = actor(who, [], `emp-${who}`, companies === null ? null : [...companies]);
    expect(canViewEmployee(a, target(who, rel, company))).toBe(allowed);
  });

  test("HR di luar cakupan: tidak bisa foto, print, nonaktifkan, atau baca data sensitif walau ber-grant", () => {
    const hr = actor("HR", [P, B], "emp-HR", ["co-A"]);
    const outside = target("HR", "other", "co-B");
    expect(canChangePhoto(hr, outside)).toBe(false);
    expect(canPrintEmployee(hr, outside)).toBe(false);
    expect(canDeactivateEmployee(hr, outside)).toBe(false);
    expect(canReadPersonal(hr, outside)).toBe(false);
    expect(canReadBank(hr, outside)).toBe(false);
    // Di dalam cakupan tetap boleh.
    const inside = target("HR", "other", "co-A");
    expect(canPrintEmployee(hr, inside)).toBe(true);
    expect(canReadPersonal(hr, inside)).toBe(true);
  });

  test("MANAGER ber-grant membaca data sensitif timnya walau beda PT", () => {
    const mgr = actor("MGR", [P], "emp-MGR", ["co-A"]);
    expect(canReadPersonal(mgr, target("MGR", "team", "co-B"))).toBe(true);
  });

  test.each([
    ["SA", null, "co-B", true],
    ["HR", ["co-A"], "co-A", true],
    ["HR", ["co-A"], "co-B", false],
    ["HR", [], "co-A", false],
    ["MGR", ["co-A"], "co-A", false],
    ["EMP", ["co-A"], "co-A", false],
  ] as const)("canCreateInCompany %s PT %j → %s = %s", (who, companies, company, allowed) => {
    const a = actor(who, [], `emp-${who}`, companies === null ? null : [...companies]);
    expect(canCreateInCompany(a, company)).toBe(allowed);
  });

  test("directoryCompanyIds: SA semua (null); lainnya PT miliknya", () => {
    expect(directoryCompanyIds(actor("SA"))).toBeNull();
    expect([...(directoryCompanyIds(actor("HR", [], "emp-HR", ["co-A", "co-B"])) ?? [])]).toEqual([
      "co-A",
      "co-B",
    ]);
    expect([...(directoryCompanyIds(actor("EMP")) ?? [])]).toEqual(["co-A"]);
    expect([...(directoryCompanyIds(actor("EMP", [], null, [])) ?? [])]).toEqual([]);
  });
});

// D-042: import karyawan — SA & HR; kolom sensitif hanya SA atau HR ber-grant *.write.
describe("D-042 import karyawan", () => {
  test.each([
    ["SA", true],
    ["HR", true],
    ["MGR", false],
    ["EMP", false],
  ] as const)("canImportEmployees %s = %s", (who, allowed) => {
    expect(canImportEmployees(actor(who))).toBe(allowed);
  });

  test.each([
    ["SA", [], "personal", true],
    ["SA", [], "bank", true],
    ["HR", [], "personal", false],
    ["HR", ["employee.personal.write"], "personal", true],
    ["HR", ["employee.personal.write"], "bank", false],
    ["HR", ["employee.bank.write"], "bank", true],
    ["HR", ["employee.personal.read"], "personal", false],
    ["MGR", ["employee.personal.write"], "personal", false],
  ] as const)("canWriteSensitiveViaImport %s %j %s = %s", (who, grants, section, allowed) => {
    expect(canWriteSensitiveViaImport(actor(who, [...grants]), section)).toBe(allowed);
  });
});

// Dashboard agregat: SA & HR saja.
describe("Dashboard", () => {
  test.each([
    ["SA", true],
    ["HR", true],
    ["MGR", false],
    ["EMP", false],
  ] as const)("canViewDashboard %s = %s", (who, allowed) => {
    expect(canViewDashboard(actor(who))).toBe(allowed);
  });
});

// D-045: penerimaan karyawan baru (impor calon, undangan, undang karyawan existing).
describe("D-045 onboarding — penerimaan & undangan", () => {
  test.each([
    ["SA", null, "co-B", true, true],
    ["HR", ["co-A"], "co-A", true, true],
    ["HR", ["co-A"], "co-B", true, false],
    ["HR", [], "co-A", true, false],
    ["MGR", ["co-A"], "co-A", false, false],
    ["EMP", ["co-A"], "co-A", false, false],
  ] as const)(
    "%s PT %j → %s: menu = %s, terima di PT = %s",
    (who, companies, company, menu, inCompany) => {
      const a = actor(who, [], `emp-${who}`, companies === null ? null : [...companies]);
      expect(canRunOnboarding(a)).toBe(menu);
      expect(canOnboardInCompany(a, company)).toBe(inCompany);
    },
  );

  test("grant apa pun tidak memberi MANAGER hak penerimaan", () => {
    expect(canRunOnboarding(actor("MGR", ["employee.personal.write"]))).toBe(false);
  });
});

// D-047: review & keputusan data onboarding — SA; HR_ADMIN hanya dengan grant & di PT yang ditugaskan.
describe("D-047 review onboarding", () => {
  const R: Permission = "employee.onboarding.review";
  test.each([
    ["SA", [], null, "co-B", true],
    ["HR", [R], ["co-A"], "co-A", true],
    ["HR", [], ["co-A"], "co-A", false],
    ["HR", [R], ["co-A"], "co-B", false],
    ["HR", ["employee.personal.read" as Permission], ["co-A"], "co-A", false],
    ["MGR", [R], ["co-A"], "co-A", false],
    ["EMP", [], ["co-A"], "co-A", false],
  ] as const)("%s grant %j PT %j → %s: %s", (who, grants, companies, company, allowed) => {
    const a = actor(who, [...grants], `emp-${who}`, companies === null ? null : [...companies]);
    expect(canReviewOnboarding(a, company)).toBe(allowed);
  });
});

// D-054 (Arsip 1a, matriks design/arsip-karyawan.md §8): tabel lintas karyawan SA semua, HR PT
// ditugaskan, MANAGER tim (kolom kerja), EMPLOYEE tidak; kelola per karyawan SA/HR dalam cakupan.
describe("Arsip (D-054)", () => {
  const rows: [Who, Rel, string, boolean, boolean, boolean][] = [
    // who, relasi, PT target, baca menu, kelola item, lihat biaya pelatihan
    ["SA", "other", "co-B", true, true, true],
    ["HR", "other", "co-A", true, true, true],
    ["HR", "other", "co-B", true, false, false],
    ["MGR", "team", "co-A", true, false, false],
    ["MGR", "other", "co-A", true, false, false],
    ["EMP", "self", "co-A", false, false, false],
  ];
  for (const [who, rel, company, read, manage, cost] of rows) {
    test(`${who} ${rel} ${company}: baca=${read} kelola=${manage} biaya=${cost}`, () => {
      const a = actor(who);
      const t = target(who, rel, company);
      expect(canReadArchive(a)).toBe(read);
      expect(canManageArchive(a, t)).toBe(manage);
      expect(canSeeArchiveCost(a, t)).toBe(cost);
    });
  }
  test("MANAGER tanpa keterhubungan data karyawan tidak bisa membuka Arsip", () => {
    expect(canReadArchive(actor("MGR", [], null))).toBe(false);
  });
});

// D-055 (Arsip 1b, design §8 "Dokumen"): jenis biasa = cakupan lihat karyawan; jenis sensitif butuh
// grant `employee.documents.read` (SA & diri sendiri selalu). Tulis = kelola Arsip (SA/HR) + jenis
// sensitif butuh `employee.documents.write` (SA selalu).
describe("Dokumen (D-055)", () => {
  type Row = [Who, Permission[], Rel, string, boolean, boolean, boolean, boolean];
  const rows: Row[] = [
    // who, grant, relasi, PT, baca biasa, baca sensitif, tulis biasa, tulis sensitif
    ["SA", [], "other", "co-B", true, true, true, true],
    ["HR", [], "other", "co-A", true, false, true, false],
    ["HR", ["employee.documents.read"], "other", "co-A", true, true, true, false],
    [
      "HR",
      ["employee.documents.read", "employee.documents.write"],
      "other",
      "co-A",
      true,
      true,
      true,
      true,
    ],
    [
      "HR",
      ["employee.documents.read", "employee.documents.write"],
      "other",
      "co-B",
      false,
      false,
      false,
      false,
    ],
    ["MGR", [], "team", "co-A", true, false, false, false],
    ["MGR", ["employee.documents.read"], "team", "co-A", true, true, false, false],
    ["MGR", ["employee.documents.read"], "other", "co-A", false, false, false, false],
    ["EMP", [], "self", "co-A", true, true, false, false],
    ["EMP", [], "other", "co-A", false, false, false, false],
  ];
  for (const [who, grants, rel, company, read, readS, write, writeS] of rows) {
    test(`${who} ${grants.join("+") || "tanpa grant"} ${rel} ${company}`, () => {
      const a = actor(who, grants);
      const t = target(who, rel, company);
      expect(canReadDocuments(a, t, false)).toBe(read);
      expect(canReadDocuments(a, t, true)).toBe(readS);
      expect(canWriteDocuments(a, t, false)).toBe(write);
      expect(canWriteDocuments(a, t, true)).toBe(writeS);
    });
  }
  test("tabel Data File: jenis sensitif tampil hanya untuk SA / pemegang grant baca", () => {
    expect(seesAllSensitiveDocuments(actor("SA"))).toBe(true);
    expect(seesAllSensitiveDocuments(actor("HR"))).toBe(false);
    expect(seesAllSensitiveDocuments(actor("HR", ["employee.documents.read"]))).toBe(true);
    expect(seesAllSensitiveDocuments(actor("MGR", ["employee.documents.read"]))).toBe(true);
  });
});

// D-054 / OD-6 (Arsip 1c, design §8 "Setujui pengajuan"): karyawan mengajukan perubahan data dirinya;
// pemeriksa SA, atau HR ber-grant `employee.changes.review` di PT-nya + grant bagian sensitif (lihat &
// ubah). Tidak ada yang memeriksa pengajuannya sendiri.
describe("Pengajuan perubahan data (OD-6)", () => {
  const REVIEW = "employee.changes.review" as const;
  test("mengajukan: hanya untuk data sendiri", () => {
    expect(canSubmitDataChange(actor("EMP"), target("EMP", "self"))).toBe(true);
    expect(canSubmitDataChange(actor("HR"), target("HR", "self"))).toBe(true);
    expect(canSubmitDataChange(actor("SA"), target("SA", "other"))).toBe(false);
  });
  test("antrean: SA & HR ber-grant", () => {
    expect(canViewDataChangeQueue(actor("SA"))).toBe(true);
    expect(canViewDataChangeQueue(actor("HR"))).toBe(false);
    expect(canViewDataChangeQueue(actor("HR", [REVIEW]))).toBe(true);
    expect(canViewDataChangeQueue(actor("MGR", [REVIEW]))).toBe(false);
  });
  type Row = [
    Who,
    Permission[],
    Rel,
    string,
    "PERSONAL" | "EMERGENCY" | "FAMILY" | "BANK" | "DOCUMENT",
    boolean,
    boolean,
  ];
  const rows: Row[] = [
    // who, grant, relasi, PT, bagian, dokumen sensitif, boleh memeriksa
    ["SA", [], "other", "co-B", "BANK", false, true],
    ["SA", [], "self", "co-A", "EMERGENCY", false, false],
    ["HR", [], "other", "co-A", "EMERGENCY", false, false],
    ["HR", [REVIEW], "other", "co-A", "EMERGENCY", false, true],
    ["HR", [REVIEW], "other", "co-B", "EMERGENCY", false, false],
    ["HR", [REVIEW], "other", "co-A", "PERSONAL", false, false],
    ["HR", [REVIEW, "employee.personal.read"], "other", "co-A", "PERSONAL", false, false],
    [
      "HR",
      [REVIEW, "employee.personal.read", "employee.personal.write"],
      "other",
      "co-A",
      "FAMILY",
      false,
      true,
    ],
    [
      "HR",
      [REVIEW, "employee.personal.read", "employee.personal.write"],
      "other",
      "co-A",
      "BANK",
      false,
      false,
    ],
    [
      "HR",
      [REVIEW, "employee.bank.read", "employee.bank.write"],
      "other",
      "co-A",
      "BANK",
      false,
      true,
    ],
    ["HR", [REVIEW], "other", "co-A", "DOCUMENT", false, true],
    ["HR", [REVIEW], "other", "co-A", "DOCUMENT", true, false],
    [
      "HR",
      [REVIEW, "employee.documents.read", "employee.documents.write"],
      "other",
      "co-A",
      "DOCUMENT",
      true,
      true,
    ],
    ["HR", [REVIEW], "self", "co-A", "EMERGENCY", false, false],
    ["MGR", [REVIEW], "team", "co-A", "EMERGENCY", false, false],
  ];
  for (const [who, grants, rel, company, section, sensitive, allowed] of rows) {
    test(`${who} ${grants.join("+") || "tanpa grant"} ${rel} ${company} ${section}${sensitive ? " (sensitif)" : ""} → ${allowed}`, () => {
      expect(
        canReviewDataChange(actor(who, grants), target(who, rel, company), section, sensitive),
      ).toBe(allowed);
    });
  }
});
