import { describe, expect, test } from "bun:test";
import { detectSheet, normalizeImportRow, suggestMapping } from "../src/import/index.ts";

// D-059 (jalur utama): Sheet respons Google Form "Formulir Data Karyawan" → Import Data Karyawan.
// Header = judul pertanyaan Form; data dummy.

const mapOf = (headers: string[], rows: string[][]) => {
  const detected = detectSheet([headers, ...rows]);
  if (!detected) throw new Error("tabel tidak terdeteksi");
  return Object.fromEntries(suggestMapping(detected).map((m) => [m.header, m.field]));
};

const PRIBADI = [
  "Stempel waktu",
  "Nama Lengkap",
  "Nama Panggilan",
  "Jenis Kelamin",
  "NIP (Nomor Induk Pegawai)",
  "NIK (Nomor Induk Kependudukan)",
  "No. Kartu Keluarga",
  "No. Telp",
  "Email Pribadi",
  "Tanggal Lahir",
  "Kebangsaan",
  "Golongan Darah",
  "Jenis SIM",
  "No SIM",
  "Agama",
  "Suku",
  "Foto Karyawan",
];
const pribadi = (i: number) => [
  "07/10/2026 15:30:00",
  `Dummy Satu ${i}`,
  "Dummy",
  "Laki-laki",
  `QA-IMP-0${i}`,
  `64720000000003${String(i).padStart(2, "0")}`,
  `64720000000004${String(i).padStart(2, "0")}`,
  "081200000301",
  `dummy${i}@example.test`,
  "14/02/1995",
  "WNI",
  "O+",
  "SIM A, C",
  "0000-0000-0301",
  "Islam",
  "Dummy",
  `https://drive.google.com/open?id=foto${i}`,
];

describe("pemetaan Sheet respons Form", () => {
  test("field data pribadi Form dikenali; Golongan Darah bukan Grade; kolom tautan Drive diabaikan", () => {
    const headers = [...PRIBADI, "Buku Rekening (Hal 1)"];
    const rows = [1, 2, 3].map((i) => [...pribadi(i), `https://drive.google.com/open?id=rek${i}`]);
    const map = mapOf(headers, rows);
    expect(map).toMatchObject({
      "Nama Lengkap": "fullName",
      "Nama Panggilan": "nickname",
      "Jenis Kelamin": "gender",
      "NIP (Nomor Induk Pegawai)": "employeeNumber",
      "NIK (Nomor Induk Kependudukan)": "ktpNumber",
      "No. Kartu Keluarga": "kkNumber",
      "No. Telp": "phoneNumber",
      "Email Pribadi": "personalEmail",
      "Tanggal Lahir": "birthDate",
      Kebangsaan: "nationality",
      "Golongan Darah": "bloodType",
      "Jenis SIM": "drivingLicenseTypes",
      "No SIM": "drivingLicenseNumber",
      Agama: "religion",
      Suku: "ethnicity",
      "Foto Karyawan": null,
      "Buku Rekening (Hal 1)": null,
    });
  });

  test("ekspor Google Form: kolom otomatis 'Alamat email' (akun pengisi) tidak jadi email kantor", () => {
    const headers = ["Stempel waktu", "Alamat email", ...PRIBADI.slice(1)];
    const rows = [1, 2, 3].map((i) => {
      const [stamp, ...rest] = pribadi(i);
      return [stamp as string, `pengisi${i}@gmail.test`, ...rest];
    });
    const map = mapOf(headers, rows);
    expect(map["Alamat email"]).toBeNull();
    expect(map["Email Pribadi"]).toBe("personalEmail");
    // File biasa (bukan ekspor Form): "Alamat Email" tetap boleh jadi email kantor.
    const office = mapOf(
      ["NIP", "Nama", "Alamat Email"],
      [1, 2, 3].map((i) => [`ACP-${i}`, `Nama ${i}`, `staf${i}@arthasia.test`]),
    );
    expect(office["Alamat Email"]).toBe("workEmail");
  });

  test("kolom keluarga dalam kurung (Anak/Saudara) tidak dipetakan ke data karyawan", () => {
    const headers = [
      ...PRIBADI,
      "Nama Lengkap (Anak 1)",
      "Pendidikan (Anak 1)",
      "Pendidikan Terakhir",
    ];
    const rows = [1, 2, 3].map((i) => [...pribadi(i), `Anak ${i}`, "SD", "SMA"]);
    const map = mapOf(headers, rows);
    expect(map["Nama Lengkap (Anak 1)"]).toBeNull();
    expect(map["Pendidikan (Anak 1)"]).toBeNull();
    expect(map["Pendidikan Terakhir"]).toBe("educationText");
  });

  test("judul kontak darurat yang tidak ambigu (rekomendasi Form) dikenali", () => {
    const headers = [
      ...PRIBADI,
      "Nama Kontak Darurat",
      "Hubungan Kontak Darurat",
      "No. HP Kontak Darurat",
    ];
    const rows = [1, 2, 3].map((i) => [...pribadi(i), `Kontak ${i}`, "Saudara", "081200000399"]);
    const map = mapOf(headers, rows);
    expect(map).toMatchObject({
      "No. Telp": "phoneNumber",
      "Nama Kontak Darurat": "emergencyContactName",
      "Hubungan Kontak Darurat": "emergencyContactRelationship",
      "No. HP Kontak Darurat": "emergencyPhone",
    });
  });
});

