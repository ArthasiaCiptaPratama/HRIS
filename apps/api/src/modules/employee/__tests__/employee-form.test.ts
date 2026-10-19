import { describe, expect, test } from "bun:test";
import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import type { EmployeeDetail } from "../employee.schema.ts";
import {
  EMPLOYEE_FORM_ROWS,
  employeeFormData,
  familyAge,
  imageInfo,
  longDate,
} from "../employee-form.ts";
import { pdfSafe, renderEmployeeFormPdf } from "../employee-form-pdf.ts";
import { EMPLOYEE_FORM_TEMPLATE_BASE64 } from "../employee-form-template.ts";

// Print data karyawan (2026-10-19): Formulir Data Karyawan = template PDF HR + isian (pdf-lib).

const member = (over: Record<string, unknown>) => ({
  id: crypto.randomUUID(),
  name: "Anggota",
  relationship: "CHILD",
  address: null,
  birthDate: null,
  phoneNumber: null,
  gender: null,
  birthPlace: null,
  education: null,
  occupation: null,
  ageAtEntry: null,
  workAddress: null,
  relationDetail: null,
  isDeceased: false,
  ...over,
});

const detail = (over: Record<string, unknown> = {}) =>
  ({
    id: "e1",
    fullName: "Budi & Santoso <Uji>",
    employeeNumber: "ACP-2026-0099",
    phoneNumber: "0812",
    workEmail: null,
    gender: "MALE",
    company: { id: "c1", code: "ACP", name: "PT Arthasia Cipta Pratama" },
    position: { id: "p1", name: "GA Staff" },
    department: { id: "d1", name: "General Affair" },
    joinDate: "2023-03-01",
    bankAccount: { bankName: "BRI", accountNumber: "1234567890", accountHolder: "Budi Santoso" },
    photoUrl: null,
    emergencyContactName: "Siti",
    emergencyPhone: "0813",
    emergencyContactRelationship: "Istri",
    educations: [
      {
        id: "x",
        schoolName: "Univ Contoh",
        major: "Teknik",
        graduationYear: 2014,
        level: "S1",
        entryYear: 2010,
      },
    ],
    trainings: [
      {
        trainingField: "K3 Umum",
        organizer: "Lembaga",
        trainingYear: 2022,
        certificateNumber: "K3-001",
      },
    ],
    workExperiences: [],
    personal: {
      personalEmail: "budi@contoh.test",
      birthPlace: "Bandung",
      birthDate: "1992-04-12",
      religion: "ISLAM",
      maritalStatus: "MARRIED",
      drivingLicenseNumbers: { A: "SIM-A-1" },
      ktpNumber: "3200000000000001",
      domicileAddress: "Jl. Domisili",
      emergencyContact2Name: "Andi",
    },
    familyMembers: [
      member({
        relationship: "SPOUSE",
        name: "Siti",
        birthPlace: "Garut",
        birthDate: "1994-08-01",
      }),
      member({ relationship: "CHILD", name: "Anak 1", gender: "FEMALE", birthDate: "2018-02-03" }),
      member({ relationship: "FATHER", name: "Ayah", isDeceased: true }),
      member({ relationship: "MOTHER", name: "Ibu", ageAtEntry: 60 }),
      member({ relationship: "SIBLING", name: "Kakak", ageAtEntry: 38, relationDetail: "Kakak" }),
    ],
    ...over,
  }) as unknown as EmployeeDetail;

/** Teks yang digambar renderer (operand hex font standar di stream konten yang dikompresi). */
function drawnText(pdf: Uint8Array): string {
  const raw = Buffer.from(pdf).toString("latin1");
  const out: string[] = [];
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(m[1] as string, "latin1")).toString("latin1");
    } catch {
      continue;
    }
    for (const t of content.matchAll(/<([0-9A-Fa-f]+)> Tj/g))
      out.push(Buffer.from(t[1] as string, "hex").toString("latin1"));
  }
  return out.join("\n");
}

