import { readFileSync } from "node:fs";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import {
  ageOn,
  buildPrintCells,
  PRINT_PHOTO_ASPECT,
  PRINT_SHEET_PATH,
  photoImage,
  printFileName,
  wrapText,
} from "@/features/employee/print";
import type { EmployeeDetail } from "@/features/employee/schemas";
import { centerCrop, fitWithin, ImageProcessingError } from "@/lib/image";
import {
  columnIndex,
  fillXlsxTemplate,
  serializeSheet,
  XlsxTemplateError,
} from "@/lib/xlsx-template";

// Fitur "Print data": template kantor apps/web/public/template/Template-excel.xlsx diisi data pegawai.
const TEMPLATE = new Uint8Array(
  readFileSync(path.join(import.meta.dirname, "..", "public", "template", "Template-excel.xlsx")),
);
const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

function base(overrides: Partial<EmployeeDetail> = {}): EmployeeDetail {
  return {
    id: "e1",
    employeeNumber: "ACP-2023-0007",
    fullName: "Agus Pratama",
    workEmail: "agus@arthasia.test",
    phoneNumber: "081200000007",
    gender: "MALE",
    joinDate: "2023-08-01",
    endDate: null,
    isActive: true,
    exitReason: null,
    employmentStatus: { id: "s1", name: "PKWT", category: "PKWT" },
    position: { id: "p1", name: "GA Staff" },
    department: { id: "d1", name: "Human Resources & GA" },
    workLocation: { id: "l1", name: "Kantor Pusat Jakarta" },
    grade: null,
    manager: null,
    emergencyPhone: "0813-0000-0007",
    account: null,
    access: {
      manage: true,
      deactivate: true,
      personal: true,
      bank: false,
      print: true,
      photo: true,
    },
    photoUrl: null,
    educations: [
      { id: "ed1", schoolName: "Universitas Indonesia", major: "Manajemen", graduationYear: 2020 },
      { id: "ed2", schoolName: "SMA Negeri 8 Jakarta", major: "IPA", graduationYear: 2016 },
    ],
    trainings: [
      {
        id: "t1",
        trainingField: "K3 Umum",
        organizer: "Kemnaker",
        duration: "3 hari",
        trainingYear: 2024,
      },
    ],
    histories: [],
    ...overrides,
  };
}

const withPersonal = () =>
  base({
    personal: {
      ktpNumber: "3171000000000007",
      npwpNumber: null,
      kkNumber: null,
      birthPlace: "Bandung",
      birthDate: "1998-03-12",
      ktpAddress: "Alamat KTP",
      domicileAddress:
        "Jl. Dharmawangsa Raya No. 8, Kebayoran Baru, Kota Jakarta Selatan, DKI Jakarta 12160 & sekitarnya <RT 01>",
      maritalStatus: "MARRIED",
      religion: "ISLAM",
    },
    familyMembers: [
      {
        id: "f1",
        name: "Sri Wahyuni",
        relationship: "SPOUSE",
        address: "Jl. Mawar 1",
        birthDate: "1999-01-02",
        phoneNumber: "081300000007",
      },
      {
        id: "f2",
        name: "Anak Kedua",
        relationship: "CHILD",
        address: null,
        birthDate: "2024-06-01",
        phoneNumber: null,
      },
      {
        id: "f3",
        name: "Anak Pertama",
        relationship: "CHILD",
        address: null,
        birthDate: "2022-01-15",
        phoneNumber: null,
      },
      {
        id: "f4",
        name: "Pak Pratama",
        relationship: "FATHER",
        address: null,
        birthDate: "1965-12-31",
        phoneNumber: null,
      },
      {
        id: "f5",
        name: "Adik",
        relationship: "SIBLING",
        address: null,
        birthDate: null,
        phoneNumber: null,
      },
    ],
  });