describe("normalizeImportRow: field Form", () => {
  test("pilihan Form 'Sudah Menikah' / 'Belum Menikah' dikenali", () => {
    expect(
      normalizeImportRow({ employeeNumber: "X", maritalStatus: "Sudah Menikah" }).row.personal
        .maritalStatus,
    ).toBe("MARRIED");
    expect(
      normalizeImportRow({ employeeNumber: "X", maritalStatus: "Belum Menikah" }).row.personal
        .maritalStatus,
    ).toBe("SINGLE");
    expect(
      normalizeImportRow({ employeeNumber: "X", maritalStatus: "Sudah Kawin" }).row.personal
        .maritalStatus,
    ).toBe("MARRIED");
  });

  test("email pribadi, panggilan, kebangsaan, suku, golongan darah, SIM", () => {
    const { row, issues } = normalizeImportRow({
      employeeNumber: "QA-IMP-01",
      fullName: "Dummy Satu",
      personalEmail: " Dummy1@Example.TEST ",
      nickname: "Dummy",
      nationality: "WNI",
      ethnicity: "Banjar",
      bloodType: "o positif",
      drivingLicenseTypes: "SIM A, C",
      drivingLicenseNumber: "0000-0000-0301",
    });
    expect(issues).toEqual([]);
    expect(row.personalEmail).toBe("dummy1@example.test");
    expect(row.personal).toMatchObject({
      nickname: "Dummy",
      nationality: "Indonesia",
      ethnicity: "Banjar",
      bloodType: "O+",
      drivingLicenseTypes: ["A", "C"],
      drivingLicenseNumber: "0000-0000-0301",
    });
  });

  test("golongan darah / jenis SIM tidak dikenali = peringatan (baris tetap diimpor); email salah = error", () => {
    const { row, issues } = normalizeImportRow({
      employeeNumber: "QA-IMP-02",
      bloodType: "Z",
      drivingLicenseTypes: "A, truk",
      personalEmail: "bukan-email",
      nationality: "-",
    });
    expect(row.personal.bloodType).toBeUndefined();
    expect(row.personal.drivingLicenseTypes).toEqual(["A"]);
    expect(row.personal.nationality).toBeUndefined();
    expect(issues).toEqual([
      { field: "personalEmail", code: "INVALID_EMAIL", severity: "ERROR" },
      { field: "bloodType", code: "UNKNOWN_BLOOD_TYPE", severity: "WARNING" },
      { field: "drivingLicenseTypes", code: "UNKNOWN_DRIVING_LICENSE", severity: "WARNING" },
    ]);
  });
});

