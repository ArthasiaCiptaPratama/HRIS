import { describe, expect, test } from "bun:test";
import {
  assetInputSchema,
  assignAssetInputSchema,
  loanState,
  nextAssetSequence,
  ppeIssueInputSchema,
  ppeReplacementDate,
  ppeTypeInputSchema,
  suggestAssetCode,
} from "../src/index.ts";

// ARS-D1–D6 (Arsip gelombang 2a): aturan murni aset & APD yang dipakai API dan web.

describe("kode aset (ARS-D4)", () => {
  test("pola <PT>-<KATEGORI>-<NNNN>", () => {
    expect(suggestAssetCode("ACP", "LPT", 7)).toBe("ACP-LPT-0007");
    expect(suggestAssetCode("acp", "hp", 12345)).toBe("ACP-HP-12345");
  });

  test("urutan berikutnya = nomor terbesar berpola sama + 1; kode manual diabaikan", () => {
    const codes = ["ACP-LPT-0001", "ACP-LPT-0009", "ACP-HP-0040", "LAMA-123", "ACP-LPT-ABCD"];
    expect(nextAssetSequence(codes, "ACP", "LPT")).toBe(10);
    expect(nextAssetSequence(codes, "ACP", "HT")).toBe(1);
    expect(nextAssetSequence([], "CD2", "LPT")).toBe(1);
  });
});

describe("jatuh tempo pinjaman (ARS-D5)", () => {
  test.each([
    [null, "2026-10-13", "NONE"],
    ["2026-10-20", "2026-10-13", "OPEN"],
    ["2026-10-15", "2026-10-13", "DUE_SOON"],
    ["2026-10-13", "2026-10-13", "DUE_SOON"],
    ["2026-10-12", "2026-10-13", "OVERDUE"],
  ] as const)("kembali %p, hari ini %s → %s", (due, today, state) => {
    expect(loanState(due, today)).toBe(state);
  });
});

describe("masa ganti APD (ARS-D5)", () => {
  test("tanggal ganti = tanggal terima + bulan; tanpa masa ganti → null", () => {
    expect(ppeReplacementDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(ppeReplacementDate("2026-10-13", 12)).toBe("2027-10-13");
    expect(ppeReplacementDate("2026-10-13", null)).toBeNull();
  });
});

describe("validasi input", () => {
  const base = {
    categoryId: "6f1c1f1e-7f1a-4d1e-9a51-2a1b9c7d1e01",
    companyId: "6f1c1f1e-7f1a-4d1e-9a51-2a1b9c7d1e02",
    name: "Laptop kerja",
    condition: "GOOD",
  } as const;

  test("aset: kode kosong = otomatis; kode diubah ke huruf besar; harga string desimal", () => {
    const a = assetInputSchema.parse({ ...base, code: "", purchasePrice: "15000000.50" });
    expect(a.code).toBeNull();
    expect(a.purchasePrice).toBe("15000000.50");
    expect(assetInputSchema.parse({ ...base, code: "acp-lpt-0001" }).code).toBe("ACP-LPT-0001");
  });

  test("aset: harga bukan angka / negatif / >2 desimal ditolak; kode berspasi ditolak", () => {
    for (const purchasePrice of ["abc", "-1", "10.555"]) {
      expect(assetInputSchema.safeParse({ ...base, purchasePrice }).success).toBe(false);
    }
    expect(assetInputSchema.safeParse({ ...base, code: "ACP LPT 1" }).success).toBe(false);
  });

  test("serah-terima: kembali paling lambat tidak boleh sebelum tanggal serah", () => {
    const ok = { employeeId: base.categoryId, assignedAt: "2026-10-13", conditionOut: "GOOD" };
    expect(assignAssetInputSchema.safeParse({ ...ok, dueBackAt: "2026-10-16" }).success).toBe(true);
    expect(assignAssetInputSchema.safeParse({ ...ok, dueBackAt: "2026-10-12" }).success).toBe(
      false,
    );
    expect(assignAssetInputSchema.safeParse({ ...ok, dueBackAt: null }).success).toBe(true);
  });

  test("APD: jumlah 1–100; masa ganti 1–120 bulan atau kosong", () => {
    const issue = {
      employeeId: base.categoryId,
      ppeTypeId: base.companyId,
      issuedAt: "2026-10-13",
    };
    expect(ppeIssueInputSchema.safeParse({ ...issue, quantity: 2, size: "42" }).success).toBe(true);
    expect(ppeIssueInputSchema.safeParse({ ...issue, quantity: 0 }).success).toBe(false);
    expect(
      ppeTypeInputSchema.safeParse({ code: "SPT", name: "Sepatu safety", replaceAfterMonths: 12 })
        .success,
    ).toBe(true);
    expect(
      ppeTypeInputSchema.safeParse({ code: "SPT", name: "Sepatu safety", replaceAfterMonths: 0 })
        .success,
    ).toBe(false);
    expect(ppeTypeInputSchema.parse({ code: "hlm", name: "Helm" })).toMatchObject({
      code: "HLM",
      replaceAfterMonths: null,
      mustReturn: false,
    });
  });
});
