import { describe, expect, test } from "bun:test";
import {
  buildRawRows,
  detectSheet,
  type GridCell,
  type ImportFieldKey,
  normalizeImportRow,
  suggestMapping,
} from "../src/import/index.ts";
import { FORM_SHEET_HEADERS_V2 } from "./fixtures/form-sheet-headers-v2.ts";

// D-061: Sheet respons Form yang direvisi di tengah pengisian (171 kolom) — responden versi lama mengisi
// kolom 1–137, responden versi baru juga kolom 138–171. Data dummy; nomor kolom 1-based seperti di Excel.

const H = FORM_SHEET_HEADERS_V2;
const link = (id: string) => `https://drive.google.com/open?id=${id}${"x".repeat(24)}`;

function rowOf(values: Record<number, GridCell>): GridCell[] {
  return H.map((_, i) => values[i + 1] ?? null);
}

// Responden versi lama: tanpa kolom 138–171; KK berisi nama file (bukan tautan); tahun masuk berupa teks.
const OLD = rowOf({
  1: "08/10/2026 09:00:00",
  2: "Dummy Lama",
  3: "Laki-laki",
  4: "QA-F2-01",
  5: "6472000000000501",
  6: "000000000000501",
  7: "Jl. Dummy Domisili 1",
  8: "Jl. Dummy KTP 1",
  9: "081200000501",
  10: "dummy.lama@example.test",
  11: "Samarinda",
  12: "14/02/1995",
  13: "WNI",
  14: "Menikah",
  15: "O",
  16: "A, C",
  17: "0000-0000-0501",
  18: "0000-0000-0502",
  19: "Islam",
  20: "Dummy",
  21: link("foto1"),
  22: "Pasangan Dummy",
  23: "Guru",
  24: "Jl. Kerja Dummy",
  25: "Balikpapan",
  26: "01/03/1996",
  53: "Ayah Dummy",
  54: "60",
  55: "SMA",
  56: "Wiraswasta",
  57: "Ibu Dummy",
  58: "58",
  59: "SMP",
  60: "Ibu rumah tangga",
  81: "Darurat Satu",
  82: "Saudara",
  83: "081200000511",
  84: "Jl. Darurat 1",
  85: "S1",
  86: "Universitas Dummy Samarinda",
  87: "lupa",
  88: "2017",
  89: "SMA",
  90: "SMAN 1 Dummy",
  91: "2010",
  92: "2013",
  97: link("ktp1"),
  98: "Kartu Keluarga - Dummy Lama.jpeg",
  99: link("ijazah1"),
  100: link("npwp1"),
  134: "BCA",
  135: "1234567501",
  136: "Dummy Lama",
  137: link("rek1"),
});

// Responden versi baru: SIM per jenis + file SIM, rincian alamat, kontak darurat 2, Divisi, anak.
const NEW = rowOf({
  1: "08/10/2026 10:00:00",
  2: "Dummy Baru",
  3: "Perempuan",
  4: "QA-F2-02",
  5: "6472000000000502",
  7: "Jl. Dummy Domisili 2",
  8: "Jl. Dummy KTP 2",
  9: "081200000502",
  10: "dummy.baru@example.test",
  12: "20/05/1990",
  14: "Menikah",
  19: "Kristen",
  22: "Pasangan Baru",
  23: "Karyawan swasta",
  28: "Anak Dummy",
  29: "Laki-laki",
  31: "10/10/2015",
  32: "SD",
  33: "Anak Dua",
  34: "Perempuan",
  61: "Saudara Dummy",
  62: "35",
  85: "S2",
  86: "Universitas Dummy Jakarta",
  87: "2012",
  88: "2014",
  101: link("k3"),
  102: "K3-0001",
  103: "2020",
  113: link("smkp"),
  114: "SMKP-0002",
  115: "2021",
  138: "Human Capital",
  139: "Divisi Dummy",
  140: "Staff Human Resources",
  141: "02/01/2024",
  142: "Laki-laki",
  143: "Kakak",
  150: "Ya",
  151: link("simA"),
  152: link("simC"),
  153: "0000-0000-0601",
  154: "0000-0000-0602",
  155: "Menteng Dalam",
  156: "Tebet",
  157: "Kota Jakarta Selatan",
  158: "Daerah Khusus Ibukota Jakarta",
  159: "Sukamaju",
  160: "Cibinong",
  161: "Jawa Barat",
  162: "Kabupaten Bogor",
  163: "Pelajar",
  164: "Pelajar",
  168: "Jl. Darurat 2",
  169: "081200000622",
  170: "Kakak",
  171: "Darurat Dua",
});

