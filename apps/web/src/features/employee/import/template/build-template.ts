import { buildWorkbook, IMPORT_FIELDS, type ImportFieldKey, type XlsxSheet } from "@hris/shared";

export const IMPORT_TEMPLATE_FILE_NAME = "Template-import-karyawan-HRIS.xlsx";

interface ImportTemplateInput {
  companies: { code: string; name: string }[];
  statuses: string[];
  canWriteSensitive: boolean;
}

const COLUMNS: readonly [ImportFieldKey, string][] = [
  ["employeeNumber", "NIP"],
  ["fullName", "Nama lengkap"],
  ["companyCode", "PT"],
  ["joinDate", "Tanggal masuk"],
  ["positionName", "Jabatan"],
  ["departmentName", "Departemen"],
  ["divisionName", "Divisi"],
  ["employmentStatusText", "Status karyawan"],
  ["workLocationName", "Lokasi kerja"],
  ["phoneNumber", "No. HP"],
  ["personalEmail", "Email pribadi"],
  ["gender", "Jenis kelamin"],
  ["religion", "Agama"],
  ["birthPlace", "Tempat lahir"],
  ["birthDate", "Tanggal lahir"],
  ["ktpNumber", "No. KTP"],
  ["npwpNumber", "NPWP"],
  ["ptkpStatus", "Status PTKP"],
  ["bpjsEmploymentNumber", "BPJS Ketenagakerjaan"],
  ["bpjsHealthNumber", "BPJS Kesehatan"],
  ["bankName", "Nama bank"],
  ["bankAccountNumber", "No. rekening"],
  ["ktpAddress", "Alamat KTP"],
  ["domicileAddress", "Alamat domisili"],
  ["homebaseName", "Homebase"],
  // KTR-D12: kolom kontrak (PKWT / masa percobaan) — boleh dikosongkan.
  ["contractStage", "Tahap PKWT"],
  ["contractStartDate", "Mulai kontrak"],
  ["contractEndDate", "Akhir kontrak"],
  ["contractDurationMonths", "Durasi kontrak (bulan)"],
  ["pkwtFirstStartDate", "Mulai PKWT 1"],
  ["probationStartDate", "Mulai percobaan"],
  ["probationEndDate", "Akhir percobaan"],
  ["dailyWage", "Upah harian"],
];
const DATE_COLUMNS = new Set<ImportFieldKey>([
  "joinDate",
  "birthDate",
  "contractStartDate",
  "contractEndDate",
  "pkwtFirstStartDate",
  "probationStartDate",
  "probationEndDate",
]);
const REQUIRED = new Set<ImportFieldKey>([
  "employeeNumber",
  "fullName",
  "companyCode",
  "joinDate",
  "positionName",
  "departmentName",
  "employmentStatusText",
]);
const sensitive = (key: ImportFieldKey) =>
  ["personal", "bank", "family"].includes(IMPORT_FIELDS[key].section);

/** Pilihan tetap (dropdown template & editor sel Pratinjau, paket B). */
export const FIXED_CHOICES: Partial<Record<ImportFieldKey, string[]>> = {
  gender: ["Laki-laki", "Perempuan"],
  religion: ["Islam", "Kristen Protestan", "Katolik", "Hindu", "Buddha", "Konghucu", "Lainnya"],
  ptkpStatus: ["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3"],
};

/** Dibangun sepenuhnya dari data pemanggil; tidak mengambil data atau mengunduh berkas. */
export function buildImportTemplate(input: ImportTemplateInput): Uint8Array {
  const choices: Partial<Record<ImportFieldKey, string[]>> = {
    companyCode: input.companies.map((company) => company.code),
    employmentStatusText: input.statuses,
    ...FIXED_CHOICES,
  };
  const examples = [1, 2].map((number) => [
    `CONTOH-00${number}`,
    `Contoh Karyawan ${number}`,
    input.companies[0]?.code ?? "",
    new Date(Date.UTC(2025, 0, number)),
    "Staf Administrasi",
    "Administrasi",
    "",
    number === 2 ? "Harian Lepas (THL)" : (input.statuses[0] ?? ""),
    "",
    `08123456789${number}`,
    `contoh${number}@example.com`,
    number === 1 ? "Laki-laki" : "Perempuan",
    "Islam",
    "Kota Contoh",
    new Date(Date.UTC(1995, 0, number)),
    `000000000000000${number}`,
    `00000000000000${number}`,
    "TK/0",
    `0000000000${number}`,
    `000000000000${number}`,
    "BCA",
    `000000000${number}`,
    "Jalan Contoh No. 1",
    "Jalan Contoh No. 2",
    "",
    ...Array.from({ length: 7 }, () => ""),
    number === 2 ? "150000" : "",
  ]);
  const data: XlsxSheet = {
    name: "Data karyawan",
    rows: [COLUMNS.map(([key, label]) => `${label}${sensitive(key) ? " 🔒" : ""}`), ...examples],
    headerFills: COLUMNS.map(([key]) =>
      REQUIRED.has(key) ? "required" : sensitive(key) ? "sensitive" : undefined,
    ),
    columnChoices: COLUMNS.map(([key]) => choices[key]),
    formats: COLUMNS.map(([key]) => (DATE_COLUMNS.has(key) ? "date" : "text")),
    freezeColumns: 2,
  };
  const instructions = [
    "Petunjuk pengisian",
    "1. Isi satu karyawan per baris.",
    "2. Kolom kuning wajib diisi.",
    "3. Pilih dari panah ▾ bila ada.",
    "4. Hapus 2 baris contoh sebelum mengunggah.",
    "5. Simpan lalu unggah di menu Import Data Karyawan.",
    "Kuning: wajib diisi. Abu-abu dan tanda 🔒: data pribadi. Kolom polos: boleh dikosongkan.",
    "Contoh No. HP: 0812 3456 7890. Biarkan angka 0 di depan tetap ada.",
    "Contoh tanggal: 31/01/2025. NPWP: 15/16 angka. No. KTP: 16 angka.",
    "Kontrak PKWT: isi Tahap PKWT (1, 2, atau 3), Mulai kontrak, dan Akhir kontrak atau Durasi kontrak (bulan). PKWT 2/3 tanpa riwayat: isi juga Mulai PKWT 1.",
    "Harian Lepas (THL): isi Upah harian, contoh 150000. Berlaku sejak tanggal masuk; memerlukan izin biaya tenaga kerja.",
    "Karyawan Percobaan: isi Mulai percobaan dan Akhir percobaan (maksimal 3 bulan).",
    ...(input.canWriteSensitive
      ? []
      : [
          "Akun Anda belum punya izin data pribadi: kolom 🔒 tidak akan tersimpan; kolom lain tetap masuk.",
        ]),
    "PT yang tersedia (kode — nama):",
    ...input.companies.map((company) => `${company.code} — ${company.name}`),
    ...(input.companies.length ? [] : ["Belum ada PT. Lengkapi PT sebelum mengunggah."]),
    "Status karyawan yang tersedia:",
    ...input.statuses,
    ...(input.statuses.length
      ? []
      : ["Belum ada status karyawan. Lengkapi status sebelum mengunggah."]),
  ];
  return buildWorkbook(
    [data, { name: "Petunjuk", rows: instructions.map((line) => [line]) }],
    undefined,
    new Date(Date.UTC(2025, 0, 1)),
  );
}
