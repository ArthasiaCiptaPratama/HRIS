import { describe, expect, test } from "bun:test";
import {
  buildRawRows,
  detectSheet,
  type Grid,
  isBlankImportRow,
  normalizeHeader,
  normalizeImportRow,
  parseBpjs,
  parseDate,
  parseEducation,
  parseEmploymentStatus,
  parseGender,
  parseNik16,
  parseNpwp,
  parsePhone,
  parsePtkp,
  parseReligion,
  pickSheet,
  suggestMapping,
  trimGrid,
} from "../src/index.ts";

// D-042: mesin import. Data di sini FIKTIF (pola file kantor, bukan nilai asli).

describe("normalizer", () => {
  test.each([
    [new Date(Date.UTC(2024, 1, 24)), "2024-02-24"],
    ["24/02/2024", "2024-02-24"],
    ["01-06-2024", "2024-06-01"],
    ["2024-02-24", "2024-02-24"],
    ["2024-02-24T00:00:00.000Z", "2024-02-24"],
    ["24 Februari 2024", "2024-02-24"],
    ["24-Feb-24", "2024-02-24"],
    ["3 Agustus 2023", "2023-08-03"],
    [45346, "2024-02-24"],
  ])("tanggal %p → %s", (input, expected) => {
    expect(parseDate(input)).toEqual({ value: expected });
  });

  test.each([["31/02/2024"], ["Permanent"], [5]])("tanggal tidak valid %p", (input) => {
    expect(parseDate(input)).toEqual({ issue: "INVALID_DATE" });
  });

  test("tanggal kosong → undefined", () => {
    expect(parseDate(null)).toBeUndefined();
    expect(parseDate("")).toBeUndefined();
    expect(parseDate(" - ")).toBeUndefined();
  });

  test.each([
    ["Laki-Laki", "MALE"],
    ["Laki - Laki", "MALE"],
    ["L", "MALE"],
    ["Perempuan", "FEMALE"],
    ["wanita", "FEMALE"],
  ] as const)("jenis kelamin %s → %s", (input, expected) => {
    expect(parseGender(input)).toEqual({ value: expected });
  });

  test.each([
    ["Islam", "ISLAM"],
    ["ISLAM", "ISLAM"],
    ["Katholik", "CATHOLIC"],
    ["Kristen", "PROTESTANT"],
    ["Budha", "BUDDHIST"],
  ] as const)("agama %s → %s", (input, expected) => {
    expect(parseReligion(input)).toEqual({ value: expected });
  });

  test.each([
    ["TK/0", "TK0"],
    ["K/2", "K2"],
    ["k / 3", "K3"],
    ["K/I/1", "K1"],
  ] as const)("PTKP %s → %s", (input, expected) => {
    expect(parsePtkp(input)).toEqual({ value: expected });
  });

  test("NIK KTP harus 16 digit (15 digit → error)", () => {
    expect(parseNik16("6271011205800001")).toEqual({ value: "6271011205800001" });
    expect(parseNik16("6271 0112 0580 0001")).toEqual({ value: "6271011205800001" });
    expect(parseNik16("620201030199003")).toEqual({ issue: "INVALID_LENGTH_16" });
  });

  test("NPWP 15 digit bertitik & 16 digit berspasi", () => {
    expect(parseNpwp("09.901.901.1-017.000")).toEqual({ value: "099019011017000" });
    expect(parseNpwp("9990 0000 0000 0004")).toEqual({ value: "9990000000000004" });
    expect(parseNpwp("123")).toEqual({ issue: "INVALID_NPWP" });
  });

  test("BPJS dari teks bebas; teks tanpa nomor → peringatan", () => {
    expect(parseBpjs("Terdaftar di BPJS (Mandiri) = 0009990000002")).toEqual({
      value: "0009990000002",
    });
    expect(parseBpjs(99000000001)).toEqual({ value: "99000000001" });
    expect(parseBpjs("Belum terdaftar di BPJS Ketenagakerjaan 2024")).toEqual({
      issue: "BPJS_NOT_A_NUMBER",
    });
  });

  test("telepon: 62… / 8… → 08…", () => {
    expect(parsePhone("6281200009002")).toEqual({ value: "081200009002" });
    expect(parsePhone("081200009001")).toEqual({ value: "081200009001" });
    expect(parsePhone(81200009003)).toEqual({ value: "081200009003" });
    expect(parsePhone("12345")).toEqual({ issue: "INVALID_PHONE" });
  });

  test.each([
    ["PKWT II - 6 Bulan", { category: "PKWT", contractSequence: 2, durationMonths: 6 }],
    ["PKWT I - 3 Bulan", { category: "PKWT", contractSequence: 1, durationMonths: 3 }],
    [
      "PKWT Ke 3 - Perpanjang 3 Bulan",
      { category: "PKWT", contractSequence: 3, durationMonths: 3 },
    ],
    ["PKWT II - 1 Tahun", { category: "PKWT", contractSequence: 2, durationMonths: 12 }],
    ["Probation  3 Bulan", { category: "PROBATION", durationMonths: 3 }],
    ["Permanent", { category: "PERMANENT" }],
    ["Pekerja Harian", { category: "DAILY_WORKER" }],
    ["Magang", { category: "INTERNSHIP" }],
    ["Outsourcing", { category: "OUTSOURCING" }],
    ["Vendor", { category: "VENDOR" }],
  ])("status %s", (input, expected) => {
    expect(parseEmploymentStatus(input)).toEqual({ value: expected as never });
  });

  test("pendidikan: jenjang saja & jenjang + nama sekolah", () => {
    expect(parseEducation("S1")).toEqual({ value: { level: "S1", schoolName: null } });
    expect(parseEducation("SMA N 3 Contoh Sampit")).toEqual({
      value: { level: "SMA", schoolName: "SMA N 3 Contoh Sampit" },
    });
    expect(parseEducation("Pondok Pesantren")).toEqual({
      value: { level: "OTHER", schoolName: "Pondok Pesantren" },
    });
  });

  test("normalizeHeader: newline, isi kurung, tanda baca", () => {
    expect(normalizeHeader("STATUS MASA\nKONTRAK KARYAWAN")).toBe("status masa kontrak karyawan");
    expect(normalizeHeader("PERUSAHAAN\n(PNR / RCE / RDA / ACP / AU / NMA)")).toBe("perusahaan");
    expect(normalizeHeader("NO. TELP E-CONT")).toBe("no telp e cont");
  });
});

