import { describe, expect, test } from "bun:test";
import PizZip from "pizzip";
import { convertDocxToPdf, pdfConversionAvailable } from "../../../core/pdf-convert.ts";
import {
  APPLICATION_FORM_MIN_ROWS,
  applicationFormData,
  familyAge,
  imageInfo,
  longDate,
  renderApplicationForm,
} from "../application-form.ts";
import { APPLICATION_FORM_TEMPLATE_BASE64 } from "../application-form-template.ts";
import type { EmployeeDetail } from "../employee.schema.ts";

// EMP-D1: Formulir Aplikasi dari template Word bertanda (docxtemplater) + konversi PDF (Gotenberg).

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
    trainings: [],
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

const documentXml = (docx: Uint8Array) =>
  new PizZip(docx).file("word/document.xml")?.asText() ?? "";

/** PNG minimal (hanya header IHDR — cukup untuk dibaca ukurannya). */
function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, width);
  dv.setUint32(20, height);
  return b;
}

describe("applicationFormData", () => {
  test("label, tanggal panjang, SIM per golongan, baris berulang diisi sampai minimum", () => {
    const d = applicationFormData(detail(), "2026-10-16");
    expect(d.birth).toBe("Bandung, 12 April 1992");
    expect(d.religion).toBe("Islam");
    expect(d.marital).toBe("Menikah");
    expect(d.gender).toBe("Laki-laki");
    expect(d.simA).toBe("SIM-A-1");
    expect(d.simC).toBe("");
    expect(d.email).toBe("budi@contoh.test");
    expect(d.spouseBirth).toBe("Garut, 1 Agustus 1994");
    expect(d.children).toHaveLength(APPLICATION_FORM_MIN_ROWS.children);
    expect(d.children[0]).toMatchObject({ name: "Anak 1", gender: "P" });
    // Baris kosong punya semua kunci (string kosong), bukan objek kosong.
    expect(d.children[1]).toEqual({
      name: "",
      gender: "",
      birth: "",
      education: "",
      occupation: "",
    });
    expect(d.parents.map((p) => p.age)).toEqual(["Alm.", "60"]);
    expect(d.siblings[0]).toMatchObject({ name: "Kakak", relation: "Kakak" });
    expect(d.educations[0]).toMatchObject({
      school: "Univ Contoh — Teknik",
      from: "2010",
      to: "2014",
    });
    expect(d.certifications).toHaveLength(APPLICATION_FORM_MIN_ROWS.certifications);
    expect(d.ec2Name).toBe("Andi");
  });

  test("tanpa hak data pribadi: bagian pribadi kosong", () => {
    const d = applicationFormData(
      detail({ personal: undefined, familyMembers: undefined }),
      "2026-10-16",
    );
    expect(d.ktpNumber).toBe("");
    expect(d.birth).toBe("");
    expect(d.children.every((c) => c.name === "")).toBe(true);
  });

  test("usia keluarga dari tanggal lahir menghitung hari ulang tahun", () => {
    const m = member({ birthDate: "1990-10-17" }) as never;
    expect(familyAge(m, "2026-10-16")).toBe("35");
    expect(familyAge(m, "2026-10-17")).toBe("36");
    expect(longDate("2026-01-05")).toBe("5 Januari 2026");
  });
});

describe("renderApplicationForm", () => {
  test("semua penanda terisi (tanpa sisa {…}), teks di-escape; tanpa foto → gambar FOTO_KARYAWAN dihapus", () => {
    const { docx, photo } = renderApplicationForm(
      applicationFormData(detail(), "2026-10-16"),
      null,
    );
    const xml = documentXml(docx);
    expect(photo).toBe("none");
    expect(xml).toContain("Budi &amp; Santoso &lt;Uji&gt;");
    expect(xml).toContain("ACP-2026-0099");
    expect(xml).toContain("Anak 1");
    expect(xml).toContain("Siti");
    expect(xml).not.toMatch(/\{[#/]?[a-zA-Z0-9]+\}/);
    expect(xml).not.toContain("FOTO_KARYAWAN");
  });

  test("foto PNG: berkas media baru, tipe konten PNG, ukuran mengikuti rasio dalam kotak 4 × 5,4 cm", () => {
    const { docx, photo } = renderApplicationForm(
      applicationFormData(detail(), "2026-10-16"),
      png(300, 400),
    );
    expect(photo).toBe("included");
    const zip = new PizZip(docx);
    expect(zip.file("word/media/foto-karyawan.png")).not.toBeNull();
    expect(zip.file("[Content_Types].xml")?.asText()).toMatch(/Default Extension="png"/i);
    expect(zip.file("word/_rels/document.xml.rels")?.asText()).toContain("media/foto-karyawan.png");
    const xml = documentXml(docx);
    const block =
      /<w:drawing>(?:(?!<\/w:drawing>).)*?name="FOTO_KARYAWAN".*?<\/w:drawing>/s.exec(xml)?.[0] ??
      "";
    // 300 × 400 px: lebar dibatasi 4 cm (1.440.000 EMU) → tinggi 5,33 cm (1.920.000 EMU), rasio tetap.
    expect(block).toContain('<wp:extent cx="1440000" cy="1920000"/>');
  });

  test("format foto selain JPEG/PNG (WebP) → foto tidak dipasang", () => {
    const webp = new TextEncoder().encode("RIFF....WEBPVP8 ");
    const { docx, photo } = renderApplicationForm(
      applicationFormData(detail(), "2026-10-16"),
      webp,
    );
    expect(photo).toBe("unsupported");
    expect(documentXml(docx)).not.toContain("FOTO_KARYAWAN");
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
        new URL("../../../../templates/formulir-aplikasi.docx", import.meta.url),
      ).arrayBuffer(),
    ).toString("base64");
    expect(APPLICATION_FORM_TEMPLATE_BASE64).toBe(source);
  });
});

describe("convertDocxToPdf", () => {
  test("tanpa GOTENBERG_URL → 422 dengan saran unduh Word", async () => {
    expect(pdfConversionAvailable("")).toBe(false);
    await expect(convertDocxToPdf(new Uint8Array([1]), "a.docx", "")).rejects.toThrow(/Word/);
  });

  test("mengirim berkas ke /forms/libreoffice/convert dan mengembalikan PDF", async () => {
    let called = "";
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      called = String(input);
      expect(init?.body).toBeInstanceOf(FormData);
      return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    }) as typeof fetch;
    const pdf = await convertDocxToPdf(
      new Uint8Array([1]),
      "a.docx",
      "http://gotenberg:3000/",
      fakeFetch,
    );
    expect(called).toBe("http://gotenberg:3000/forms/libreoffice/convert");
    expect(new TextDecoder().decode(pdf)).toBe("%PDF");
  });

  test("layanan gagal → pesan jelas (bukan 500)", async () => {
    const failing = (async () => new Response("x", { status: 503 })) as unknown as typeof fetch;
    await expect(
      convertDocxToPdf(new Uint8Array([1]), "a.docx", "http://g", failing),
    ).rejects.toThrow(/kode 503/);
  });
});
