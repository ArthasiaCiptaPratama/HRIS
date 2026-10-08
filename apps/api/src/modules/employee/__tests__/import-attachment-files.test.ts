import { describe, expect, test } from "bun:test";
import { Jimp } from "jimp";
import { PDFDocument } from "pdf-lib";
import { prepareDocument, preparePhoto, sniffMime } from "../import-attachment-files.ts";

// D-060: file dari Drive → sesuai aturan unggah (foto JPEG ≤ 1024 px, dokumen ≤ batas jenis, gabung PDF).
const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];
const MB = 1024 * 1024;
const image = async (width: number, height: number, mime: "image/jpeg" | "image/png") =>
  new Uint8Array(await new Jimp({ width, height, color: 0x3366ccff }).getBuffer(mime));
const pdf = async () => {
  const doc = await PDFDocument.create();
  doc.addPage([100, 100]);
  return doc.save();
};
const heic = new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode("ftypheic"), 0, 0, 0, 0]);

describe("sniffMime", () => {
  test("dari byte awal", async () => {
    expect(sniffMime(await pdf())).toBe("application/pdf");
    expect(sniffMime(await image(4, 4, "image/jpeg"))).toBe("image/jpeg");
    expect(sniffMime(await image(4, 4, "image/png"))).toBe("image/png");
    expect(sniffMime(heic)).toBe("image/heic");
    expect(sniffMime(new TextEncoder().encode("halo"))).toBe("application/octet-stream");
  });
});

describe("preparePhoto", () => {
  test("gambar besar → JPEG sisi terpanjang 1024 px", async () => {
    const result = await preparePhoto(await image(2000, 1500, "image/png"), 2 * MB);
    if ("skip" in result) throw new Error(result.skip);
    expect(result.contentType).toBe("image/jpeg");
    const out = await Jimp.read(Buffer.from(result.bytes));
    expect([out.width, out.height]).toEqual([1024, 768]);
  });

  test("HEIC / bukan gambar dilewati dengan alasan", async () => {
    expect(await preparePhoto(heic, 2 * MB)).toMatchObject({
      skip: expect.stringContaining("HEIC"),
    });
    expect(await preparePhoto(await pdf(), 2 * MB)).toEqual({
      skip: "foto profil harus berupa gambar",
    });
  });
});

describe("prepareDocument", () => {
  test("PDF & PNG kecil apa adanya; dua gambar → satu PDF dua halaman", async () => {
    const onePdf = await pdf();
    expect(await prepareDocument([onePdf], ALLOWED, 5 * MB)).toEqual({
      bytes: onePdf,
      contentType: "application/pdf",
    });
    const png = await image(40, 30, "image/png");
    expect(await prepareDocument([png], ALLOWED, 5 * MB)).toEqual({
      bytes: png,
      contentType: "image/png",
    });
    const merged = await prepareDocument([await image(40, 30, "image/jpeg"), png], ALLOWED, 5 * MB);
    if ("skip" in merged) throw new Error(merged.skip);
    expect(merged.contentType).toBe("application/pdf");
    expect((await PDFDocument.load(merged.bytes)).getPageCount()).toBe(2);
  });

  test("gambar melebihi batas dikompres; jenis tidak diterima / PDF campuran / terlalu besar dilewati", async () => {
    // Foto berisi noise (PNG besar), bukan warna polos yang termampatkan habis.
    const noisy = new Jimp({ width: 1200, height: 900 });
    let seed = 42; // LCG: acak tapi tetap sama tiap run
    for (let i = 0; i < noisy.bitmap.data.length; i++) {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      noisy.bitmap.data[i] = i % 4 === 3 ? 255 : (seed >> 16) & 255;
    }
    const big = new Uint8Array(await noisy.getBuffer("image/png"));
    const shrunk = await prepareDocument([big], ALLOWED, Math.floor(big.byteLength / 2));
    expect("contentType" in shrunk && shrunk.contentType).toBe("image/jpeg");
    expect(
      await prepareDocument([await image(4, 4, "image/png")], ["application/pdf"], MB),
    ).toEqual({ skip: "jenis dokumen ini tidak menerima image/jpeg" });
    expect(await prepareDocument([await pdf(), await pdf()], ALLOWED, MB)).toMatchObject({
      skip: expect.stringContaining("gabungkan manual"),
    });
    expect(await prepareDocument([await pdf()], ALLOWED, 10)).toMatchObject({
      skip: expect.stringContaining("melebihi"),
    });
  });
});
