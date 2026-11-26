import { describe, expect, test } from "bun:test";
import {
  contractEndFromDuration,
  contractRuleIssueCode,
  IMPORT_ISSUE_MESSAGES,
  importContractPeriod,
  normalizeImportRow,
  parseContractDuration,
  parseContractStage,
  suggestMapping,
  validateContractStage,
} from "../src/index.ts";

// KTR-D12 (K3): kolom kontrak import karyawan. Data FIKTIF.

describe("kolom kontrak import", () => {
  test.each([
    [1, 1],
    ["2", 2],
    ["III", 3],
    ["ii", 2],
    ["PKWT 2", 2],
    ["PKWT III", 3],
    ["ke-3", 3],
  ] as const)("tahap %p → %p", (input, expected) => {
    expect(parseContractStage(input)).toEqual({ value: expected });
  });

  test.each([["IV"], [4], ["0"], ["dua"]])("tahap tidak dikenali %p", (input) => {
    expect(parseContractStage(input)).toEqual({ issue: "UNKNOWN_CONTRACT_STAGE" });
  });

  test.each([
    [6, 6],
    ["6", 6],
    ["6 bulan", 6],
    ["12 Bulan", 12],
    ["1 tahun", 12],
  ] as const)("durasi %p → %p bulan", (input, expected) => {
    expect(parseContractDuration(input)).toEqual({ value: expected });
  });

  test.each([["enam"], [0], ["61"], [2.5]])("durasi tidak valid %p", (input) => {
    expect(parseContractDuration(input)).toEqual({ issue: "INVALID_CONTRACT_DURATION" });
  });

  test("akhir dari durasi = mulai + N bulan − 1 hari (akhir bulan dijepit)", () => {
    expect(contractEndFromDuration("2026-11-21", 3)).toBe("2027-02-20");
    expect(contractEndFromDuration("2025-01-06", 6)).toBe("2025-07-05");
    expect(contractEndFromDuration("2025-08-31", 6)).toBe("2026-02-27");
  });

  test("baris → kolom kontrak terurai; tanggal tak terbaca = error di kolomnya", () => {
    const { row, issues } = normalizeImportRow({
      employeeNumber: "K-1",
      employmentStatusText: "PKWT II - 6 Bulan",
      contractStage: "II",
      contractStartDate: "06/01/2025",
      contractEndDate: "2025-07-05",
      contractDurationMonths: "6",
      pkwtFirstStartDate: "2024-01-06",
      probationStartDate: "kemarin",
    });
    expect(row.contract).toEqual({
      stage: 2,
      startDate: "2025-01-06",
      endDate: "2025-07-05",
      durationMonths: 6,
      firstPkwtStartDate: "2024-01-06",
    });
    expect(row.contractSequence).toBe(2);
    expect(issues).toEqual([
      { field: "probationStartDate", code: "INVALID_DATE", severity: "ERROR" },
    ]);
  });

  test("periode: PKWT (tahap kolom > teks status, durasi), percobaan (cadangan kolom kontrak), kategori lain diabaikan", () => {
    expect(importContractPeriod({}, "PKWT")).toBeNull();
    expect(
      importContractPeriod({ startDate: "2025-01-06" }, "PKWT", { sequence: 2, durationMonths: 6 }),
    ).toMatchObject({ kind: "PKWT", sequence: 2, endDate: "2025-07-05" });
    expect(
      importContractPeriod({ stage: 1, startDate: "2025-01-06", durationMonths: 3 }, "PKWT", {
        sequence: 2,
      }),
    ).toMatchObject({ sequence: 1, endDate: "2025-04-05", endField: "contractDurationMonths" });
    expect(
      importContractPeriod({ startDate: "2025-01-06", endDate: "2025-04-05" }, "PROBATION"),
    ).toMatchObject({
      kind: "PROBATION",
      sequence: null,
      startDate: "2025-01-06",
      endDate: "2025-04-05",
      startField: "contractStartDate",
    });
    expect(importContractPeriod({ endDate: "2025-12-31" }, "PERMANENT")).toEqual({
      ignored: ["contractEndDate"],
    });
  });

  test("setiap pesan aturan tahap kontrak punya kode & pesan Indonesia", () => {
    const messages = [
      ...validateContractStage({
        kind: "PKWT",
        sequence: 1,
        startDate: "2025-01-01",
        endDate: "2024-01-01",
        previous: null,
      }).errors,
      ...validateContractStage({
        kind: "PKWT",
        sequence: 1,
        startDate: "2020-01-01",
        endDate: "2026-01-01",
        previous: null,
      }).errors,
      ...validateContractStage({
        kind: "PKWT",
        sequence: 3,
        startDate: "2025-01-01",
        endDate: "2026-06-01",
        previous: { endDate: "2025-01-10", sequence: 1, firstPkwtStart: "2025-02-01" },
      }).errors,
      ...validateContractStage({
        kind: "PKWT",
        sequence: 4,
        startDate: "2025-01-01",
        endDate: "2025-06-01",
        previous: null,
      }).errors,
      ...validateContractStage({
        kind: "PROBATION",
        sequence: 1,
        startDate: "2025-01-01",
        endDate: "2025-06-01",
        previous: null,
      }).errors,
      ...validateContractStage({
        kind: "PKWT",
        sequence: 2,
        startDate: "2025-02-01",
        endDate: "2025-06-01",
        previous: { endDate: "2025-01-10", sequence: 1, firstPkwtStart: "2024-01-01" },
      }).warnings,
      ...validateContractStage({
        kind: "PKWT",
        sequence: 2,
        startDate: "2024-12-01",
        endDate: "2028-06-01",
        previous: { endDate: "2025-01-10", sequence: 1, firstPkwtStart: "2024-01-01" },
      }).errors,
      "Tanggal mulai kontrak tidak boleh sebelum tanggal masuk.",
      "Tanggal mulai PKWT 1 wajib untuk tahap lama tanpa kontrak sebelumnya.",
      "Tanggal mulai PKWT 1 harus sama dengan awal tahap 1.",
    ];
    expect(messages.length).toBeGreaterThan(10);
    for (const message of messages) {
      const code = contractRuleIssueCode(message);
      expect({ message, code }).not.toMatchObject({ code: "CONTRACT_RULE" });
      expect(IMPORT_ISSUE_MESSAGES[code]).toBeDefined();
    }
  });

  test("header kantor dikenali sebagai kolom kontrak", () => {
    const headers = [
      "Tahap PKWT",
      "Mulai Kontrak",
      "Akhir Kontrak",
      "Durasi Kontrak (bulan)",
      "Mulai PKWT 1",
      "Mulai Percobaan",
      "Akhir Percobaan",
    ];
    const mapping = suggestMapping({ headerRowIndex: 0, headers, rows: [], score: 1 });
    expect(mapping.map((m) => m.field)).toEqual([
      "contractStage",
      "contractStartDate",
      "contractEndDate",
      "contractDurationMonths",
      "pkwtFirstStartDate",
      "probationStartDate",
      "probationEndDate",
    ]);
  });
});