const detected = detectSheet([H, OLD, NEW]);
if (!detected) throw new Error("tabel tidak terdeteksi");
const suggestions = suggestMapping(detected);
const fieldAt = (column: number) => suggestions[column - 1]?.field ?? null;

describe("Form 171 kolom (D-061)", () => {
  test("kolom berisi data dipetakan otomatis, termasuk judul berakhiran kembar & berdeskripsi", () => {
    const expected: Record<number, ImportFieldKey | null> = {
      1: null,
      4: "employeeNumber",
      7: "domicileAddress",
      8: "ktpAddress",
      17: "simNumberA",
      18: "simNumberC",
      23: "spouseOccupation",
      24: "spouseWorkAddress",
      25: "spouseBirthPlace",
      26: "spouseBirthDate",
      27: null,
      56: "fatherOccupation",
      58: "motherAge",
      59: "motherEducation",
      60: "motherOccupation",
      81: "emergencyContactName",
      82: "emergencyContactRelationship",
      83: "emergencyPhone",
      84: "emergencyContactAddress",
      85: "education1Level",
      86: "education1School",
      87: "education1EntryYear",
      88: "education1GraduationYear",
      89: "education2Level",
      90: "education2School",
      93: "education3Level",
      94: "education3School",
      96: "education3GraduationYear",
      100: "attachNpwp",
      104: "attachCertPop",
      105: "certPopNumber",
      106: "certPopYear",
      113: "attachCertSmkpMinerba",
      114: "certSmkpMinerbaNumber",
      115: "certSmkpMinerbaYear",
      132: "certIso50001Number",
      133: "certIso50001Year",
      137: "attachBankBook",
      138: "departmentName",
      139: "divisionName",
      140: "positionName",
      141: "joinDate",
      142: "child1Gender",
      143: "sibling1Relation",
      147: "sibling5Relation",
      148: null,
      149: null,
      150: null,
      151: "attachSimA",
      152: "attachSimC",
      153: "simNumberA",
      154: "simNumberC",
      155: "domicileVillage",
      156: "domicileDistrict",
      157: "domicileCity",
      158: "domicileProvince",
      159: "ktpVillage",
      160: "ktpDistrict",
      161: "ktpProvince",
      162: "ktpCity",
      163: "child2Occupation",
      164: "child1Occupation",
      168: "emergency2Address",
      169: "emergency2Phone",
      170: "emergency2Relationship",
      171: "emergency2Name",
    };
    const actual = Object.fromEntries(Object.keys(expected).map((c) => [c, fieldAt(Number(c))]));
    expect(actual).toEqual(Object.fromEntries(Object.entries(expected)));
  });

  test("hanya kolom tanpa tempat yang tidak dipetakan", () => {
    const unmapped = suggestions.filter((s) => !s.field).map((s) => s.column + 1);
    // Timestamp, "Sudah Memiliki Anak?", "Apakah memiliki saudara/SIM?", "Email Address" (akun Google).
    expect(unmapped).toEqual([1, 27, 148, 149, 150]);
  });

  test("header tampilan tetap judul lengkap file", () => {
    expect(suggestions[3]?.header).toContain("Jika belum mengetahui NIP");
  });

  const rows = buildRawRows(
    detected.rows,
    suggestions.map((s) => s.field),
  ).map((r) => normalizeImportRow(r.raw));

  test("responden versi lama: data lama utuh, KK nama file & tahun teks = peringatan saja", () => {
    const { row, issues } = rows[0] as ReturnType<typeof normalizeImportRow>;
    expect(row.personal.drivingLicenseNumbers).toEqual({
      A: "0000-0000-0501",
      C: "0000-0000-0502",
    });
    expect(row.personal.emergencyContactAddress).toBe("Jl. Darurat 1");
    expect(row.emergencyPhone).toBe("081200000511");
    expect(row.family?.find((m) => m.relationship === "SPOUSE")).toMatchObject({
      birthPlace: "Balikpapan",
      birthDate: "1996-03-01",
      workAddress: "Jl. Kerja Dummy",
    });
    expect(row.family?.find((m) => m.relationship === "MOTHER")).toMatchObject({
      ageAtEntry: 58,
      education: "SMP",
      occupation: "Ibu rumah tangga",
    });
    expect(row.educations?.map((e) => e.schoolName)).toEqual([
      "Universitas Dummy Samarinda",
      "SMAN 1 Dummy",
    ]);
    expect(row.attachments?.map((a) => a.target).sort()).toEqual(
      ["BANK_BOOK", "DIPLOMA", "KTP", "NPWP", "PHOTO"].sort(),
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        { field: "attachKk", code: "INVALID_DRIVE_LINK", severity: "WARNING" },
        { field: "education1EntryYear", code: "INVALID_YEAR", severity: "WARNING" },
      ]),
    );
    expect(issues.filter((i) => i.severity === "ERROR")).toEqual([]);
    expect(row.personal.domicileCity).toBeUndefined();
  });

  test("responden versi baru: kolom baru tersimpan, kolom kembar digabung", () => {
    const { row, issues } = rows[1] as ReturnType<typeof normalizeImportRow>;
    expect(issues.filter((i) => i.severity === "ERROR")).toEqual([]);
    expect(row.divisionName).toBe("Divisi Dummy");
    expect(row.departmentName).toBe("Human Capital");
    expect(row.personal.drivingLicenseNumbers).toEqual({
      A: "0000-0000-0601",
      C: "0000-0000-0602",
    });
    expect(row.personal).toMatchObject({
      domicileVillage: "Menteng Dalam",
      domicileDistrict: "Tebet",
      domicileCity: "Kota Jakarta Selatan",
      domicileProvince: "Daerah Khusus Ibukota Jakarta",
      ktpVillage: "Sukamaju",
      ktpDistrict: "Cibinong",
      ktpCity: "Kabupaten Bogor",
      ktpProvince: "Jawa Barat",
      emergencyContact2Name: "Darurat Dua",
      emergencyContact2Relationship: "Kakak",
      emergencyContact2Phone: "081200000622",
      emergencyContact2Address: "Jl. Darurat 2",
    });
    const children = row.family?.filter((m) => m.relationship === "CHILD");
    expect(children).toEqual([
      expect.objectContaining({ name: "Anak Dummy", gender: "MALE", occupation: "Pelajar" }),
      expect.objectContaining({ name: "Anak Dua", gender: "FEMALE", occupation: "Pelajar" }),
    ]);
    expect(row.family?.find((m) => m.relationship === "SIBLING")).toMatchObject({
      name: "Saudara Dummy",
      relationDetail: "Kakak",
    });
    const sims = row.attachments?.filter((a) => a.target === "SIM");
    expect(sims?.map((a) => a.note)).toEqual([
      "SIM A — Diimpor dari Google Drive",
      "SIM C — Diimpor dari Google Drive",
    ]);
    expect(row.certifications?.map((c) => [c.key, c.number])).toEqual([
      ["K3Umum", "K3-0001"],
      ["SmkpMinerba", "SMKP-0002"],
    ]);
  });

  test("kolom nomor yang kosong tetap kolom nomor; kolom unggahan kosong tetap lampiran", () => {
    // Semua responden melewatkan NPWP, KTP (unggahan), dan NPWP 2 (unggahan).
    const blank = rowOf({ 1: "08/10/2026 09:00:00", 2: "Dummy Kosong", 4: "QA-F2-09" });
    const d = detectSheet([H, blank, blank]);
    if (!d) throw new Error("tabel tidak terdeteksi");
    const map = suggestMapping(d);
    const at = (column: number) => map[column - 1]?.field ?? null;
    expect([at(6), at(97), at(100), at(104), at(137)]).toEqual([
      "npwpNumber",
      null,
      "attachNpwp",
      "attachCertPop",
      "attachBankBook",
    ]);
  });
});
