import type { AuthAdmin } from "../../src/core/supabase-admin.ts";

/** AuthAdmin palsu: mencatat panggilan, tidak pernah menghubungi Supabase (PROMPT §10). */
export function createFakeAuthAdmin() {
  const users = new Map<string, string>(); // email → id
  const invited: string[] = [];
  const passwordSetup: string[] = [];
  const failInviteFor = new Set<string>();
  const banned = new Map<string, boolean>();
  let failBan = false;

  const admin: AuthAdmin = {
    async findUserByEmail(email) {
      const id = users.get(email.toLowerCase());
      return id ? { id } : null;
    },
    async inviteUser(email) {
      if (failInviteFor.has(email.toLowerCase())) throw new Error("fake invite failure");
      const id = crypto.randomUUID();
      users.set(email.toLowerCase(), id);
      invited.push(email.toLowerCase());
      return { id };
    },
    async createConfirmedUser(email) {
      const id = crypto.randomUUID();
      users.set(email.toLowerCase(), id);
      return { id };
    },
    async sendPasswordSetupEmail(email) {
      passwordSetup.push(email.toLowerCase());
    },
    async setBanned(userId, isBanned) {
      if (failBan) throw new Error("fake ban failure");
      banned.set(userId, isBanned);
    },
  };

  return {
    admin,
    invited,
    passwordSetup,
    banned,
    /** Undangan ke email ini gagal (uji antrean FAILED). */
    failInviteFor(email: string) {
      failInviteFor.add(email.toLowerCase());
    },
    /** Mendaftarkan user Auth yang "sudah ada" (mis. dari bootstrap). */
    addExistingUser(email: string, id: string = crypto.randomUUID()) {
      users.set(email.toLowerCase(), id);
      return id;
    },
    setFailBan(value: boolean) {
      failBan = value;
    },
  };
}
