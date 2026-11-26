import {
  buildRawRows,
  type GridCell,
  IMPORT_FIELDS,
  type ImportFieldKey,
  normalizeImportRow,
  pickSheet,
  suggestMapping,
} from "@hris/shared";
import { strFromU8, unzipSync } from "fflate";
import readXlsxFile from "read-excel-file/node";
import { describe, expect, it, vi } from "vitest";
import {
  buildImportTemplate,
  IMPORT_TEMPLATE_FILE_NAME,
} from "@/features/employee/import/template/build-template";

const input = {
  companies: [
    { code: "AA", name: "PT Contoh Satu" },
    { code: "BB", name: "PT Contoh Dua" },
  ],
  statuses: ["Tetap", "PKWT", "Probation"],
  canWriteSensitive: true,
};
const expected: ImportFieldKey[] = [
  "employeeNumber",
  "fullName",
  "companyCode",
  "joinDate",
  "positionName",
  "departmentName",
  "divisionName",
  "employmentStatusText",
  "workLocationName",
  "phoneNumber",
  "personalEmail",
  "gender",
  "religion",
  "birthPlace",
  "birthDate",
  "ktpNumber",
  "npwpNumber",
  "ptkpStatus",
  "bpjsEmploymentNumber",
  "bpjsHealthNumber",
  "bankName",
  "bankAccountNumber",
  "ktpAddress",
  "domicileAddress",
  "homebaseName",
  "contractStage",
  "contractStartDate",
  "contractEndDate",
  "contractDurationMonths",
  "pkwtFirstStartDate",
  "probationStartDate",
  "probationEndDate",
  "dailyWage",
];
const xmlOf = (bytes: Uint8Array) => {
  const files = unzipSync(bytes);
  return (path: string) => strFromU8(files[path] as Uint8Array);
};

