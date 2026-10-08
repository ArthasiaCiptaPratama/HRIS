// D-060: lampiran Google Drive di Import — kolom unggahan Formulir Data Karyawan (foto, KTP, KK, ijazah,
// NPWP, sertifikat, buku rekening) berisi tautan Drive. Import mencatatnya sebagai antrean; server
// mengunduh lewat service account lalu menyimpannya sebagai foto profil / dokumen karyawan.

import { CERTIFICATIONS, type CertificationKey } from "./groups.ts";
import { formTitle, normalizeHeader } from "./normalize.ts";
import type { ImportFieldDef } from "./types.ts";

export const ATTACHMENT_GROUP = "Lampiran (Google Drive)";
/** Tujuan lampiran: foto profil atau kode jenis dokumen (Pengaturan › Jenis Dokumen). */
export const PHOTO_TARGET = "PHOTO";
/** Catatan dokumen hasil lampiran (selain sertifikat, yang memakai nama sertifikasi). */
export const ATTACHMENT_NOTE = "Diimpor dari Google Drive";
export const ATTACHMENT_MAX_FILES = 10;

const BASE_ATTACHMENTS = [
  {
    key: "Photo",
    label: "Foto profil",
    target: PHOTO_TARGET,
    headers: ["foto", "foto karyawan", "pas foto", "foto profil"],
  },
  { key: "Ktp", label: "KTP", target: "KTP", headers: ["ktp", "scan ktp", "file ktp", "foto ktp"] },
  {
    key: "Kk",
    label: "Kartu Keluarga",
    target: "KK",
    headers: ["kartu keluarga", "kk", "scan kk", "file kk"],
  },
  {
    key: "Diploma",
    label: "Ijazah terakhir",
    target: "DIPLOMA",
    headers: ["ijazah", "ijazah terakhir", "scan ijazah"],
  },
  { key: "Npwp", label: "NPWP", target: "NPWP", headers: ["npwp", "kartu npwp", "scan npwp"] },
  {
    key: "BankBook",
    label: "Buku rekening",
    target: "BANK_BOOK",
    headers: ["buku rekening", "buku tabungan"],
  },
  // D-061: file SIM per jenis (Form versi baru). Jenis dokumen SIM boleh banyak & tanpa masa berlaku.
  { key: "SimA", label: "SIM A", target: "SIM", headers: ["sim a", "file sim a", "foto sim a"] },
  { key: "SimC", label: "SIM C", target: "SIM", headers: ["sim c", "file sim c", "foto sim c"] },
] as const;

const CERT_TARGET: Partial<Record<CertificationKey, string>> = {
  Pop: "CERT_POP",
  Pom: "CERT_POM",
  Pou: "CERT_POU",
};

type BaseAttachmentKey = `attach${(typeof BASE_ATTACHMENTS)[number]["key"]}`;
type CertAttachmentKey = `attachCert${CertificationKey}`;
export type AttachmentFieldKey = BaseAttachmentKey | CertAttachmentKey;

export interface AttachmentSpec {
  target: string;
  note: string;
  /** Sertifikat: nomor dari `cert{Key}Number`, ditautkan ke Pelatihan bernama sama. */
  certKey?: CertificationKey;
}

const specs: Record<string, AttachmentSpec> = {};
const fields: Record<string, ImportFieldDef> = {};
const byHeader = new Map<string, AttachmentFieldKey>();
for (const a of BASE_ATTACHMENTS) {
  const key = `attach${a.key}` as AttachmentFieldKey;
  // SIM A & C berjenis sama (SIM): catatan membedakan berkasnya.
  specs[key] = {
    target: a.target,
    note: a.target === "SIM" ? `${a.label} — ${ATTACHMENT_NOTE}` : ATTACHMENT_NOTE,
  };
  fields[key] = {
    label: `File ${a.label}`,
    group: ATTACHMENT_GROUP,
    section: "attachment",
    synonyms: [],
  };
  for (const header of a.headers) byHeader.set(header, key);
}
for (const c of CERTIFICATIONS) {
  const key = `attachCert${c.key}` as AttachmentFieldKey;
  specs[key] = { target: CERT_TARGET[c.key] ?? "CERT_OTHER", note: c.name, certKey: c.key };
  fields[key] = {
    label: `File ${c.name}`,
    group: ATTACHMENT_GROUP,
    section: "attachment",
    synonyms: [],
  };
  // Judul Form bisa dengan/tanpa awalan "Sertifikasi" ("Sertifikasi SMKP Minerba" ↔ "SMKP Minerba").
  const text = normalizeHeader(c.name).replace(/^sertifikasi /, "");
  byHeader.set(text, key);
  byHeader.set(`sertifikasi ${text}`, key);
}

export const ATTACHMENT_SPECS = specs as Record<AttachmentFieldKey, AttachmentSpec>;
export const ATTACHMENT_IMPORT_FIELDS = fields as Record<AttachmentFieldKey, ImportFieldDef>;
export const ATTACHMENT_FIELD_KEYS = Object.keys(specs) as AttachmentFieldKey[];

/** Kolom berisi tautan dengan judul unggahan Form → field lampiran (null = bukan). */
export function attachmentFieldOfHeader(header: unknown): AttachmentFieldKey | null {
  return (
    byHeader.get(normalizeHeader(header)) ??
    byHeader.get(normalizeHeader(formTitle(header))) ??
    null
  );
}

const DRIVE_ID = /^[\w-]{20,}$/;

/** ID file Google Drive dari isi sel (satu atau beberapa tautan dipisah koma/spasi/baris). */
export function driveFileIds(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const ids: string[] = [];
  for (const part of value.split(/[\s,;]+/)) {
    let url: URL;
    try {
      url = new URL(part);
    } catch {
      continue;
    }
    if (url.hostname !== "drive.google.com" && url.hostname !== "docs.google.com") continue;
    const id = url.searchParams.get("id") ?? url.pathname.match(/\/d\/([\w-]+)/)?.[1] ?? null;
    if (id && DRIVE_ID.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}
