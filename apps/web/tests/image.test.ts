import { describe, expect, it } from "vitest";
import { centerCrop, fitWithin, ImageProcessingError } from "@/lib/image";

// D-037: potong & kecilkan pas foto profil (dipindah dari test Print data .xlsx, 2026-10-19).
describe("centerCrop & fitWithin (foto 3:4)", () => {
  it("potong tengah lanskap & potret ke 3:4", () => {
    expect(centerCrop(1600, 900, 3 / 4)).toEqual({ sx: 463, sy: 0, sw: 675, sh: 900 });
    expect(centerCrop(600, 1200, 3 / 4)).toEqual({ sx: 0, sy: 200, sw: 600, sh: 800 });
    expect(centerCrop(300, 400, 3 / 4)).toEqual({ sx: 0, sy: 0, sw: 300, sh: 400 });
    expect(() => centerCrop(0, 10, 1)).toThrow(ImageProcessingError);
  });

  it("diperkecil agar muat, tidak pernah diperbesar", () => {
    expect(fitWithin(1350, 1800, { width: 600, height: 800 })).toEqual({ width: 600, height: 800 });
    expect(fitWithin(300, 400, { width: 600, height: 800 })).toEqual({ width: 300, height: 400 });
  });
});
