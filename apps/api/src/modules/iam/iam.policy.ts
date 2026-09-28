import type { Actor } from "../../core/access/index.ts";

// PROMPT §3.5: setiap endpoint punya cek akses eksplisit; default tolak.
// GET /me: setiap akun aktif boleh melihat profil aksesnya sendiri (PLAN §4.3, data "sendiri").
export function canReadOwnAccount(actor: Actor): boolean {
  return actor.accountId.length > 0;
}
