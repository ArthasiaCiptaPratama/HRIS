import { describe, expect, test } from "bun:test";
import {
  addMonths,
  daysUntil,
  documentTypeInputSchema,
  employeeDocumentInputSchema,
  expiryState,
  reminderThreshold,
} from "../src/documents.ts";

// D-055 (Arsip gelombang 1b): jenis dokumen (master data SA), metadata dokumen, masa berlaku.
const TODAY = "2026-10-05";

const baseType = {
  code: "SIMPER",
  name: "SIMPER",
  category: "COMPETENCY",
  hasExpiry: true,
  defaultValidityMonths: 12,
  reminderDays: [7, 60, 30],
  requiredScope: "NONE",
  requiredPositionIds: [],
  multiple: false,
  employeeCanUpload: false,
  sensitive: false,
  maxSizeMb: 5,
  allowedMimeTypes: ["application/pdf"],
};

describe("documentTypeInputSchema", () => {
  test("kode huruf besar; pengingat diurutkan menurun & unik", () => {
    const parsed = documentTypeInputSchema.parse({ ...baseType, code: " simper " });
    expect(parsed.code).toBe("SIMPER");
    expect(parsed.reminderDays).toEqual([60, 30, 7]);
    expect(documentTypeInputSchema.safeParse({ ...baseType, reminderDays: [30, 30] }).success).toBe(
      false,
    );
    expect(documentTypeInputSchema.safeParse({ ...baseType, code: "SIM PER" }).success).toBe(false);
  });

  test("tanpa masa berlaku → masa bawaan & pengingat dikosongkan", () => {
    const parsed = documentTypeInputSchema.parse({ ...baseType, hasExpiry: false });
    expect(parsed.defaultValidityMonths).toBeNull();
    expect(parsed.reminderDays).toEqual([]);
  });

  test("wajib per jabatan butuh minimal satu jabatan; lingkup lain mengosongkan daftar", () => {
    expect(
      documentTypeInputSchema.safeParse({ ...baseType, requiredScope: "POSITIONS" }).success,
    ).toBe(false);
    const id = "8f9c1c55-7f0d-4b8e-9d1a-1b2c3d4e5f60";
    expect(
      documentTypeInputSchema.parse({
        ...baseType,
        requiredScope: "ALL",
        requiredPositionIds: [id],
      }).requiredPositionIds,
    ).toEqual([]);
  });

  test("ukuran 1–5 MB, minimal satu format file", () => {
    expect(documentTypeInputSchema.safeParse({ ...baseType, maxSizeMb: 6 }).success).toBe(false);
    expect(documentTypeInputSchema.safeParse({ ...baseType, allowedMimeTypes: [] }).success).toBe(
      false,
    );
  });
});

describe("employeeDocumentInputSchema", () => {
  const typeId = "8f9c1c55-7f0d-4b8e-9d1a-1b2c3d4e5f60";
  test("tanggal terbit tidak di masa depan; kedaluwarsa tidak sebelum terbit", () => {
    const schema = employeeDocumentInputSchema(TODAY);
    expect(
      schema.parse({ documentTypeId: typeId, documentNumber: " 123 ", issuedAt: "2026-01-01" }),
    ).toEqual({
      documentTypeId: typeId,
      documentNumber: "123",
      issuedAt: "2026-01-01",
      expiresAt: null,
      note: null,
    });
    expect(schema.safeParse({ documentTypeId: typeId, issuedAt: "2026-10-06" }).success).toBe(
      false,
    );
    expect(
      schema.safeParse({
        documentTypeId: typeId,
        issuedAt: "2026-01-01",
        expiresAt: "2025-12-31",
      }).success,
    ).toBe(false);
  });
});

describe("masa berlaku", () => {
  test("addMonths menjaga akhir bulan", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-10-05", 12)).toBe("2027-10-05");
  });

  test("daysUntil & expiryState", () => {
    expect(daysUntil("2026-10-12", TODAY)).toBe(7);
    expect(expiryState(null, TODAY, 60)).toBe("NONE");
    expect(expiryState("2026-10-04", TODAY, 60)).toBe("EXPIRED");
    expect(expiryState(TODAY, TODAY, 60)).toBe("EXPIRING");
    expect(expiryState("2026-12-04", TODAY, 60)).toBe("EXPIRING");
    expect(expiryState("2026-12-05", TODAY, 60)).toBe("VALID");
  });

  test("reminderThreshold: ambang terkecil yang sudah dilewati; 0 = kedaluwarsa ≤ 30 hari", () => {
    const days = [60, 30, 7];
    expect(reminderThreshold("2026-12-05", TODAY, days)).toBeNull(); // 61 hari
    expect(reminderThreshold("2026-12-04", TODAY, days)).toBe(60);
    expect(reminderThreshold("2026-11-04", TODAY, days)).toBe(30);
    expect(reminderThreshold("2026-10-06", TODAY, days)).toBe(7);
    expect(reminderThreshold("2026-10-04", TODAY, days)).toBe(0);
    expect(reminderThreshold("2026-09-01", TODAY, days)).toBeNull(); // kedaluwarsa > 30 hari
    expect(reminderThreshold("2026-10-06", TODAY, [])).toBeNull();
  });
});
