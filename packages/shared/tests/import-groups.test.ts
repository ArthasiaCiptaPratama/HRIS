import { describe, expect, test } from "bun:test";
import {
  CERTIFICATIONS,
  detectSheet,
  fieldPermission,
  IMPORT_FIELDS,
  normalizeImportRow,
  profileKeys,
  suggestMapping,
} from "../src/import/index.ts";
import { FORM_SHEET_HEADERS } from "./fixtures/form-sheet-headers.ts";

// D-059 lanjutan: bagian berulang Formulir Data Karyawan (keluarga, pendidikan 1–3, sertifikasi,
// kontak darurat, No. SIM per jenis) sebagai field Import berkelompok. Data dummy.

describe("field berkelompok", () => {
  test("ada di kamus field dengan grup & izin yang tepat", () => {
    expect(IMPORT_FIELDS.child3BirthDate).toMatchObject({ group: "Anak 3", section: "family" });
    expect(IMPORT_FIELDS.fatherAge).toMatchObject({ group: "Ayah", section: "family" });
    expect(IMPORT_FIELDS.education2EntryYear).toMatchObject({
      group: "Pendidikan 2",
      section: "education",
    });
    expect(IMPORT_FIELDS.certPopNumber).toMatchObject({
      group: "Sertifikasi",
      section: "training",
    });
    expect(IMPORT_FIELDS.simNumberC).toMatchObject({ section: "personal" });
    expect(IMPORT_FIELDS.emergencyContactAddress.section).toBe("personal");
    // Keluarga & alamat = data pribadi (grant); pendidikan & sertifikasi tidak sensitif.
    expect(fieldPermission("spouseName")).toBe("employee.personal.write");
    expect(fieldPermission("sibling5Occupation")).toBe("employee.personal.write");
    expect(fieldPermission("education1School")).toBeNull();
    expect(fieldPermission("certK3UmumYear")).toBeNull();
    expect(CERTIFICATIONS.map((c) => c.key)).toContain("Pop");
  });
});

describe("normalizeImportRow: bagian berulang", () => {
  const base = { employeeNumber: "QA-1", fullName: "Dummy" };

  test("keluarga: pasangan, anak, orang tua, saudara; slot kosong dilewati", () => {
    const { row, issues } = normalizeImportRow({
      ...base,
      spouseName: "Pasangan Dummy",
      spouseOccupation: "Guru",
      spouseWorkAddress: "Jl. Kerja 1",
      spouseBirthPlace: "Balikpapan",
      spouseBirthDate: "01/01/1996",
      child1Name: "Anak Satu",
      child1Gender: "Perempuan",
      child1BirthDate: "02/03/2020",
      child1Education: "Belum Sekolah",
      fatherName: "Ayah Dummy",
      fatherAge: "60",
      fatherEducation: "SMA",
      fatherOccupation: "Pensiunan",
      motherName: "Ibu Dummy",
      motherAge: "58 tahun",
      sibling2Name: "Saudara Dua",
      sibling2Age: "30",
    });
    expect(issues).toEqual([]);
    expect(row.family?.map(({ source: _s, ...m }) => m)).toEqual([
      {
        relationship: "SPOUSE",
        name: "Pasangan Dummy",
        occupation: "Guru",
        workAddress: "Jl. Kerja 1",
        birthPlace: "Balikpapan",
        birthDate: "1996-01-01",
      },
      {
        relationship: "CHILD",
        name: "Anak Satu",
        gender: "FEMALE",
        birthDate: "2020-03-02",
        education: "Belum Sekolah",
      },
      {
        relationship: "FATHER",
        name: "Ayah Dummy",
        ageAtEntry: 60,
        education: "SMA",
        occupation: "Pensiunan",
      },
      { relationship: "MOTHER", name: "Ibu Dummy", ageAtEntry: 58 },
      { relationship: "SIBLING", name: "Saudara Dua", ageAtEntry: 30 },
    ]);
  });

  test("anggota tanpa nama tapi berisi data = peringatan; usia/tanggal salah = peringatan", () => {
    const { row, issues } = normalizeImportRow({
      ...base,
      child2Gender: "Laki-laki",
      fatherName: "Ayah",
      fatherAge: "tua",
      motherName: "Ibu",
      motherAge: "200",
    });
    expect(row.family?.map(({ source: _s, ...m }) => m)).toEqual([
      { relationship: "FATHER", name: "Ayah" },
      { relationship: "MOTHER", name: "Ibu" },
    ]);
    expect(issues).toEqual([
      { field: "child2Name", code: "FAMILY_NAME_REQUIRED", severity: "WARNING" },
      { field: "fatherAge", code: "INVALID_AGE", severity: "WARNING" },
      { field: "motherAge", code: "INVALID_AGE", severity: "WARNING" },
    ]);
  });

  test("entri berkelompok membawa field asal untuk pratinjau", () => {
    const { row } = normalizeImportRow({
      ...base,
      child2Name: "Anak Dua",
      education3Level: "SMP",
      certPomYear: "2021",
    });
    expect(row.family?.[0]?.source).toBe("child2Name");
    expect(row.educations?.[0]?.source).toBe("education3Level");
    expect(row.certifications?.[0]?.source).toBe("certPomNumber");
  });

  test("pendidikan 1–3, sertifikasi, alamat kontak darurat, No. SIM per jenis", () => {
    const { row, issues } = normalizeImportRow({
      ...base,
      education1Level: "S1",
      education1School: "Universitas Dummy, Samarinda",
      education1EntryYear: "2012",
      education1GraduationYear: "2016",
      education2Level: "SMA",
      education2School: "SMA Dummy",
      certK3UmumNumber: "K3-001",
      certK3UmumYear: "2022",
      certPopYear: "2023",
      emergencyContactAddress: "Jl. Darurat 1",
      simNumberA: "1111-2222",
      simNumberC: "3333-4444",
      drivingLicenseTypes: "SIM A, C",
    });
    expect(issues).toEqual([]);
    expect(row.educations?.map(({ source: _s, ...e }) => e)).toEqual([
      {
        level: "S1",
        schoolName: "Universitas Dummy, Samarinda",
        entryYear: 2012,
        graduationYear: 2016,
      },
      { level: "SMA", schoolName: "SMA Dummy" },
    ]);
    expect(row.certifications?.map(({ source: _s, ...c }) => c)).toEqual([
      { key: "K3Umum", name: "Sertifikasi K3 Umum", number: "K3-001", year: 2022 },
      { key: "Pop", name: "Sertifikasi Pengawas Operasional Pertama (POP)", year: 2023 },
    ]);
    expect(row.personal).toMatchObject({
      emergencyContactAddress: "Jl. Darurat 1",
      drivingLicenseNumbers: { A: "1111-2222", C: "3333-4444" },
      drivingLicenseNumber: "1111-2222",
      drivingLicenseTypes: ["A", "C"],
    });
  });

  test("tahun masuk setelah tahun lulus = peringatan (tahun masuk dilewati)", () => {
    const { row, issues } = normalizeImportRow({
      ...base,
      education1Level: "SMA",
      education1School: "SMA Dummy",
      education1EntryYear: "2020",
      education1GraduationYear: "2015",
    });
    expect(row.educations?.map(({ source: _s, ...e }) => e)).toEqual([
      { level: "SMA", schoolName: "SMA Dummy", graduationYear: 2015 },
    ]);
    expect(issues).toEqual([
      { field: "education1EntryYear", code: "ENTRY_AFTER_GRADUATION", severity: "WARNING" },
    ]);
  });
});