describe("normalizeImportRow", () => {
  test("baris lengkap: PTKP menurunkan status nikah; resign + tanggal → exit", () => {
    const { row, issues } = normalizeImportRow({
      employeeNumber: "2401.acp.901",
      fullName: "  Contoh   Satu ",
      joinDate: new Date(Date.UTC(2024, 1, 24)),
      employmentStatusText: "PKWT II - 6 Bulan",
      ptkpStatus: "K/2",
      exitMarker: "RESIGN ",
      exitDate: new Date(Date.UTC(2026, 4, 31)),
      ktpNumber: "6271011205800001",
    });
    expect(issues).toEqual([]);
    expect(row).toMatchObject({
      employeeNumber: "2401.ACP.901",
      fullName: "Contoh Satu",
      joinDate: "2024-02-24",
      category: "PKWT",
      contractSequence: 2,
      exit: { reason: "RESIGNATION", date: "2026-05-31" },
      personal: { ptkpStatus: "K2", maritalStatus: "MARRIED", ktpNumber: "6271011205800001" },
    });
  });

  test("END OF DATE 'Permanent' tanpa status → Karyawan Tetap", () => {
    const { row } = normalizeImportRow({
      employeeNumber: "A1",
      fullName: "Contoh",
      contractEndDate: "Permanent",
    });
    expect(row.category).toBe("PERMANENT");
    expect(row.contract.permanentHint).toBe(true);
  });

  test("masalah: wajib kosong, KTP 15 digit (error), BPJS teks (peringatan), resign tanpa tanggal", () => {
    const { issues } = normalizeImportRow({
      ktpNumber: "620201030199003",
      bpjsEmploymentNumber: "Belum terdaftar",
      exitMarker: "RESIGN",
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        { field: "employeeNumber", code: "REQUIRED", severity: "ERROR" },
        { field: "ktpNumber", code: "INVALID_LENGTH_16", severity: "ERROR" },
        { field: "bpjsEmploymentNumber", code: "BPJS_NOT_A_NUMBER", severity: "WARNING" },
        { field: "exitDate", code: "EXIT_DATE_REQUIRED", severity: "ERROR" },
      ]),
    );
  });
});