/** Baca nilai sel dari lembar hasil (inline string, shared string, atau angka). */
function readSheet(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  const shared = Array.from(
    new DOMParser()
      .parseFromString(strFromU8(files["xl/sharedStrings.xml"] as Uint8Array), "application/xml")
      .getElementsByTagNameNS(MAIN_NS, "si"),
  ).map((si) => si.textContent ?? "");
  const xml = strFromU8(files[PRINT_SHEET_PATH] as Uint8Array);
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const cells = new Map<string, Element>();
  for (const c of Array.from(doc.getElementsByTagNameNS(MAIN_NS, "c"))) {
    cells.set(c.getAttribute("r") ?? "", c);
  }
  const value = (ref: string) => {
    const c = cells.get(ref);
    if (!c) return undefined;
    const v = c.getElementsByTagNameNS(MAIN_NS, "v")[0]?.textContent;
    if (c.getAttribute("t") === "inlineStr") return c.textContent;
    if (c.getAttribute("t") === "s") return shared[Number(v)];
    return v === undefined ? undefined : Number(v);
  };
  return { files, xml, doc, cells, value };
}

describe("buildPrintCells (data pegawai → sel template)", () => {
  it("biodata, kontak, program (periode tgl masuk s/d keluar), departemen & posisi", () => {
    const cells = buildPrintCells(withPersonal(), "2026-09-29");
    expect(cells).toMatchObject({
      R9: "Agus Pratama",
      R11: "Bandung, 12 Mar 1998",
      R12: "Laki-laki",
      R13: "Islam",
      R19: "Menikah",
      R20: "081200000007",
      R21: "agus@arthasia.test",
      R24: "01.08.2023 s/d",
      R25: "Human Resources & GA",
      R26: "GA Staff",
    });
    expect(buildPrintCells(base({ endDate: "2027-03-20" }), "2026-09-29").R24).toBe(
      "01.08.2023 s/d 20.03.2027",
    );
  });

  it("alamat domisili dipecah ke 3 baris (R16–R18) tanpa kehilangan kata", () => {
    const cells = buildPrintCells(withPersonal(), "2026-09-29");
    const lines = [cells.R16, cells.R17, cells.R18];
    expect(lines.every((line) => typeof line === "string" && line.length > 0)).toBe(true);
    expect(lines.join(" ")).toBe(withPersonal().personal?.domicileAddress);
    expect(String(cells.R16).length).toBeLessThanOrEqual(46);
  });

  it("pendidikan & pelatihan urut tahun naik, maks 5 baris", () => {
    const cells = buildPrintCells(base(), "2026-09-29");
    expect([cells.D30, cells.U30, cells.Y30]).toEqual(["SMA Negeri 8 Jakarta", 2016, "IPA"]);
    expect([cells.D31, cells.U31, cells.Y31]).toEqual(["Universitas Indonesia", 2020, "Manajemen"]);
    expect([cells.D38, cells.R38, cells.AB38]).toEqual(["K3 Umum", "Kemnaker", 2024]);
    const many = Array.from({ length: 7 }, (_, i) => ({
      id: `x${i}`,
      schoolName: `Sekolah ${i}`,
      major: null,
      graduationYear: 2000 + i,
    }));
    const limited = buildPrintCells(base({ educations: many }), "2026-09-29");
    expect(limited.D34).toBe("Sekolah 4");
    expect(Object.keys(limited)).not.toContain("D35");
  });

  it("susunan keluarga: ayah, pasangan pegawai laki-laki → baris Isteri, anak urut lahir; usia", () => {
    const cells = buildPrintCells(withPersonal(), "2026-09-29");
    expect([cells.G63, cells.P63, cells.S63]).toEqual(["Pak Pratama", "Laki-laki", 60]);
    expect(cells.G64).toBeUndefined(); // ibu tidak ada
    expect(cells.G65).toBeUndefined(); // baris Suami kosong untuk pegawai laki-laki
    expect([cells.G66, cells.P66, cells.S66]).toEqual(["Sri Wahyuni", "Perempuan", 27]);
    expect([cells.G67, cells.S67]).toEqual(["Anak Pertama", 4]);
    expect([cells.G68, cells.S68]).toEqual(["Anak Kedua", 2]);
    expect(Object.values(cells)).not.toContain("Adik"); // saudara tidak punya baris di template
  });

  it("pasangan pegawai perempuan → baris Suami", () => {
    const data = withPersonal();
    const cells = buildPrintCells({ ...data, gender: "FEMALE" }, "2026-09-29");
    expect([cells.G65, cells.P65]).toEqual(["Sri Wahyuni", "Laki-laki"]);
    expect(cells.G66).toBeUndefined();
  });

  it("kontak darurat: nomor dari data kerja, nama/hubungan/alamat bila cocok dengan keluarga", () => {
    const cells = buildPrintCells(withPersonal(), "2026-09-29");
    expect([cells.D76, cells.M76, cells.P76, cells.AB76]).toEqual([
      "Sri Wahyuni",
      "Pasangan",
      "Jl. Mawar 1",
      "0813-0000-0007",
    ]);
  });

  it("tanpa hak data pribadi (key sensitif tidak dikirim API): bagian sensitif kosong", () => {
    const cells = buildPrintCells(base(), "2026-09-29");
    for (const ref of ["R11", "R13", "R16", "R17", "R18", "R19", "G63", "G66", "D76"]) {
      expect(cells[ref] ?? null).toBeNull();
    }
    expect(cells.AB76).toBe("0813-0000-0007");
    expect(cells.R12).toBe("Laki-laki");
  });
});

