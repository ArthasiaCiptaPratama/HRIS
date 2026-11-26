import { describe, expect, test } from "bun:test";
import pg from "pg";
import { type AuditRow, auditIssues, compareWithList } from "../audit-employee-data.ts";

// KTR-D9 (K3): cek kualitas data & pencocokan daftar HR — fungsi murni + bukti transaksi READ ONLY.
const base: AuditRow = {
  id: "a",
  company: "ACP",
  employeeNumber: "ACP-1",
  fullName: "Budi Contoh",
  category: "PKWT",
  statusName: "PKWT",
  joinDate: "2026-01-01",
  endDate: null,
  contractStage: 1,
  contractEndDate: "2026-12-31",
  activeKind: "PKWT",
  activeStart: "2026-01-01",
  activeEnd: "2026-12-31",
  firstPkwtStart: null,
  position: "Helper Umum",
  level: "L1A",
  hrLevelCode: null,
  managerId: "m",
  workLocation: "Site PIT",
  ktpHash: "h1",
};
const row = (over: Partial<AuditRow>): AuditRow => ({ ...base, ...over });

describe("auditIssues", () => {
  test("data lengkap → tanpa masalah", () => {
    expect(auditIssues(base, [base], "2026-11-25")).toEqual([]);
  });
  test("PKWT tanpa kontrak, kosong-kosong, tanggal janggal", () => {
    const r = row({
      activeKind: null,
      activeStart: null,
      activeEnd: null,
      contractStage: null,
      employeeNumber: null,
      level: null,
      managerId: null,
      workLocation: null,
      joinDate: "2027-01-01",
    });
    expect(auditIssues(r, [r], "2026-11-25")).toEqual([
      "PKWT: tahap & periode kontrak belum diisi",
      "Tanggal masuk di masa depan",
      "NIP kosong",
      "Level jabatan kosong",
      "Atasan langsung kosong",
      "Lokasi kerja kosong",
    ]);
  });
  test("kontrak lewat, PKWT 1 > 2 tahun, total > 4 tahun, masuk ≠ mulai PKWT 1", () => {
    const r = row({ joinDate: "2025-12-01", activeStart: "2024-01-01", activeEnd: "2026-06-30" });
    const issues = auditIssues(r, [r], "2026-11-25");
    expect(issues).toContain("Kontrak lewat 148 hari");
    expect(issues).toContain("PKWT 1 lebih dari 2 tahun");
    expect(issues).toContain("Tanggal masuk (2025-12-01) ≠ mulai PKWT 1 (2024-01-01)");
    const old = row({
      contractStage: 3,
      firstPkwtStart: "2022-01-01",
      activeStart: "2025-06-01",
      activeEnd: "2026-05-31",
    });
    expect(auditIssues(old, [old], "2025-07-01")).toContain("Total PKWT lebih dari 4 tahun");
  });
  test("kemungkinan dobel: nama sama/awalan nama & NIK KTP sama", () => {
    const a = row({ id: "a", fullName: "Alfandi", ktpHash: null });
    const b = row({
      id: "b",
      fullName: "Alfandi Ahmad Fauzan",
      employeeNumber: "ACP-2",
      ktpHash: null,
    });
    const c = row({ id: "c", fullName: "Orang Lain", employeeNumber: "ACP-3", ktpHash: "h1" });
    const d = row({ id: "d", fullName: "Orang Beda", employeeNumber: "ACP-4", ktpHash: "h1" });
    expect(auditIssues(a, [a, b], "2026-11-25")).toContain(
      "Kemungkinan dobel dengan ACP-2 Alfandi Ahmad Fauzan",
    );
    expect(auditIssues(c, [c, d], "2026-11-25")).toContain("NIK KTP sama dengan ACP-4 Orang Beda");
    expect(
      auditIssues(base, [base, row({ id: "z", fullName: "Budiman", ktpHash: "h9" })], "2026-11-25"),
    ).toEqual([]);
  });
});

describe("compareWithList", () => {
  test("cocok / belum diinput / tanggal & jabatan beda / status beda / akhir kontrak", () => {
    const rows = [
      row({
        id: "1",
        fullName: "Ahmad Bakri",
        joinDate: "2026-11-21",
        activeEnd: "2027-02-20",
        position: "HELPER UMUM",
      }),
      row({
        id: "2",
        fullName: "Daif Efendi",
        joinDate: "2026-11-20",
        position: "Helper",
        activeKind: null,
        activeEnd: null,
      }),
      row({
        id: "3",
        fullName: "Exso Prasakti",
        category: "PERMANENT",
        statusName: "Karyawan Tetap",
        joinDate: "2020-01-01",
      }),
    ];
    const result = compareWithList(
      [
        { nama: "Ahmad Bakri", durasiBulan: 3, mulai: "2026-11-21", jabatan: "Helper Umum" },
        { nama: "Reno Aldi", durasiBulan: 3, mulai: "2026-11-21", jabatan: "Helper Umum" },
        { nama: "Daif Efendi", durasiBulan: 3, mulai: "2026-11-21", jabatan: "Helper Umum" },
        { nama: "Exso Prasakti", durasiBulan: 6, mulai: "2026-11-21", jabatan: "Helper Umum" },
      ],
      rows,
    );
    expect(result[0]?.at(-1)).toBe("✔ cocok");
    expect(result[0]?.[3]).toBe("2027-02-20");
    expect(result[1]?.at(-1)).toBe("Belum diinput");
    expect(result[2]?.at(-1)).toContain("selisih -1 hari");
    expect(result[2]?.at(-1)).toContain("Jabatan beda: Helper");
    expect(result[2]?.at(-1)).toContain("Kontrak belum diisi");
    expect(result[3]?.at(-1)).toContain("Status beda: Karyawan Tetap");
  });
});

test("transaksi READ ONLY menolak tulis (jaminan skrip audit)", async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await expect(client.query("CREATE TEMP TABLE audit_probe (x int)")).rejects.toThrow(
      /read-only/,
    );
    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
});
