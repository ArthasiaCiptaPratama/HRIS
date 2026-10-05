import { describe, expect, test } from "bun:test";
import {
  ARCHIVE_SECTIONS,
  educationInputSchema,
  positionHistoryInputSchema,
  positionHistoryMetaSchema,
  trainingInputSchema,
  workExperienceInputSchema,
} from "../src/archive.ts";

// D-054 (Arsip gelombang 1a): input kelola per karyawan, dipakai API & form web.
const TODAY = "2026-10-05";

describe("ARCHIVE_SECTIONS", () => {
  test("menu gelombang 1a + Data File (1b) + Keluarga & Bank (1c) dengan slug web & kategori API", () => {
    expect(ARCHIVE_SECTIONS.map((s) => [s.slug, s.category])).toEqual([
      ["kontak", "contacts"],
      ["keluarga", "families"],
      ["pendidikan", "educations"],
      ["riwayat-jabatan", "position-histories"],
      ["pelatihan", "trainings"],
      ["riwayat-kerja", "work-experiences"],
      ["file", "documents"],
      ["bank", "bank-accounts"],
    ]);
  });
});

describe("educationInputSchema", () => {
  test("jenjang wajib, teks dipangkas, tahun lulus opsional", () => {
    expect(
      educationInputSchema.parse({ level: "S1", schoolName: "  Univ Uji ", major: "" }),
    ).toEqual({ level: "S1", schoolName: "Univ Uji", major: null, graduationYear: null });
    expect(educationInputSchema.safeParse({ schoolName: "X" }).success).toBe(false);
    expect(
      educationInputSchema.safeParse({ level: "S1", schoolName: "X", graduationYear: 1900 })
        .success,
    ).toBe(false);
  });
});

describe("trainingInputSchema", () => {
  test("tanggal selesai tidak sebelum mulai; tahun diisi dari tanggal mulai", () => {
    const ok = trainingInputSchema.parse({
      trainingField: "K3 Umum",
      type: "EXTERNAL",
      startDate: "2025-03-01",
      endDate: "2025-03-05",
      hours: 40,
      cost: 1500000.5,
    });
    expect(ok).toMatchObject({ trainingYear: 2025, hours: 40, cost: 1500000.5 });
    expect(
      trainingInputSchema.safeParse({
        trainingField: "K3",
        startDate: "2025-03-05",
        endDate: "2025-03-01",
      }).success,
    ).toBe(false);
  });

  test("jam 1–2000, biaya ≥ 0 maks 2 desimal", () => {
    for (const bad of [{ hours: 0 }, { hours: 2001 }, { cost: -1 }, { cost: 10.555 }]) {
      expect(trainingInputSchema.safeParse({ trainingField: "K3", ...bad }).success).toBe(false);
    }
  });
});

describe("workExperienceInputSchema", () => {
  test("tahun selesai ≥ tahun mulai; masih bekerja = tanpa tahun selesai", () => {
    expect(
      workExperienceInputSchema.safeParse({
        companyName: "PT Lama",
        position: "Staf",
        startYear: 2020,
        endYear: 2019,
      }).success,
    ).toBe(false);
    expect(
      workExperienceInputSchema.parse({
        companyName: "PT Lama",
        position: "Staf",
        startYear: 2020,
      }),
    ).toMatchObject({ endYear: null, description: null });
  });
});

describe("positionHistoryInputSchema (riwayat lama sebelum HRIS)", () => {
  test("jabatan dari master ATAU teks bebas wajib salah satu; tanggal tidak di masa depan", () => {
    const base = { effectiveDate: "2019-01-10", movementType: "PROMOTION" as const };
    expect(positionHistoryInputSchema(TODAY).safeParse(base).success).toBe(false);
    expect(
      positionHistoryInputSchema(TODAY).parse({ ...base, toPositionName: " Foreman Lama " }),
    ).toMatchObject({ toPositionName: "Foreman Lama", toPositionId: null, decreeNumber: null });
    expect(
      positionHistoryInputSchema(TODAY).safeParse({
        ...base,
        toPositionName: "X",
        effectiveDate: "2026-10-06",
      }).success,
    ).toBe(false);
  });

  test("metadata riwayat otomatis: hanya jenis perpindahan, no. SK, catatan", () => {
    expect(positionHistoryMetaSchema.parse({ decreeNumber: " SK/01/2025 " })).toEqual({
      decreeNumber: "SK/01/2025",
    });
    expect(positionHistoryMetaSchema.safeParse({ toPositionName: "X" }).success).toBe(false);
  });
});
