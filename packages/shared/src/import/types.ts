// D-042: tipe kamus field import (dipisah supaya `fields.ts` & `groups.ts` tidak saling mengimpor).

/** Bagian tujuan data. `personal`/`bank` = sensitif (PLAN §4.2, grant `*.write`). */
export type ImportSection =
  | "identity"
  | "work"
  | "contact"
  | "personal"
  | "bank"
  | "education"
  | "exit"
  | "contract"
  // D-059 lanjutan: keluarga (sensitif, grant data pribadi) & sertifikasi (Pelatihan).
  | "family"
  | "training"
  // D-060: tautan file Google Drive (diproses setelah simpan; hak akses dicek per jenis dokumen).
  | "attachment";

export interface ImportFieldDef {
  label: string;
  section: ImportSection;
  /** Sinonim header (sudah dinormalisasi: huruf kecil, tanpa tanda baca/isi kurung). */
  synonyms: readonly string[];
  /** Belum punya tempat di DB (Fase 7): dipakai sebagai petunjuk, tidak disimpan. */
  notStored?: boolean;
  /** Grup di dropdown pemetaan (field berkelompok Formulir Data Karyawan, D-059). */
  group?: string;
}