describe("utilitas", () => {
  it("ageOn memperhitungkan hari ulang tahun", () => {
    expect(ageOn("2000-09-30", "2026-09-29")).toBe(25);
    expect(ageOn("2000-09-29", "2026-09-29")).toBe(26);
    expect(ageOn(null, "2026-09-29")).toBeNull();
    expect(ageOn("2027-01-01", "2026-09-29")).toBeNull();
  });

  it("wrapText: kata panjang tidak dipotong; sisa masuk baris terakhir", () => {
    expect(wrapText("a b c", 3, 3)).toEqual(["a b", "c"]);
    expect(wrapText("satu dua tiga empat lima", 4, 2)).toEqual(["satu", "dua tiga empat lima"]);
    expect(wrapText("   ", 10, 3)).toEqual([]);
  });

  it("printFileName aman untuk Windows", () => {
    expect(printFileName({ employeeNumber: "ACP/2023:07", fullName: 'Agus "AP" Pratama' })).toBe(
      "Data Karyawan - ACP-2023-07 - Agus -AP- Pratama.xlsx",
    );
  });

  it("columnIndex", () => {
    expect([columnIndex("A"), columnIndex("Z"), columnIndex("AB"), columnIndex("AE")]).toEqual([
      1, 26, 28, 31,
    ]);
  });
});