describe("pemetaan berkelompok ekspor Sheet Form (138 kolom)", () => {
  // Nilai dummy menurut pola judul (dua baris).
  const firstNpwp = FORM_SHEET_HEADERS.indexOf("NPWP");
  const dummy = (header: string, i: number, column: number): string => {
    const h = header.toLowerCase();
    if (h === "timestamp") return `07/10/2026 1${i}:00:00`;
    if (h.startsWith("nik (")) return `64720000000003${i}0`;
    if (h.startsWith("nip")) return `1234567${i}`;
    if (h.includes("tanggal lahir")) return "14/02/1995";
    if (h.startsWith("no. hp") || h.startsWith("no hp")) return "081200000301";
    if (h.includes("email")) return `dummy${i}@example.test`;
    if (h.startsWith("usia")) return "40";
    if (h.startsWith("tahun")) return "2010";
    if (/^(foto|ktp|kartu keluarga|ijazah|buku rekening|sertifikasi|smkp|smk3|proper|iso)/.test(h))
      return `https://drive.google.com/open?id=x${i}`;
    // NPWP pertama = nomor, kedua = unggahan kartu.
    if (h === "npwp")
      return column === firstNpwp ? "000000000000000" : `https://drive.google.com/open?id=n${i}`;
    return `Isi ${i}`;
  };
  const mapping = () => {
    const grid: string[][] = [FORM_SHEET_HEADERS];
    grid.push(
      FORM_SHEET_HEADERS.map((h, c) => dummy(h, 1, c)),
      FORM_SHEET_HEADERS.map((h, c) => dummy(h, 2, c)),
    );
    const detected = detectSheet(grid);
    if (!detected) throw new Error("tabel tidak terdeteksi");
    return suggestMapping(detected).map((m) => m.field);
  };
  const at = (fields: (string | null)[], header: string, occurrence = 1) => {
    let seen = 0;
    for (let i = 0; i < FORM_SHEET_HEADERS.length; i++) {
      const text = FORM_SHEET_HEADERS[i]?.replace(/\s+/g, " ").trim() ?? "";
      // Sama persis; judul panjang ("Nama Sekolah/Universitas …") cukup awalan.
      const hit = text === header || (header.includes("/") && text.startsWith(header));
      if (hit && ++seen === occurrence) return fields[i];
    }
    throw new Error(`header ${header} #${occurrence} tidak ada`);
  };

  test("pasangan, anak, orang tua, saudara dari kolom penanda", () => {
    const f = mapping();
    expect(at(f, "Nama Lengkap")).toBe("fullName");
    expect(at(f, "Nama Istri/Suami")).toBe("spouseName");
    expect(at(f, "Pekerjaan", 1)).toBe("spouseOccupation");
    expect(at(f, "Alamat Kerja")).toBe("spouseWorkAddress");
    expect(at(f, "Tempat Lahir", 1)).toBe("birthPlace");
    expect(at(f, "Tempat Lahir", 2)).toBe("spouseBirthPlace");
    expect(at(f, "Tanggal Lahir", 2)).toBe("spouseBirthDate");
    expect(at(f, "Sudah Memiliki Anak?")).toBeNull();
    expect(at(f, "Nama Lengkap (Anak 1)")).toBe("child1Name");
    expect(at(f, "Jenis Kelamin (Anak 3)")).toBe("child3Gender");
    expect(at(f, "Pendidikan (Anak 5)")).toBe("child5Education");
    expect(at(f, "Nama Lengkap Ayah")).toBe("fatherName");
    expect(at(f, "Usia", 1)).toBe("fatherAge");
    expect(at(f, "Pendidikan", 1)).toBe("fatherEducation");
    expect(at(f, "Pekerjaan", 2)).toBe("fatherOccupation");
    expect(at(f, "Nama Lengkap Ibu")).toBe("motherName");
    expect(at(f, "Usia", 2)).toBe("motherAge");
    expect(at(f, "Pekerjaan", 3)).toBe("motherOccupation");
    expect(at(f, "Nama Lengkap (Saudara Kandung 2)")).toBe("sibling2Name");
    expect(at(f, "Pekerjaan (Saudara Kandung 5)")).toBe("sibling5Occupation");
  });

  test("kontak darurat, pendidikan 1–3, sertifikasi, No. SIM per jenis; kolom tautan = lampiran (D-060)", () => {
    const f = mapping();
    expect(at(f, "Hubungan")).toBe("emergencyContactRelationship");
    expect(at(f, "No. HP", 1)).toBe("phoneNumber");
    expect(at(f, "No. HP", 2)).toBe("emergencyPhone");
    expect(at(f, "Alamat Lengkap")).toBe("emergencyContactAddress");
    expect(at(f, "Pendidikan Terakhir Pertama")).toBe("education1Level");
    expect(at(f, "Nama Sekolah/Universitas", 1)).toBe("education1School");
    expect(at(f, "Tahun Masuk", 1)).toBe("education1EntryYear");
    expect(at(f, "Tahun Lulus", 1)).toBe("education1GraduationYear");
    expect(at(f, "Pendidikan Terakhir Ketiga")).toBe("education3Level");
    expect(at(f, "Tahun Lulus", 3)).toBe("education3GraduationYear");
    expect(at(f, "Sertifikasi K3 Umum")).toBe("attachCertK3Umum");
    expect(at(f, "No. Sertifikasi", 1)).toBe("certK3UmumNumber");
    expect(at(f, "Tahun Terbit", 1)).toBe("certK3UmumYear");
    expect(at(f, "No. Sertifikasi", 2)).toBe("certPopNumber");
    expect(at(f, "Tahun Terbit", 11)).toBe("certIso50001Year");
    expect(at(f, "No. SIM A")).toBe("simNumberA");
    expect(at(f, "No. SIM C")).toBe("simNumberC");
    expect(at(f, "Nama Bank")).toBe("bankName");
    expect(at(f, "Nama Pemilik")).toBe("bankAccountHolder");
    expect(at(f, "KTP")).toBe("attachKtp");
    expect(at(f, "Foto Karyawan")).toBe("attachPhoto");
    expect(at(f, "NPWP", 1)).toBe("npwpNumber");
    expect(at(f, "NPWP", 2)).toBe("attachNpwp");
    expect(at(f, "Buku Rekening (Hal 1)")).toBe("attachBankBook");
    expect(at(f, "Sertifikasi Pengawas Operasional Pertama (POP)")).toBe("attachCertPop");
    // Nama kontak darurat = "Nama Lengkap" tepat sebelum "Hubungan".
    const relIndex = FORM_SHEET_HEADERS.findIndex((h) => h.trim() === "Hubungan");
    expect(f[relIndex - 1]).toBe("emergencyContactName");
  });
});

describe("kunci profil pemetaan", () => {
  test("header kembar dibedakan urutannya (Usia, Usia#2, …)", () => {
    expect(profileKeys(["Nama Lengkap", "Usia", "Pendidikan", "Usia", "No. HP", "Usia"])).toEqual([
      "nama lengkap",
      "usia",
      "pendidikan",
      "usia#2",
      "no hp",
      "usia#3",
    ]);
  });
});