describe("employeeFormData", () => {
  test("label, tanggal panjang, SIM per golongan, keluarga, sertifikasi memakai nomor sertifikat", () => {
    const d = employeeFormData(detail(), "2026-10-16");
    expect(d.birth).toBe("Bandung, 12 April 1992");
    expect(d.religion).toBe("Islam");
    expect(d.marital).toBe("Menikah");
    expect(d.gender).toBe("Laki-laki");
    expect(d.simA).toBe("SIM-A-1");
    expect(d.simC).toBe("");
    expect(d.email).toBe("budi@contoh.test");
    expect(d.spouseBirth).toBe("Garut, 1 Agustus 1994");
    expect(d.children).toEqual([
      { name: "Anak 1", gender: "P", birth: "3 Februari 2018", education: "", occupation: "" },
    ]);
    expect(d.parents.map((p) => p.age)).toEqual(["Alm.", "60"]);
    expect(d.siblings[0]).toMatchObject({ name: "Kakak", relation: "Kakak" });
    expect(d.educations[0]).toMatchObject({
      school: "Univ Contoh - Teknik",
      from: "2010",
      to: "2014",
    });
    expect(d.certifications[0]).toEqual({ type: "K3 Umum", number: "K3-001", year: "2022" });
  });

  test("kepegawaian (divisi dari unit), rekening, kontak darurat 1 & 2", () => {
    const d = employeeFormData(detail(), "2026-10-19", { division: "Divisi Operasional" });
    expect(d).toMatchObject({
      department: "General Affair",
      division: "Divisi Operasional",
      position: "GA Staff",
      joinDate: "1 Maret 2023",
      bankName: "BRI",
      bankHolder: "Budi Santoso",
      bankAccount: "1234567890",
    });
    expect(d.contacts).toHaveLength(2);
    expect(d.contacts[0]).toMatchObject({ name: "Siti", relation: "Istri", phone: "0813" });
    expect(d.contacts[1]).toMatchObject({ name: "Andi" });
    const noBank = employeeFormData(detail({ bankAccount: undefined, department: null }), "x");
    expect([noBank.bankName, noBank.bankAccount, noBank.department, noBank.division]).toEqual([
      "",
      "",
      "",
      "",
    ]);
  });

  test("tanpa hak data pribadi: bagian pribadi & keluarga kosong", () => {
    const d = employeeFormData(
      detail({ personal: undefined, familyMembers: undefined }),
      "2026-10-16",
    );
    expect(d.ktpNumber).toBe("");
    expect(d.birth).toBe("");
    expect(d.children).toEqual([]);
  });

  test("usia keluarga dari tanggal lahir menghitung hari ulang tahun", () => {
    const m = member({ birthDate: "1990-10-17" }) as never;
    expect(familyAge(m, "2026-10-16")).toBe("35");
    expect(familyAge(m, "2026-10-17")).toBe("36");
    expect(longDate("2026-01-05")).toBe("5 Januari 2026");
  });
});

describe("renderEmployeeFormPdf", () => {
  test("3 halaman; isian tergambar; tanpa foto; footer jumlah halaman benar", async () => {
    const { pdf, photo } = await renderEmployeeFormPdf(
      employeeFormData(detail(), "2026-10-16"),
      null,
    );
    expect(photo).toBe("none");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(3);
    const text = drawnText(pdf);
    for (const value of [
      "Budi & Santoso <Uji>",
      "ACP-2026-0099",
      "3200000000000001",
      "Anak 1",
      "K3-001",
      "Page 1 of 3",
      "Page 3 of 3",
    ])
      expect(text).toContain(value);
    expect(text).not.toContain("of 7");
  });

  test("baris lebih dari kapasitas template → baris terakhir '+n lainnya'", async () => {
    const children = Array.from({ length: EMPLOYEE_FORM_ROWS.children + 3 }, (_, i) =>
      member({ relationship: "CHILD", name: `Anak ${i + 1}` }),
    );
    const { pdf } = await renderEmployeeFormPdf(
      employeeFormData(detail({ familyMembers: children }), "2026-10-16"),
      null,
    );
    const text = drawnText(pdf);
    expect(text).toContain("Anak 4");
    expect(text).not.toContain("Anak 5");
    expect(text).toContain("+4 lainnya");
  });

  test("teks panjang dipotong dengan '...'; karakter di luar Latin-1 aman", async () => {
    const { pdf } = await renderEmployeeFormPdf(
      employeeFormData(
        detail({ fullName: `${"Nama Sangat Panjang ".repeat(12)}😀` }),
        "2026-10-16",
      ),
      null,
    );
    expect(drawnText(pdf)).toMatch(/Nama Sangat Panjang.*\.\.\./);
    expect(pdfSafe("Jalan “Merdeka” — No. 1…")).toBe('Jalan "Merdeka" - No. 1...');
    expect(pdfSafe("😀")).toBe("??");
  });

  test("foto PNG dipasang; format selain JPEG/PNG (WebP) tidak", async () => {
    const png = new Uint8Array(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    const ok = await renderEmployeeFormPdf(employeeFormData(detail(), "2026-10-16"), png);
    expect(ok.photo).toBe("included");
    const webp = new TextEncoder().encode("RIFF....WEBPVP8 ");
    expect(
      (await renderEmployeeFormPdf(employeeFormData(detail(), "2026-10-16"), webp)).photo,
    ).toBe("unsupported");
  });

  test("ukuran JPEG dibaca dari penanda SOF", () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x90,
      0x01, 0x2c, 0x03,
    ]);
    expect(imageInfo(jpeg)).toEqual({ format: "jpeg", width: 300, height: 400 });
  });

  test("template tersemat sama dengan berkas sumber (jalankan `bun run templates:embed` setelah mengubah)", async () => {
    const source = Buffer.from(
      await Bun.file(
        new URL("../../../../templates/formulir-data-karyawan.pdf", import.meta.url),
      ).arrayBuffer(),
    ).toString("base64");
    expect(EMPLOYEE_FORM_TEMPLATE_BASE64).toBe(source);
  });
});
