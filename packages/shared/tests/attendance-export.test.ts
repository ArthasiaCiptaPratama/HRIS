import { describe, expect, test } from "bun:test";
import { strFromU8, unzipSync } from "fflate";
import {
  ATTENDANCE_EXPORT_MAX_DAYS,
  attendanceExportDays,
  attendanceExportFileName,
  attendanceExportInputSchema,
  buildWorkbook,
  formatClockTime,
  googleMapsUrl,
} from "../src/index.ts";

// TM-D31 — ekspor Excel data absen: skema input bersama, format jam "(+1)", sel tautan xlsx.
const ID = "11111111-1111-4111-8111-111111111111";
const ok = (body: unknown) => attendanceExportInputSchema.safeParse(body).success;

describe("attendanceExportInputSchema", () => {
  test("DETAIL & FLASH sah; kind tak dikenal / field asing ditolak", () => {
    expect(ok({ kind: "DETAIL", from: "2026-11-01", to: "2026-11-30" })).toBe(true);
    expect(
      ok({
        kind: "DETAIL",
        from: "2026-11-01",
        to: "2026-11-30",
        companyId: ID,
        crewIds: [ID],
        includeNoCrew: true,
      }),
    ).toBe(true);
    expect(ok({ kind: "FLASH", from: "2026-11-01", to: "2026-11-01", companyId: ID })).toBe(true);
    expect(ok({ kind: "FLASH", from: "2026-11-01", to: "2026-11-02", crewIds: [ID] })).toBe(false);
    expect(ok({ kind: "PDF", from: "2026-11-01", to: "2026-11-02" })).toBe(false);
    expect(ok({ kind: "DETAIL", from: "2026-11-01", to: "2026-11-02", crewIds: [] })).toBe(false);
    expect(ok({ kind: "DETAIL", from: "2026-11-01", to: "2026-11-02", crewIds: ["x"] })).toBe(
      false,
    );
    expect(ok({ kind: "DETAIL", from: "01/11/2026", to: "2026-11-02" })).toBe(false);
  });

  test("from ≤ to dan rentang maks. 92 hari inklusif", () => {
    expect(ok({ kind: "FLASH", from: "2026-11-02", to: "2026-11-01" })).toBe(false);
    expect(attendanceExportDays("2026-01-01", "2026-04-02")).toBe(ATTENDANCE_EXPORT_MAX_DAYS);
    expect(ok({ kind: "FLASH", from: "2026-01-01", to: "2026-04-02" })).toBe(true);
    expect(ok({ kind: "FLASH", from: "2026-01-01", to: "2026-04-03" })).toBe(false);
  });

  test("nama file", () => {
    expect(attendanceExportFileName({ kind: "DETAIL", from: "2026-11-01", to: "2026-11-30" })).toBe(
      "absensi-2026-11-01_2026-11-30.xlsx",
    );
    expect(attendanceExportFileName({ kind: "FLASH", from: "2026-11-01", to: "2026-11-30" })).toBe(
      "absensi-flash-2026-11-01_2026-11-30.xlsx",
    );
  });
});

describe("formatClockTime", () => {
  const WIB = 7 * 60;
  const WITA = 8 * 60;
  test("jam lokal pada tanggal kerja tanpa akhiran", () => {
    expect(formatClockTime(new Date("2026-11-10T00:58:00Z"), "2026-11-10", WIB)).toBe("07:58");
    expect(formatClockTime(new Date("2026-11-10T00:58:00Z"), "2026-11-10", WITA)).toBe("08:58");
  });
  test("melewati tengah malam → (+1); tanggal sebelumnya → (-1)", () => {
    // Clock Out shift malam: 06:05 WIB tanggal 11 untuk tanggal kerja 10.
    expect(formatClockTime(new Date("2026-11-10T23:05:00Z"), "2026-11-10", WIB)).toBe("06:05 (+1)");
    // 23:30 UTC tanggal 9 = 06:30 WIB tanggal 10 → tanpa akhiran.
    expect(formatClockTime(new Date("2026-11-09T23:30:00Z"), "2026-11-10", WIB)).toBe("06:30");
    expect(formatClockTime(new Date("2026-11-09T15:00:00Z"), "2026-11-10", WIB)).toBe("22:00 (-1)");
    expect(formatClockTime(new Date("2026-11-11T17:00:00Z"), "2026-11-10", WIB)).toBe("00:00 (+2)");
  });
});

describe("buildWorkbook — sel tautan (TM-D31)", () => {
  const files = (bytes: Uint8Array) => {
    const all = unzipSync(bytes);
    return (path: string) => strFromU8(all[path] ?? new Uint8Array());
  };
  const url = googleMapsUrl(-2.5, 115.25);

  test("sheet laporan: rumus HYPERLINK berteks + gaya tautan ditambahkan di akhir", () => {
    const xml = files(
      buildWorkbook([
        {
          name: "Data",
          title: "Data",
          rows: [
            ["Peta"],
            [{ value: "Buka di Google Maps", link: url }],
            [{ value: "Lagi", link: url }],
          ],
        },
      ]),
    );
    const sheet = xml("xl/worksheets/sheet1.xml");
    expect(url).toBe("https://www.google.com/maps?q=-2.5,115.25");
    expect(sheet).toContain(
      `<f>HYPERLINK(&quot;${url}&quot;,&quot;Buka di Google Maps&quot;)</f><v>Buka di Google Maps</v>`,
    );
    // Baris pertama polos (indeks 21), baris kedua belang (22) — indeks gaya lama tetap.
    expect(sheet).toMatch(/t="str" s="21"><f>HYPERLINK/);
    expect(sheet).toMatch(/t="str" s="22"><f>HYPERLINK/);
    const styles = xml("xl/styles.xml");
    expect(styles).toContain('<fonts count="6">');
    expect(styles).toContain('<cellXfs count="23">');
    expect(styles).toContain("<u/>");
  });

  test("tanpa tautan: styles & sel tidak berubah (pemakai lama aman)", () => {
    const xml = files(buildWorkbook([{ name: "Data", title: "Data", rows: [["A"], ["teks"]] }]));
    const styles = xml("xl/styles.xml");
    expect(styles).toContain('<fonts count="5">');
    expect(styles).toContain('<cellXfs count="21">');
    expect(styles).not.toContain("<u/>");
    expect(xml("xl/worksheets/sheet1.xml")).not.toContain("<f>");
  });

  test("sheet mode lama mengabaikan tautan (teks saja)", () => {
    const xml = files(
      buildWorkbook([{ name: "Data", rows: [["A"], [{ value: "x", link: url }]] }]),
    );
    expect(xml("xl/worksheets/sheet1.xml")).not.toContain("HYPERLINK");
    expect(xml("xl/styles.xml")).not.toContain("<u/>");
  });

  test("tautan + gaya template: indeks gaya tautan sesudah gaya template", () => {
    const xml = files(
      buildWorkbook([
        { name: "T", rows: [["a"], ["b"]], headerFills: ["required"] },
        { name: "L", title: "L", rows: [["Peta"], [{ value: "Buka", link: url }]] },
      ]),
    );
    expect(xml("xl/styles.xml")).toContain('<cellXfs count="27">');
    expect(xml("xl/worksheets/sheet2.xml")).toMatch(/t="str" s="25"><f>HYPERLINK/);
  });
});
