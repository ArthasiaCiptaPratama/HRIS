import { describe, expect, test } from "bun:test";
import {
  companyInputSchema,
  geofenceIncomplete,
  gradeInputSchema,
  workLocationInputSchema,
} from "../src/organization.ts";

// D-049: aturan input master data yang dipakai bersama API & form web.
describe("companyInputSchema", () => {
  test("kode dijadikan huruf besar; NPWP berpemisah dibersihkan; kosong → null", () => {
    expect(
      companyInputSchema.parse({
        code: "acp",
        name: " PT  Uji ",
        npwpNumber: "01.234.567.8-901.000",
        address: "",
      }),
    ).toEqual({ code: "ACP", name: "PT Uji", npwpNumber: "012345678901000", address: null });
  });

  test.each(["A", "A.B", "AB CD", "ABCDEFGHIJK"])("kode %p ditolak", (code) => {
    expect(companyInputSchema.safeParse({ code, name: "PT" }).success).toBe(false);
  });

  test("NPWP selain 15/16 digit ditolak", () => {
    expect(
      companyInputSchema.safeParse({ code: "ACP", name: "PT", npwpNumber: "123" }).success,
    ).toBe(false);
  });
});

describe("workLocationInputSchema", () => {
  test("geofence lengkap diterima; maks 6 desimal", () => {
    expect(
      workLocationInputSchema.safeParse({
        name: "Site",
        latitude: -2.123456,
        longitude: 113.9,
        radiusM: 150,
      }).success,
    ).toBe(true);
    expect(
      workLocationInputSchema.safeParse({
        name: "Site",
        latitude: -2.1234567,
        longitude: 113.9,
        radiusM: 150,
      }).success,
    ).toBe(false);
  });

  test("sebagian geofence ditolak; tanpa geofence diterima", () => {
    expect(workLocationInputSchema.safeParse({ name: "Site", latitude: -2.1 }).success).toBe(false);
    expect(workLocationInputSchema.safeParse({ name: "Site" }).success).toBe(true);
    expect(geofenceIncomplete({ latitude: 1, longitude: 2, radiusM: null })).toBe(true);
    expect(geofenceIncomplete({})).toBe(false);
  });

  test("radius di luar 10–10.000 m atau pecahan ditolak", () => {
    for (const radiusM of [5, 20_000, 12.5]) {
      expect(
        workLocationInputSchema.safeParse({ name: "S", latitude: 1, longitude: 1, radiusM })
          .success,
      ).toBe(false);
    }
  });
});

test("nama dipangkas & spasi ganda dirapikan; kosong ditolak", () => {
  expect(gradeInputSchema.parse({ name: "  3   A " })).toEqual({ name: "3 A" });
  expect(gradeInputSchema.safeParse({ name: "   " }).success).toBe(false);
});
