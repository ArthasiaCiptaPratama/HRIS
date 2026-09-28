import type { Actor } from "../../core/access/index.ts";

// PROMPT §3.5: cek akses eksplisit. Notifikasi selalu milik penerimanya sendiri;
// kepemilikan ditegakkan di query (recipient_account_id = aktor), bukan hanya di sini.
export function canUseOwnNotifications(actor: Actor): boolean {
  return actor.accountId.length > 0;
}
