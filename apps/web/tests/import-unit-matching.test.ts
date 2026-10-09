import { describe, expect, it } from "vitest";
import type { UnitPreview } from "@/features/employee/import/api";
import { suggestedChoices } from "@/features/employee/import/unit-matching";

// D-064: tombol "Terapkan saran" — hanya saran pertama, tidak menimpa pilihan HR, tidak saling menunjuk.

const unit = (key: string, patch: Partial<UnitPreview> = {}): UnitPreview => ({
  key,
  name: key,
  companyId: null,
  companyCode: null,
  newName: null,
  columns: ["departmentName"],
  rows: 1,
  status: "NEEDS_REVIEW",
  unitId: null,
  sameAs: null,
  create: null,
  suggestions: [],
  ...patch,
});

describe("suggestedChoices", () => {
  it("saran unit yang ada → unitId; saran nilai file → sameAs; pilihan HR dipertahankan", () => {
    const units = [
      unit("enginering", {
        suggestions: [{ unitId: "u-eng", key: null, name: "Engineering", reason: "SPELLING" }],
      }),
      unit("explorasi", {
        suggestions: [{ unitId: null, key: "eksplorasi", name: "Eksplorasi", reason: "SPELLING" }],
      }),
      unit("hrga", {
        suggestions: [{ unitId: "u-hr", key: null, name: "HR & GA Site", reason: "CONTAINS" }],
      }),
      unit("operations", { status: "NEW" }),
    ];
    expect(suggestedChoices(units, { hrga: { unitId: "pilihan-hr" } })).toEqual({
      enginering: { unitId: "u-eng" },
      explorasi: { sameAs: "eksplorasi" },
      hrga: { unitId: "pilihan-hr" },
    });
  });

  it("dua nilai file yang saling menyarankan (seri) → hanya satu arah", () => {
    const units = [
      unit("engineering", {
        suggestions: [{ unitId: null, key: "enginering", name: "Enginering", reason: "SPELLING" }],
      }),
      unit("enginering", {
        suggestions: [
          { unitId: null, key: "engineering", name: "Engineering", reason: "SPELLING" },
        ],
      }),
    ];
    expect(suggestedChoices(units, {})).toEqual({ engineering: { sameAs: "enginering" } });
  });
});
