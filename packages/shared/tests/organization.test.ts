import { describe, expect, test } from "bun:test";
import {
  canBeChildOf,
  companyInputSchema,
  geofenceIncomplete,
  gradeInputSchema,
  ORG_UNIT_TYPES,
  POSITION_LEVELS,
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

// D-050: jenis unit organisasi & induk yang sah.
describe("canBeChildOf", () => {
  test.each([
    ["DIRECTORATE", "DIRECTORATE", true],
    ["DIVISION", "DIRECTORATE", true],
    ["DEPARTMENT", "DIRECTORATE", true],
    ["DEPARTMENT", "DIVISION", true],
    ["SECTION", "DEPARTMENT", true],
    ["SECTION", "DIVISION", true],
    ["DIRECTORATE", "DIVISION", false],
    ["DIVISION", "DIVISION", false],
    ["DIVISION", "DEPARTMENT", false],
    ["DEPARTMENT", "DEPARTMENT", false],
    ["DEPARTMENT", "SECTION", false],
    ["SECTION", "SECTION", false],
    ["SECTION", "DIRECTORATE", false],
  ] as const)("%s di bawah %s = %s", (child, parent, ok) => {
    expect(canBeChildOf(child, parent)).toBe(ok);
  });

  test("semua jenis boleh tanpa induk (puncak)", () => {
    for (const type of ORG_UNIT_TYPES) expect(canBeChildOf(type, null)).toBe(true);
  });

  test("level jabatan berurutan dari Direksi ke Helper", () => {
    expect(POSITION_LEVELS[0]).toBe("DIRECTOR");
    expect(POSITION_LEVELS.at(-1)).toBe("NON_STAFF");
  });
});
