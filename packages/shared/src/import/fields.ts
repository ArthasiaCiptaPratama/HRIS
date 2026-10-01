// D-042: kamus field import karyawan — satu sumber untuk deteksi kolom (web), normalisasi & validasi
// (web + api), dan penyaringan kolom sensitif (api). Menambah field = tambah entri di sini + normalizer.

/** Bagian tujuan data. `personal`/`bank` = sensitif (PLAN §4.2, grant `*.write`). */
export type ImportSection =
  | "identity"
  | "work"
  | "contact"
  | "personal"
  | "bank"
  | "education"
  | "exit"
  | "contract";

export interface ImportFieldDef {
  label: string;
  section: ImportSection;
  /** Sinonim header (sudah dinormalisasi: huruf kecil, tanpa tanda baca/isi kurung). */
  synonyms: readonly string[];
  /** Belum punya tempat di DB (Fase 7): dipakai sebagai petunjuk, tidak disimpan. */
  notStored?: boolean;
}

export const IMPORT_FIELDS = {
  employeeNumber: {
    label: "Nomor induk karyawan",
    section: "identity",
    synonyms: [
      "nik",
      "nik karyawan",
      "no induk",
      "nomor induk",
      "nomor induk karyawan",
      "no induk karyawan",
      "nip",
      "id karyawan",
      "employee id",
      "employee number",
      "emp no",
      "staff id",
    ],
  },
  fullName: {
    label: "Nama lengkap",
    section: "identity",
    synonyms: [
      "nama",
      "nama lengkap",
      "nama karyawan",
      "nama pegawai",
      "full name",
      "name",
      "employee name",
    ],
  },
  companyCode: {
    label: "Perusahaan",
    section: "work",
    synonyms: ["perusahaan", "pt", "company", "entitas", "kode perusahaan", "company code"],
  },
  joinDate: {
    label: "Tanggal masuk",
    section: "work",
    synonyms: [
      "join date",
      "tgl masuk",
      "tanggal masuk",
      "tanggal bergabung",
      "tgl bergabung",
      "hire date",
      "start date",
      "mulai kerja",
    ],
  },
  employmentStatusText: {
    label: "Status karyawan",
    section: "work",
    synonyms: [
      "status karyawan",
      "status kepegawaian",
      "status pegawai",
      "employment status",
      "status kontrak",
      "jenis karyawan",
    ],
  },
  positionName: {
    label: "Jabatan",
    section: "work",
    synonyms: ["jabatan", "posisi", "position", "job title", "title"],
  },
  departmentName: {
    label: "Departemen",
    section: "work",
    synonyms: [
      "departemen",
      "departement",
      "department",
      "divisi",
      "divisi departement",
      "divisi departemen",
      "bagian",
      "division",
    ],
  },
  workLocationName: {
    label: "Lokasi kerja / site",
    section: "work",
    synonyms: [
      "kota penempatan",
      "penempatan",
      "lokasi kerja",
      "penempatan lokasi kerja",
      "site",
      "lokasi",
      "work location",
      "location",
    ],
  },
  gradeName: {
    label: "Grade",
    section: "work",
    synonyms: ["grade", "golongan", "level", "gol"],
  },
  workEmail: {
    label: "Email kantor",
    section: "contact",
    synonyms: ["email", "email kantor", "work email", "e mail", "surel"],
  },
  phoneNumber: {
    label: "No. HP",
    section: "contact",
    synonyms: [
      "no hp",
      "no tlp hp",
      "no telp hp",
      "nomor hp",
      "telepon",
      "handphone",
      "hp",
      "phone",
      "mobile",
      "no telepon",
    ],
  },
  emergencyPhone: {
    label: "Telepon kontak darurat",
    section: "contact",
    synonyms: [
      "no telp e cont",
      "telp darurat",
      "no telp darurat",
      "telepon darurat",
      "emergency phone",
      "kontak darurat",
    ],
  },
  emergencyContactName: {
    label: "Nama kontak darurat",
    section: "contact",
    synonyms: ["nama e cont", "nama kontak darurat", "emergency contact name"],
  },
  emergencyContactRelationship: {
    label: "Hubungan kontak darurat",
    section: "contact",
    synonyms: [
      "hubungan e cont",
      "hubungan kontak darurat",
      "emergency relationship",
      "relationship",
    ],
  },
  gender: {
    label: "Jenis kelamin",
    section: "work",
    synonyms: ["jenis kelamin", "jk", "gender", "sex", "kelamin"],
  },
  birthPlace: {
    label: "Tempat lahir",
    section: "personal",
    synonyms: ["tempat lahir", "place of birth", "kota lahir"],
  },
  birthDate: {
    label: "Tanggal lahir",
    section: "personal",
    synonyms: ["tgl lahir", "tanggal lahir", "date of birth", "dob", "birth date"],
  },
  originCity: {
    label: "Kota asal",
    section: "personal",
    synonyms: ["kota asal", "asal", "daerah asal", "hometown"],
  },
  ptkpStatus: {
    label: "Status PTKP",
    section: "personal",
    synonyms: ["status ptkp", "ptkp", "status pajak", "tax status", "status"],
  },
  maritalStatus: {
    label: "Status pernikahan",
    section: "personal",
    synonyms: ["status pernikahan", "status nikah", "status perkawinan", "marital status"],
  },
  religion: {
    label: "Agama",
    section: "personal",
    synonyms: ["agama", "religion"],
  },
  ktpNumber: {
    label: "NIK KTP",
    section: "personal",
    synonyms: ["no ktp", "nik ktp", "nomor ktp", "ktp", "id card", "no identitas"],
  },
  npwpNumber: {
    label: "NPWP",
    section: "personal",
    synonyms: ["npwp", "no npwp", "nomor npwp"],
  },
  kkNumber: {
    label: "No. KK",
    section: "personal",
    synonyms: ["no kk", "nomor kk", "kartu keluarga", "no kartu keluarga"],
  },
  bpjsEmploymentNumber: {
    label: "BPJS Ketenagakerjaan",
    section: "personal",
    synonyms: [
      "id bpjs ketenagakerjaan",
      "bpjs ketenagakerjaan",
      "bpjs tk",
      "no bpjs tk",
      "jamsostek",
      "bpjstk",
    ],
  },
  bpjsHealthNumber: {
    label: "BPJS Kesehatan",
    section: "personal",
    synonyms: [
      "id bpjs kesehatan",
      "bpjs kesehatan",
      "bpjs kes",
      "no bpjs kesehatan",
      "jkn",
      "kis",
    ],
  },
  ktpAddress: {
    label: "Alamat KTP",
    section: "personal",
    synonyms: ["alamat ktp", "alamat", "alamat sesuai ktp", "address"],
  },
  domicileAddress: {
    label: "Alamat domisili",
    section: "personal",
    synonyms: ["alamat domisili", "domisili", "alamat tinggal", "current address"],
  },
  educationText: {
    label: "Pendidikan terakhir",
    section: "education",
    synonyms: ["pendidikan", "pendidikan terakhir", "education", "jenjang pendidikan"],
  },
  bankName: {
    label: "Nama bank",
    section: "bank",
    synonyms: ["nama bank", "bank", "bank name"],
  },
  bankAccountNumber: {
    label: "No. rekening",
    section: "bank",
    synonyms: ["no rekening", "nomor rekening", "rekening", "no rek", "account number"],
  },
  bankAccountHolder: {
    label: "Atas nama rekening",
    section: "bank",
    synonyms: ["atas nama", "nama pemilik rekening", "account holder"],
  },
  exitMarker: {
    label: "Keterangan (resign)",
    section: "exit",
    synonyms: ["keterangan", "ket", "status aktif", "remarks"],
  },
  exitDate: {
    label: "Tanggal keluar",
    section: "exit",
    synonyms: [
      "tgl resign",
      "tanggal resign",
      "tanggal keluar",
      "tgl keluar",
      "resign date",
      "end date resign",
    ],
  },
  contractEndDate: {
    label: "Akhir kontrak",
    section: "contract",
    synonyms: [
      "end of date",
      "end date",
      "akhir kontrak",
      "tgl berakhir",
      "tanggal berakhir",
      "end of contract",
    ],
    notStored: true,
  },
  offeringNumber: {
    label: "Nomor offering",
    section: "contract",
    synonyms: ["nomor offering", "no offering", "offering letter", "offering"],
    notStored: true,
  },
} as const satisfies Record<string, ImportFieldDef>;

export type ImportFieldKey = keyof typeof IMPORT_FIELDS;
export const IMPORT_FIELD_KEYS = Object.keys(IMPORT_FIELDS) as ImportFieldKey[];

/** Kolom yang dihitung dari kolom lain → diabaikan (sistem menghitung sendiri). */
export const DERIVED_HEADERS: readonly string[] = [
  "no",
  "nomor",
  "no urut",
  "lama kerja",
  "masa kerja",
  "masa aktif",
  "usia",
  "umur",
  "status masa kontrak karyawan",
  "status masa kontrak",
  "sisa kontrak",
];

/** Field sensitif yang butuh grant tulis (D-042 poin 5). */
export function fieldPermission(
  key: ImportFieldKey,
): "employee.personal.write" | "employee.bank.write" | null {
  const section = IMPORT_FIELDS[key].section;
  if (section === "personal") return "employee.personal.write";
  if (section === "bank") return "employee.bank.write";
  return null;
}

export const IMPORT_MAX_ROWS = 2000;
export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
