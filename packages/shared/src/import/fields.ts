import { GROUP_IMPORT_FIELDS, type GroupFieldKey } from "./groups.ts";

// D-042: kamus field import karyawan — satu sumber untuk deteksi kolom (web), normalisasi & validasi
// (web + api), dan penyaringan kolom sensitif (api). Menambah field = tambah entri di sini + normalizer.

import type { ImportFieldDef } from "./types.ts";

export type { ImportFieldDef, ImportSection } from "./types.ts";

const BASE_IMPORT_FIELDS = {
  employeeNumber: {
    label: "NIP (nomor induk pegawai)",
    section: "identity",
    synonyms: [
      "nip",
      "nomor induk pegawai",
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
      "no telp",
      "nomor telepon",
    ],
  },
  // D-059: email pribadi (tujuan undangan aplikasi & lupa password; unik).
  personalEmail: {
    label: "Email pribadi",
    section: "contact",
    synonyms: ["email pribadi", "alamat email pribadi", "personal email", "email aktif"],
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
      "no hp kontak darurat",
      "no telp kontak darurat",
      "nomor hp kontak darurat",
    ],
  },
  emergencyContactName: {
    label: "Nama kontak darurat",
    section: "contact",
    synonyms: [
      "nama e cont",
      "nama kontak darurat",
      "nama lengkap kontak darurat",
      "emergency contact name",
    ],
  },
  emergencyContactRelationship: {
    label: "Hubungan kontak darurat",
    section: "contact",
    synonyms: [
      "hubungan e cont",
      "hubungan kontak darurat",
      "hubungan",
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
  // D-059: data pribadi tambahan dari Formulir Data Karyawan.
  nickname: {
    label: "Nama panggilan",
    section: "personal",
    synonyms: ["nama panggilan", "panggilan", "nickname", "nick name"],
  },
  nationality: {
    label: "Kebangsaan",
    section: "personal",
    synonyms: ["kebangsaan", "kewarganegaraan", "warga negara", "nationality"],
  },
  ethnicity: {
    label: "Suku",
    section: "personal",
    synonyms: ["suku", "suku bangsa", "etnis", "ethnicity", "tribe"],
  },
  bloodType: {
    label: "Golongan darah",
    section: "personal",
    synonyms: ["golongan darah", "gol darah", "goldar", "blood type", "blood group"],
  },
  drivingLicenseTypes: {
    label: "Jenis SIM",
    section: "personal",
    synonyms: [
      "jenis sim",
      "tipe sim",
      "golongan sim",
      "type of driving licenses",
      "driving license type",
    ],
  },
  drivingLicenseNumber: {
    label: "No. SIM",
    section: "personal",
    synonyms: ["no sim", "nomor sim", "driving license no", "driving license number"],
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
    synonyms: [
      "pendidikan",
      "pendidikan terakhir",
      "pendidikan terakhir pertama",
      "education",
      "jenjang pendidikan",
    ],
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
    synonyms: ["atas nama", "nama pemilik rekening", "nama pemilik", "account holder"],
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

export const IMPORT_FIELDS: Record<keyof typeof BASE_IMPORT_FIELDS, ImportFieldDef> &
  Record<GroupFieldKey, ImportFieldDef> = { ...BASE_IMPORT_FIELDS, ...GROUP_IMPORT_FIELDS };

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
  if (section === "personal" || section === "family") return "employee.personal.write";
  if (section === "bank") return "employee.bank.write";
  return null;
}

export const IMPORT_MAX_ROWS = 2000;
export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
