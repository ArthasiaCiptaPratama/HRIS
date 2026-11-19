import { describe, expect, it } from "bun:test";
import { findSimilarMaster, wordPrefixSimilar } from "../src/import/units.ts";

// IMP-D5: penanda "Mirip" untuk jabatan/lokasi/homebase baru di langkah Lengkapi data.
describe("wordPrefixSimilar", () => {
  it("kata yang disingkat (≥ 3 huruf, awalan atau huruf berurutan) di posisi sama → mirip", () => {
    expect(wordPrefixSimilar("Ass Master Bor", "Assistant Master Bor")).toBe(true);
    expect(wordPrefixSimilar("Assistant Master Bor", "Ass. Master Bor")).toBe(true);
    expect(wordPrefixSimilar("Asst Bor II", "Assistant Bor II")).toBe(true);
    expect(wordPrefixSimilar("Spv HSE", "Supervisor HSE")).toBe(true);
  });
  it("nama sama persis, jumlah kata beda, atau singkatan < 3 huruf → tidak", () => {
    expect(wordPrefixSimilar("Master Bor", "Master Bor")).toBe(false);
    expect(wordPrefixSimilar("Master Bor", "Assistant Master Bor")).toBe(false);
    expect(wordPrefixSimilar("As Master Bor", "Assistant Master Bor")).toBe(false);
    expect(wordPrefixSimilar("Mgr HSE", "Supervisor HSE")).toBe(false);
  });
});

describe("findSimilarMaster", () => {
  const masters = [
    { id: "1", name: "Assistant Master Bor" },
    { id: "2", name: "Engineering" },
    { id: "3", name: "Driver" },
  ];
  it("menemukan singkatan kata, salah ketik, dan beda huruf besar/tanda baca", () => {
    expect(findSimilarMaster("Ass Master Bor", masters)?.id).toBe("1");
    expect(findSimilarMaster("Enginering", masters)?.id).toBe("2");
    expect(findSimilarMaster("DRIVER.", masters)?.id).toBe("3");
  });
  it("tidak mirip → null", () => {
    expect(findSimilarMaster("Humas", masters)).toBeNull();
    expect(findSimilarMaster("", masters)).toBeNull();
  });
});