// Susunan header ekspor Sheet sungguhan (2026-10-07, 138 kolom; diringkas) — nilai dummy, termasuk isian
// asal yang tidak berformat (NIK 4 digit) seperti contoh pemilik projek.
describe("pemetaan ekspor Sheet sungguhan", () => {
  const headers = [
    "Timestamp",
    "Nama Lengkap",
    "Jenis Kelamin",
    "NIP (Nomor Induk Pegawai)",
    "NIK (Nomor Induk Kependudukan)",
    "No. Kartu Keluarga",
    "No. HP",
    "Email Pribadi",
    "Tempat Lahir",
    "Tanggal Lahir",
    "No. SIM A",
    "No. SIM C",
    "Nama Istri/Suami",
    "Pekerjaan",
    "Tempat Lahir",
    "Tanggal Lahir",
    "Nama Lengkap Ayah",
    "Usia",
    "Pendidikan",
    "Pekerjaan",
    "Nama Lengkap Ibu",
    "Usia",
    "Pendidikan",
    "Pekerjaan",
    "Nama Lengkap",
    "Hubungan",
    "No. HP",
    "Alamat Lengkap",
    "Pendidikan Terakhir Pertama",
    "Nama Bank",
    "No. Rekening",
    "Nama Pemilik",
    "Buku Rekening (Hal 1)",
    "Jenis Kelamin (Anak 1)",
  ];
  const values = (i: number) => [
    "07/10/2026 15:30:00",
    `Dummy ${i}`,
    "Laki-laki",
    `1234567${i}`,
    `123${i}`,
    `987${i}`,
    "081200000301",
    `dummy${i}@example.test`,
    "Samarinda",
    "14/02/1995",
    "1111",
    "2222",
    "Pasangan Dummy",
    "Wiraswasta",
    "Balikpapan",
    "01/01/1996",
    "Ayah Dummy",
    "60",
    "SMA",
    "Pensiunan",
    "Ibu Dummy",
    "58",
    "SMP",
    "Ibu rumah tangga",
    "Kontak Dummy",
    "Saudara",
    "081200000399",
    "Jl. Dummy",
    "S1",
    "BCA",
    "1234567890",
    `Dummy ${i}`,
    `https://drive.google.com/open?id=rek${i}`,
    "Perempuan",
  ];
  test("NIK dari header walau isi tak berformat; header ganda kalah dari header unik", () => {
    const detected = detectSheet([headers, values(1), values(2)]);
    if (!detected) throw new Error("tabel tidak terdeteksi");
    const fields = suggestMapping(detected).map((m) => [m.letter, m.header, m.field]);
    const at = (col: number) => fields[col]?.[2];
    expect(at(1)).toBe("fullName"); // bukan "Nama Istri/Suami"
    expect(at(2)).toBe("gender");
    expect(at(12)).toBeNull(); // Nama Istri/Suami
    expect(at(16)).toBeNull(); // Nama Lengkap Ayah
    expect(at(3)).toBe("employeeNumber");
    expect(at(4)).toBe("ktpNumber");
    expect(at(6)).toBe("phoneNumber"); // No. HP pertama = karyawan
    expect(at(8)).toBe("birthPlace"); // Tempat Lahir pertama = karyawan
    expect(at(14)).toBeNull(); // Tempat Lahir pasangan
    expect(at(18)).toBeNull(); // Pendidikan ayah
    expect(at(22)).toBeNull(); // Pendidikan ibu
    expect(at(25)).toBe("emergencyContactRelationship");
    expect(at(28)).toBe("educationText");
    expect(at(29)).toBe("bankName");
    expect(at(30)).toBe("bankAccountNumber");
    expect(at(31)).toBe("bankAccountHolder");
    expect(at(32)).toBeNull();
  });
});