// Tata letak file kantor: baris kosong, judul, baris "Control", header di baris 5, data, baris
// bernomor tanpa data, kolom kosong di ujung.
const OFFICE: Grid = [
  [null, null, null, null, null, null, null, null, null, null, null, null, null, null],
  [
    null,
    null,
    "MASTER DATA KARYAWAN PT. CONTOH",
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ],
  [],
  [null, "Control", null, 1, 1, 1, 1, null, null, null, null, null, null, null],
  [
    "Keterangan",
    "Tgl Resign",
    "NO",
    "NAMA",
    "NIK",
    "JOIN DATE",
    "LAMA KERJA",
    "STATUS KARYAWAN",
    "KOTA PENEMPATAN",
    "PENEMPATAN LOKASI KERJA",
    "STATUS",
    "NO. KTP",
    "PERUSAHAAN\n(PNR / RCE / ACP)",
    "ALAMAT DOMISILI",
  ],
  [
    "RESIGN",
    new Date(Date.UTC(2026, 4, 31)),
    1,
    "Satu",
    "2401.ACP.901",
    new Date(Date.UTC(2024, 1, 24)),
    2.6,
    "PKWT I - 6 Bulan",
    "Kalimantan Tengah",
    "Kalimantan Tengah",
    "TK/0",
    "6271011205800001",
    "ACP",
    "Jl. Contoh 1",
  ],
  [
    null,
    null,
    2,
    "Dua",
    "2301.ACP.001",
    new Date(Date.UTC(2023, 0, 9)),
    3.7,
    "Probation 3 Bulan",
    "Kalimantan Tengah",
    "Kalimantan Tengah",
    "K/2",
    "6271011205800002",
    "ACP",
    "Jl. Contoh 2",
  ],
  [
    null,
    null,
    3,
    "Tiga",
    "2305.ACP.014",
    "01/06/2024",
    3.3,
    "PKWT II - 1 Tahun",
    "Jakarta Selatan",
    "Jakarta Selatan",
    "K/1",
    "6271011205800003",
    "PNR",
    "Jl. Contoh 3",
  ],
  [null, null, 4, null, null, null, null, null, null, null, null, null, null, null],
  [
    null,
    null,
    5,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ],
];

