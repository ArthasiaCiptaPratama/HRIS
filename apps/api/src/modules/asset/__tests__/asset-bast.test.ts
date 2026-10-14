import { describe, expect, test } from "bun:test";
import { bastNumber, buildBastPdf, formatIndonesianDate } from "../asset-bast.ts";

// ARS-D2: nomor BAST unik per berita acara (serah, kembali, hilang, APD) walau tanggal & aset sama.
describe("nomor BAST", () => {
  const tx = "3f2a9c1e-0000-4000-8000-000000000001";
  test("jenis berbeda pada aset & tanggal sama → nomor berbeda", () => {
    const serah = bastNumber("ASSET_HANDOVER", "ACP-LPT-0001", "2026-10-14", tx);
    const kembali = bastNumber("ASSET_RETURN", "ACP-LPT-0001", "2026-10-14", tx);
    const hilang = bastNumber("ASSET_LOST", "ACP-LPT-0001", "2026-10-14", tx);
    expect(serah).toBe("BAST-S/ACP-LPT-0001/20261014/3F2A9C");
    expect(new Set([serah, kembali, hilang]).size).toBe(3);
  });
  test("pembagian APD sejenis di hari sama untuk karyawan berbeda → nomor berbeda", () => {
    const a = bastNumber("PPE_ISSUE", "HLM", "2026-10-14", tx);
    const b = bastNumber("PPE_ISSUE", "HLM", "2026-10-14", "9b77c0aa-0000-4000-8000-000000000002");
    expect(a).not.toBe(b);
    expect(a.startsWith("BAST-APD/HLM/20261014/")).toBe(true);
  });
});

test("tanggal Indonesia & PDF valid dengan karakter di luar WinAnsi", async () => {
  expect(formatIndonesianDate("2026-10-14")).toBe("14 Oktober 2026");
  const bytes = await buildBastPdf({
    kind: "ASSET_HANDOVER",
    number: "BAST-S/X/20261014/ABCDEF",
    companyName: "PT Uji",
    date: "2026-10-14",
    lines: [{ name: "Laptop 💻 ŞĞ", detail: "SN 1", quantity: "1 unit", condition: "GOOD" }],
    manager: { name: "Pengelola", role: "GA" },
    employee: { name: "Nguyễn Văn A", number: "N-1", role: "Staf" },
    dueBackAt: null,
    note: null,
  });
  expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe("%PDF");
});