describe("template import HRIS", () => {
  it("menghasilkan bytes yang sama tanpa mengubah data pemanggil", () => {
    const snapshot = structuredClone(input);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2025-01-01"));
      const first = buildImportTemplate(input);
      vi.setSystemTime(new Date("2026-11-19"));
      expect(buildImportTemplate(input)).toEqual(first);
      expect(input).toEqual(snapshot);
    } finally {
      vi.useRealTimers();
    }
  });
  it("dibaca seperti unggahan, memilih data, mengenali 33 kolom, dan contoh tanpa ERROR", async () => {
    const bytes = buildImportTemplate(input);
    const sheets = await readXlsxFile(Buffer.from(bytes));
    const selected = pickSheet(
      sheets.map((sheet) => ({
        name: sheet.sheet,
        grid: sheet.data.map((row) => row.map((cell) => (cell ?? null) as GridCell)),
      })),
    );
    expect(selected?.sheet.name).toBe("Data karyawan");
    if (!selected) throw new Error("Lembar data tidak terdeteksi");
    expect(selected.detected.headerRowIndex).toBe(0);
    const suggestions = suggestMapping(selected.detected);
    expect(suggestions.map((column) => column.field)).toEqual(expected);
    expect(suggestions.every((column) => column.confidence >= 0.85)).toBe(true);
    expect(selected.detected.rows).toHaveLength(2);
    const rows = buildRawRows(
      selected.detected.rows,
      suggestions.map((column) => column.field),
    );
    rows.forEach(({ raw }, index) => {
      expect(raw.employeeNumber).toBe(`CONTOH-00${index + 1}`);
      expect(raw.fullName).toContain("Contoh");
      expect(raw.companyCode).toBe("AA");
      expect(raw.employmentStatusText).toBe(index === 1 ? "Harian Lepas (THL)" : "Tetap");
      if (index === 1) expect(normalizeImportRow(raw).row.contract.dailyWage).toBe(150000);
      expect(raw.phoneNumber).toBe(`08123456789${index + 1}`);
      expect(String(raw.ktpNumber)).toHaveLength(16);
      expect(String(raw.npwpNumber)).toHaveLength(15);
      expect(normalizeImportRow(raw).issues.filter((issue) => issue.severity === "ERROR")).toEqual(
        [],
      );
    });
    expected.forEach((key, column) => {
      const sensitive = ["personal", "bank", "family"].includes(IMPORT_FIELDS[key].section);
      expect(selected.detected.headers[column]?.endsWith(" 🔒")).toBe(sensitive);
    });
    expect(IMPORT_TEMPLATE_FILE_NAME).toBe("Template-import-karyawan-HRIS.xlsx");
  });

  it("dropdown, warna, pembekuan dan format teks berlaku sampai baris 1000", () => {
    const xml = xmlOf(buildImportTemplate(input));
    const sheet = xml("xl/worksheets/sheet1.xml");
    const doc = new DOMParser().parseFromString(sheet, "application/xml");
    const validations = [...doc.querySelectorAll("dataValidation")];
    expect(validations).toHaveLength(5);
    const choices = (range: string) =>
      validations.find((item) => item.getAttribute("sqref") === range);
    expect(choices("C2:C1000")?.getAttribute("type")).toBe("list");
    expect(choices("C2:C1000")?.textContent).toBe('"AA,BB"');
    expect(choices("H2:H1000")?.textContent).toBe('"Tetap,PKWT,Probation"');
    expect(choices("L2:L1000")?.textContent).toBe('"Laki-laki,Perempuan"');
    expect(choices("M2:M1000")?.textContent).toContain("Konghucu,Lainnya");
    expect(choices("R2:R1000")?.textContent).toBe('"TK/0,TK/1,TK/2,TK/3,K/0,K/1,K/2,K/3"');
    for (const [range, field] of [
      ["C2:C1000", "companyCode"],
      ["H2:H1000", "employmentStatusText"],
      ["L2:L1000", "gender"],
      ["M2:M1000", "religion"],
      ["R2:R1000", "ptkpStatus"],
    ] as const) {
      const values = choices(range)?.textContent?.slice(1, -1).split(",") ?? [];
      expect(values.length).toBeGreaterThan(0);
      for (const value of values) {
        expect(
          normalizeImportRow({ employeeNumber: "CONTOH-001", [field]: value }).issues.filter(
            (issue) => issue.severity === "ERROR",
          ),
        ).toEqual([]);
      }
    }
    expect(sheet).toContain('xSplit="2" ySplit="1" topLeftCell="C2"');
    for (const column of ["A", "B", "C", "D", "E", "F", "H"]) {
      expect(doc.querySelector(`c[r="${column}1"]`)?.getAttribute("s")).toBe("21");
    }
    for (const column of ["A", "J", "P", "Q", "S", "T", "V"]) {
      expect(doc.querySelector(`c[r="${column}2"]`)?.getAttribute("s")).toBe("23");
    }
    expect(doc.querySelector('c[r="P1"]')?.getAttribute("s")).toBe("22");
    expect(doc.querySelector('c[r="G1"]')?.getAttribute("s")).toBe("2");
    expect(doc.querySelector('c[r="D2"]')?.getAttribute("s")).toBe("24");
    expect(xml("xl/styles.xml")).toContain('numFmtId="49"');
  });

  it.each([true, false])(
    "Petunjuk sehari-hari dan kalimat izin sesuai hak akun: %s",
    async (canWriteSensitive) => {
      const sheets = await readXlsxFile(
        Buffer.from(buildImportTemplate({ ...input, canWriteSensitive })),
      );
      const instructions =
        sheets
          .find((sheet) => sheet.sheet === "Petunjuk")
          ?.data.flat()
          .join(" ") ?? "";
      expect(
        instructions.includes(
          "Akun Anda belum punya izin data pribadi: kolom 🔒 tidak akan tersimpan; kolom lain tetap masuk.",
        ),
      ).toBe(!canWriteSensitive);
      expect(instructions).toContain("Hapus 2 baris contoh");
      expect(instructions).toContain("AA — PT Contoh Satu");
      expect(instructions).toContain("BB — PT Contoh Dua");
      input.statuses.forEach((status) => {
        expect(instructions).toContain(status);
      });
      expect(instructions).not.toMatch(/\b(field|mapping|header|format string|grant)\b/i);
    },
  );

  it("daftar panjang tetap dapat dibaca dan tidak merebut pilihan lembar data", async () => {
    const statuses = Array.from({ length: 80 }, (_, i) => `PKWT ${i + 1}`);
    const bytes = buildImportTemplate({ ...input, statuses });
    const sheets = await readXlsxFile(Buffer.from(bytes));
    expect(sheets.map((sheet) => sheet.sheet)).toContain("Pilihan");
    expect(
      pickSheet(
        sheets.map((sheet) => ({
          name: sheet.sheet,
          grid: sheet.data.map((row) => row.map((cell) => (cell ?? null) as GridCell)),
        })),
      )?.sheet.name,
    ).toBe("Data karyawan");
    const xml = xmlOf(bytes);
    expect(xml("xl/workbook.xml")).toContain('state="hidden"');
    expect(xml("xl/workbook.xml")).toContain('name="_xlsx_choices_0_7"');
    expect(xml("xl/worksheets/sheet3.xml")).toContain("PKWT 80");
  });
});
