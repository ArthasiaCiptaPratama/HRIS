import { describe, expect, test } from "bun:test";
import {
  formatWarningNumber,
  isAboveSuggestion,
  suggestWarningLevel,
  warningEffectiveUntil,
  warningLetterBulkDraftInputSchema,
  warningLetterDraftInputSchema,
  warningLetterState,
} from "../src/index.ts";

// ARS-D7–D13: aturan murni surat peringatan.
describe("surat peringatan (ARS-D8–D11)", () => {
  test.each([
    [[], "SP1"],
    [["SP1"], "SP2"],
    [["SP1", "SP2"], "SP3"],
    [["SP3"], "SP3"],
  ] as const)("SP aktif %p → saran %s", (active, expected) => {
    expect(suggestWarningLevel(active)).toBe(expected);
  });

  test("tingkat di atas saran wajib beralasan", () => {
    expect(isAboveSuggestion("SP3", "SP1")).toBe(true);
    expect(isAboveSuggestion("SP2", "SP2")).toBe(false);
    expect(isAboveSuggestion("SP1", "SP2")).toBe(false);
  });

  test("nomor otomatis per PT per tahun dengan bulan romawi", () => {
    expect(formatWarningNumber(7, "SP1", "acp", "2026-10-15")).toBe("007/SP1/HRD-ACP/X/2026");
    expect(formatWarningNumber(123, "SP3", "ABC", "2027-01-02")).toBe("123/SP3/HRD-ABC/I/2027");
  });

  test("berlaku s/d = hari terakhir N bulan sejak terbit (PP 35/2021: paling lama 6 bulan)", () => {
    expect(warningEffectiveUntil("2026-10-15", 6)).toBe("2027-04-14");
    expect(warningEffectiveUntil("2026-01-01", 6)).toBe("2026-06-30");
    expect(warningEffectiveUntil("2026-08-31", 6)).toBe("2027-02-27");
  });

  test("status tampilan", () => {
    const base = {
      status: "ISSUED" as const,
      effectiveUntil: "2027-04-15",
      deliveredAt: null,
      acknowledgedAt: null,
    };
    expect(warningLetterState(base, "2026-10-20")).toBe("ACTIVE");
    expect(
      warningLetterState({ ...base, deliveredAt: "x", acknowledgedAt: "y" }, "2026-10-20"),
    ).toBe("CONFIRMED");
    expect(warningLetterState(base, "2027-04-15")).toBe("ACTIVE");
    expect(warningLetterState(base, "2027-04-16")).toBe("EXPIRED");
    expect(warningLetterState({ ...base, status: "REVOKED" }, "2026-10-20")).toBe("REVOKED");
    expect(
      warningLetterState({ ...base, status: "DRAFT", effectiveUntil: null }, "2026-10-20"),
    ).toBe("DRAFT");
  });

  test("draft: uraian minimal 10 karakter, tanggal kejadian wajib (ARS-D19), maks 31 hari ALPHA", () => {
    const base = {
      employeeId: crypto.randomUUID(),
      level: "SP1",
      violationTypeId: crypto.randomUUID(),
      incidentDate: "2026-10-10",
      description: "Tidak hadir 3 hari berturut-turut.",
    };
    const ok = warningLetterDraftInputSchema.safeParse(base);
    expect(ok.success).toBe(true);
    expect(ok.data?.alphaDayIds).toEqual([]);
    expect(
      warningLetterDraftInputSchema.safeParse({ ...base, description: "pendek" }).success,
    ).toBe(false);
    const noDate = warningLetterDraftInputSchema.safeParse({ ...base, incidentDate: undefined });
    expect(noDate.success).toBe(false);
    expect(noDate.error?.issues[0]?.message).toBe("Isi tanggal kejadian.");
    expect(warningLetterDraftInputSchema.safeParse({ ...base, incidentDate: "" }).success).toBe(
      false,
    );
  });

  test("draft massal (ARS-D20): 1–50 karyawan, tingkat AUTO atau SP1–SP3", () => {
    const { employeeId: _e, ...rest } = {
      employeeId: "",
      violationTypeId: crypto.randomUUID(),
      incidentDate: "2026-10-10",
      description: "Tidak hadir 3 hari berturut-turut.",
    };
    const ids = (n: number) => Array.from({ length: n }, () => crypto.randomUUID());
    expect(
      warningLetterBulkDraftInputSchema.safeParse({ ...rest, employeeIds: ids(2), level: "AUTO" })
        .success,
    ).toBe(true);
    expect(
      warningLetterBulkDraftInputSchema.safeParse({ ...rest, employeeIds: [], level: "SP1" })
        .success,
    ).toBe(false);
    expect(
      warningLetterBulkDraftInputSchema.safeParse({ ...rest, employeeIds: ids(51), level: "SP1" })
        .success,
    ).toBe(false);
    expect(
      warningLetterBulkDraftInputSchema.safeParse({ ...rest, employeeIds: ids(1), level: "SP4" })
        .success,
    ).toBe(false);
  });
});
