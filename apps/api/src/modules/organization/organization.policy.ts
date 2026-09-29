import type { Actor } from "../../core/access/index.ts";

// PLAN §4.3 "Kebijakan": struktur organisasi, jabatan, level, lokasi → 👁 untuk semua role.
// Ubah master data (✅ SUPER_ADMIN) menyusul di Fase 3.
export function canReadMasterData(actor: Actor): boolean {
  return actor.accountId.length > 0;
}
