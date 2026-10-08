import { describe, expect, test } from "bun:test";
import {
  ATTACHMENT_NOTE,
  applySavedMapping,
  attachmentFieldOfHeader,
  driveFileIds,
  fieldPermission,
  normalizeImportRow,
} from "../src/import/index.ts";

// D-060: lampiran Google Drive di Import. ID Drive palsu, data dummy.

const ID_A = "1AbCdEfGhIjKlMnOpQrStUvWx";
const ID_B = "1ZyXwVuTsRqPoNmLkJiHgFeDc";
const link = (id: string) => `https://drive.google.com/open?id=${id}`;

describe("driveFileIds", () => {
  test("open?id=, /file/d/…, beberapa tautan (tanpa duplikat), bukan Drive", () => {
    expect(driveFileIds(link(ID_A))).toEqual([ID_A]);
    expect(driveFileIds(`https://drive.google.com/file/d/${ID_B}/view?usp=drivesdk`)).toEqual([
      ID_B,
    ]);
    expect(driveFileIds(`${link(ID_A)}, ${link(ID_B)}\n${link(ID_A)}`)).toEqual([ID_A, ID_B]);
    expect(driveFileIds(`https://drive.google.com.evil.test/open?id=${ID_A}`)).toEqual([]);
    expect(driveFileIds("1234567890123456")).toEqual([]);
    expect(driveFileIds(42)).toEqual([]);
  });
});

describe("attachmentFieldOfHeader", () => {
  test("judul unggahan Form → field lampiran", () => {
    expect(attachmentFieldOfHeader("Foto Karyawan")).toBe("attachPhoto");
    expect(attachmentFieldOfHeader("Kartu Keluarga")).toBe("attachKk");
    expect(attachmentFieldOfHeader("Ijazah Terakhir")).toBe("attachDiploma");
    expect(attachmentFieldOfHeader("Buku Rekening (Hal 1)")).toBe("attachBankBook");
    expect(attachmentFieldOfHeader("Sertifikasi Pengawas Operasional Madya (POM)")).toBe(
      "attachCertPom",
    );
    expect(attachmentFieldOfHeader("ISO 9001")).toBe("attachCertIso9001");
    expect(attachmentFieldOfHeader("Nama Lengkap")).toBeNull();
  });

  test("lampiran tidak butuh grant saat import (hak akses dicek per jenis dokumen saat diproses)", () => {
    expect(fieldPermission("attachKtp")).toBeNull();
  });
});

describe("normalizeImportRow: lampiran", () => {
  test("tujuan, catatan, nomor sertifikat; sertifikasi yang hanya ada filenya tetap ke Pelatihan", () => {
    const { row, issues } = normalizeImportRow({
      employeeNumber: "QA-ATT-01",
      attachPhoto: link(ID_A),
      attachKtp: `${link(ID_A)}, ${link(ID_B)}`,
      attachCertPop: link(ID_B),
      certPopNumber: "POP-001",
      attachCertIso45001: link(ID_A),
    });
    expect(issues).toEqual([]);
    expect(row.attachments).toEqual([
      { source: "attachPhoto", target: "PHOTO", note: ATTACHMENT_NOTE, fileIds: [ID_A] },
      { source: "attachKtp", target: "KTP", note: ATTACHMENT_NOTE, fileIds: [ID_A, ID_B] },
      {
        source: "attachCertPop",
        target: "CERT_POP",
        note: "Sertifikasi Pengawas Operasional Pertama (POP)",
        fileIds: [ID_B],
        documentNumber: "POP-001",
        certKey: "Pop",
      },
      {
        source: "attachCertIso45001",
        target: "CERT_OTHER",
        note: "ISO 45001",
        fileIds: [ID_A],
        certKey: "Iso45001",
      },
    ]);
    expect(row.certifications?.map((c) => c.name)).toEqual([
      "Sertifikasi Pengawas Operasional Pertama (POP)",
      "ISO 45001",
    ]);
  });

  test("bukan tautan Drive / lebih dari 10 file = peringatan, lampiran dilewati", () => {
    const many = Array.from({ length: 11 }, (_, i) => link(`${ID_A.slice(0, -2)}${10 + i}`)).join(
      ", ",
    );
    const { row, issues } = normalizeImportRow({
      employeeNumber: "QA-ATT-02",
      attachKk: "ada di map biru",
      attachDiploma: many,
    });
    expect(row.attachments).toBeUndefined();
    expect(issues).toEqual([
      { field: "attachKk", code: "INVALID_DRIVE_LINK", severity: "WARNING" },
      { field: "attachDiploma", code: "TOO_MANY_FILES", severity: "WARNING" },
    ]);
  });
});

describe("applySavedMapping", () => {
  const headers = ["NIP", "KTP", "Usia", "Usia"];
  const suggested = ["employeeNumber", "attachKtp", "fatherAge", "motherAge"] as const;

  test("profil lama (tanpa field lampiran) tidak mematikan kolom lampiran; kolom kembar per kemunculan", () => {
    expect(
      applySavedMapping(headers, { nip: "employeeNumber", ktp: null, usia: null }, [...suggested]),
    ).toEqual(["employeeNumber", "attachKtp", null, "motherAge"]);
  });

  test("profil yang sudah mengenal lampiran dihormati (kolom sengaja diabaikan)", () => {
    expect(
      applySavedMapping(
        ["NIP", "KTP", "Foto"],
        { nip: "employeeNumber", ktp: null, foto: "attachPhoto" },
        ["employeeNumber", "attachKtp", "attachPhoto"],
      ),
    ).toEqual(["employeeNumber", null, "attachPhoto"]);
  });
});
