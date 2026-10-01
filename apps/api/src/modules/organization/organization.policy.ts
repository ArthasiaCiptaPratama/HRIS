import { ROLE } from "@hris/shared";
import type { Actor } from "../../core/access/index.ts";

// PLAN §4.3 "Kebijakan": struktur organisasi, jabatan, level, lokasi → 👁 untuk semua role.
export function canReadMasterData(actor: Actor): boolean {
  return actor.accountId.length > 0;
}

// D-049: daftar admin master data (termasuk arsip & jumlah karyawan pemakai) — SA & HR (👁).
export function canViewMasterDataAdmin(actor: Actor): boolean {
  return actor.role === ROLE.SUPER_ADMIN || actor.role === ROLE.HR_ADMIN;
}

// D-049 / PLAN §4.3: tambah, ubah, arsip, pulihkan, hapus, gabungkan master data — SUPER_ADMIN saja
// (bukan hak eksklusif Utama). HR hanya MENAMBAH lewat import (D-042), dijaga di modul employee.
export function canManageMasterData(actor: Actor): boolean {
  return actor.role === ROLE.SUPER_ADMIN;
}