describe("fillXlsxTemplate (template asli)", () => {
  const original = readSheet(TEMPLATE);
  const filled = readSheet(
    fillXlsxTemplate(TEMPLATE, PRINT_SHEET_PATH, buildPrintCells(withPersonal(), "2026-09-29")),
  );

  it("nilai tertulis di sel yang benar; label template tetap", () => {
    expect(filled.value("R9")).toBe("Agus Pratama");
    expect(filled.value("R24")).toBe("01.08.2023 s/d");
    expect(filled.value("U30")).toBe(2016);
    expect(filled.value("G66")).toBe("Sri Wahyuni");
    expect(filled.value("S66")).toBe(27);
    // Karakter khusus XML (& < >) di-escape dengan benar.
    expect(filled.value("R25")).toBe("Human Resources & GA");
    expect([filled.value("R16"), filled.value("R17"), filled.value("R18")].join(" ")).toContain(
      "<RT 01>",
    );
    expect(filled.value("L9")).toBe("Nama Lengkap");
    expect(filled.value("D66")).toBe("Isteri");
    expect(filled.value("R23")).toBe("MagangHub Bacth II Tahun 2026");
    expect(filled.value("B2")).toBe("PT. ARTHASIA CIPTA PRATAMA");
  });

  it("gaya sel (border/font) dipertahankan", () => {
    for (const ref of ["R9", "G66", "U30", "AB76"]) {
      expect(filled.cells.get(ref)?.getAttribute("s")).toBe(
        original.cells.get(ref)?.getAttribute("s"),
      );
    }
  });

  it("merge, pengaturan cetak, gambar logo & file lain tidak berubah", () => {
    const merges = (xml: string) => xml.match(/<mergeCell ref="[^"]+"\/>/g) ?? [];
    expect(merges(filled.xml)).toEqual(merges(original.xml));
    expect(filled.xml).toContain('<pageSetup paperSize="9" scale="80"');
    expect(filled.xml).toContain('<drawing r:id="rId2"/>');
    expect(filled.xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(
      true,
    );
    expect(filled.doc.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(Object.keys(filled.files).sort()).toEqual(Object.keys(original.files).sort());
    for (const name of Object.keys(original.files)) {
      if (name === PRINT_SHEET_PATH) continue;
      expect(filled.files[name], name).toEqual(original.files[name]);
    }
  });

  it("tepat satu deklarasi XML, juga bila serializer menyertakannya (perilaku Chromium)", () => {
    expect(filled.xml.match(/<\?xml/g)).toHaveLength(1);
    const doc = new DOMParser().parseFromString("<a/>", "application/xml");
    const original = XMLSerializer.prototype.serializeToString;
    const spy = vi.spyOn(XMLSerializer.prototype, "serializeToString").mockImplementation(function (
      this: XMLSerializer,
      node: Node,
    ) {
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${original.call(this, node)}`;
    });
    expect(serializeSheet(doc).match(/<\?xml/g)).toHaveLength(1);
    spy.mockRestore();
  });

  it("urutan sel dalam baris tetap naik (syarat Excel)", () => {
    for (const row of Array.from(filled.doc.getElementsByTagNameNS(MAIN_NS, "row"))) {
      const cols = Array.from(row.getElementsByTagNameNS(MAIN_NS, "c")).map((c) =>
        columnIndex((c.getAttribute("r") ?? "").replace(/\d+/g, "")),
      );
      expect(cols).toEqual([...cols].sort((a, b) => a - b));
    }
  });

  it("menolak file bukan xlsx & alamat sel tidak valid", () => {
    expect(() => fillXlsxTemplate(new Uint8Array([1, 2, 3]), PRINT_SHEET_PATH, {})).toThrow(
      XlsxTemplateError,
    );
    expect(() => fillXlsxTemplate(TEMPLATE, "xl/worksheets/sheet9.xml", {})).toThrow(
      XlsxTemplateError,
    );
    expect(() => fillXlsxTemplate(TEMPLATE, PRINT_SHEET_PATH, { A0: "x" })).toThrow(
      XlsxTemplateError,
    );
  });
});

describe("foto di formulir cetak (D-037)", () => {
  // JPEG palsu cukup untuk menguji struktur paket; isi gambar tidak dibaca di sini.
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const withPhoto = unzipSync(
    fillXlsxTemplate(TEMPLATE, PRINT_SHEET_PATH, buildPrintCells(base(), "2026-09-29"), [
      photoImage(jpeg),
    ]),
  );
  const originalFiles = unzipSync(TEMPLATE);
  const text = (name: string) => strFromU8(withPhoto[name] as Uint8Array);

  it("file gambar, relasi, dan tipe konten ditambahkan", () => {
    expect(withPhoto["xl/media/hris-image-1.jpeg"]).toEqual(jpeg);
    expect(text("xl/drawings/_rels/drawing1.xml.rels")).toContain(
      'Id="rIdHrisImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/hris-image-1.jpeg"',
    );
    expect(text("[Content_Types].xml")).toContain(
      '<Default Extension="jpeg" ContentType="image/jpeg"/>',
    );
  });

  it("foto ditambatkan di bingkai B9:J25 dengan jarak 3 px; logo template tetap", () => {
    const drawing = new DOMParser().parseFromString(
      text("xl/drawings/drawing1.xml"),
      "application/xml",
    );
    expect(drawing.getElementsByTagName("parsererror")).toHaveLength(0);
    const XDR = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
    const anchors = Array.from(drawing.getElementsByTagNameNS(XDR, "twoCellAnchor"));
    expect(anchors).toHaveLength(2);
    const pos = (anchor: Element, tag: "from" | "to") => {
      const el = anchor.getElementsByTagNameNS(XDR, tag)[0] as Element;
      return ["col", "colOff", "row", "rowOff"].map((name) =>
        Number(el.getElementsByTagNameNS(XDR, name)[0]?.textContent),
      );
    };
    const [logo, photo] = anchors as [Element, Element];
    expect(pos(logo, "from")).toEqual([26, 152401, 0, 0]); // logo kanan atas tidak bergeser
    expect(pos(photo, "from")).toEqual([1, 28575, 8, 28575]); // B9 + 3 px
    expect(pos(photo, "to")).toEqual([9, 266700 - 28575, 24, 184150 - 28575]); // J25 − 3 px
    const ids = Array.from(drawing.getElementsByTagNameNS(XDR, "cNvPr")).map((el) =>
      el.getAttribute("id"),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(photo.getElementsByTagNameNS(XDR, "cNvPr")[0]?.getAttribute("name")).toBe(
      "Foto Karyawan",
    );
  });

  it("file lain selain drawing/relasi/tipe konten/lembar tetap identik", () => {
    const changed = new Set([
      PRINT_SHEET_PATH,
      "xl/drawings/drawing1.xml",
      "xl/drawings/_rels/drawing1.xml.rels",
      "[Content_Types].xml",
    ]);
    for (const name of Object.keys(originalFiles)) {
      if (!changed.has(name)) expect(withPhoto[name], name).toEqual(originalFiles[name]);
    }
    expect(withPhoto["xl/media/image1.png"]).toEqual(originalFiles["xl/media/image1.png"]);
  });

  it("rasio area foto ≈ 3:4 (sesuai potongan foto profil)", () => {
    expect(PRINT_PHOTO_ASPECT).toBeCloseTo(246 / 322.67, 2);
    expect(Math.abs(PRINT_PHOTO_ASPECT - 3 / 4)).toBeLessThan(0.02);
  });

  it("posisi gambar tidak valid ditolak", () => {
    const bad = { ...photoImage(jpeg), from: { col: -1, row: 0, colOffset: 0, rowOffset: 0 } };
    expect(() => fillXlsxTemplate(TEMPLATE, PRINT_SHEET_PATH, {}, [bad])).toThrow(
      XlsxTemplateError,
    );
  });
});

describe("centerCrop & fitWithin (foto 3:4)", () => {
  it("potong tengah lanskap & potret ke 3:4", () => {
    expect(centerCrop(1600, 900, 3 / 4)).toEqual({ sx: 463, sy: 0, sw: 675, sh: 900 });
    expect(centerCrop(600, 1200, 3 / 4)).toEqual({ sx: 0, sy: 200, sw: 600, sh: 800 });
    expect(centerCrop(300, 400, 3 / 4)).toEqual({ sx: 0, sy: 0, sw: 300, sh: 400 });
    expect(() => centerCrop(0, 10, 1)).toThrow(ImageProcessingError);
  });

  it("diperkecil agar muat, tidak pernah diperbesar", () => {
    expect(fitWithin(1350, 1800, { width: 600, height: 800 })).toEqual({ width: 600, height: 800 });
    expect(fitWithin(300, 400, { width: 600, height: 800 })).toEqual({ width: 300, height: 400 });
  });
});