describe("deteksi struktur file kantor", () => {
  test("trimGrid membuang kolom/baris kosong di ujung", () => {
    const grid = trimGrid(OFFICE);
    expect(grid.every((row) => row.length === 14)).toBe(true);
  });

  test("header di baris 5; baris bernomor tanpa data tidak dihitung", () => {
    const sheet = detectSheet(OFFICE);
    expect(sheet?.headerRowIndex).toBe(4);
    expect(sheet?.rows.map((r) => r.sourceRow)).toEqual([6, 7, 8]);
  });

  test("pemetaan: NIK = nomor induk, STATUS = PTKP, turunan diabaikan, kolom lokasi ganda satu saja", () => {
    const sheet = detectSheet(OFFICE);
    const mapping = suggestMapping(sheet as NonNullable<typeof sheet>);
    const byHeader = Object.fromEntries(mapping.map((m) => [m.header, m.field]));
    expect(byHeader).toMatchObject({
      Keterangan: "exitMarker",
      "Tgl Resign": "exitDate",
      NO: null,
      NAMA: "fullName",
      NIK: "employeeNumber",
      "JOIN DATE": "joinDate",
      "LAMA KERJA": null,
      "STATUS KARYAWAN": "employmentStatusText",
      "KOTA PENEMPATAN": "workLocationName",
      "PENEMPATAN LOKASI KERJA": null,
      STATUS: "ptkpStatus",
      "NO. KTP": "ktpNumber",
      // Header ditampilkan dirapikan (baris baru → spasi).
      "PERUSAHAAN (PNR / RCE / ACP)": "companyCode",
      "ALAMAT DOMISILI": "domicileAddress",
    });
    expect(mapping.find((m) => m.header === "NO")?.derived).toBe(true);
    expect(mapping.find((m) => m.header === "NAMA")?.confidence).toBeGreaterThanOrEqual(0.85);
  });

  test("baris mentah → baris ternormalisasi (sel formula tersimpan & teks tanggal)", () => {
    const sheet = detectSheet(OFFICE) as NonNullable<ReturnType<typeof detectSheet>>;
    const mapping = suggestMapping(sheet).map((m) => m.field);
    const raws = buildRawRows(sheet.rows, mapping);
    const third = normalizeImportRow(raws[2]?.raw ?? {});
    expect(third.issues).toEqual([]);
    expect(third.row).toMatchObject({
      employeeNumber: "2305.ACP.014",
      joinDate: "2024-06-01",
      companyCode: "PNR",
      category: "PKWT",
    });
  });
});

describe("deteksi file berantakan", () => {
  // Header bahasa Inggris, urutan acak, header di baris 1, NIK KTP berlabel "NIK".
  const MESSY: Grid = [
    ["Full Name", "Gender", "NIK", "Employee ID", "Hire Date", "Position", "Department", "Email"],
    [
      "Contoh A",
      "Female",
      "3174017004960006",
      "EMP-001",
      "2025-01-06",
      "Staff",
      "Finance",
      "a@contoh.test",
    ],
    [
      "Contoh B",
      "Male",
      "3174017004960007",
      "EMP-002",
      "06/01/2025",
      "Staff",
      "Finance",
      "b@contoh.test",
    ],
    ["Contoh C", "M", "3174017004960008", "EMP-003", 45663, "Manager", "Finance", ""],
  ];

  test("header baris 1; NIK berisi 16 digit → NIK KTP; Employee ID → nomor induk", () => {
    const sheet = detectSheet(MESSY) as NonNullable<ReturnType<typeof detectSheet>>;
    expect(sheet.headerRowIndex).toBe(0);
    const byHeader = Object.fromEntries(suggestMapping(sheet).map((m) => [m.header, m.field]));
    expect(byHeader).toMatchObject({
      "Full Name": "fullName",
      Gender: "gender",
      NIK: "ktpNumber",
      "Employee ID": "employeeNumber",
      "Hire Date": "joinDate",
      Position: "positionName",
      Department: "departmentName",
      Email: "workEmail",
    });
  });

  test("pickSheet memilih sheet berisi data, bukan sheet catatan", () => {
    const picked = pickSheet([
      { name: "Catatan", grid: [["Dibuat oleh HR"], ["Versi 2"]] },
      { name: "Data", grid: MESSY },
    ]);
    expect(picked?.sheet.name).toBe("Data");
  });
});

test("baris tanpa nama & nomor induk = baris kosong (dilewati, bukan error)", () => {
  expect(isBlankImportRow({ domicileAddress: "0", workLocationName: "0" })).toBe(true);
  expect(isBlankImportRow({ fullName: "Contoh" })).toBe(false);
  expect(isBlankImportRow({ employeeNumber: "A1" })).toBe(false);
});
