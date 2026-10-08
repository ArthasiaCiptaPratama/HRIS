import type { AuthAdmin } from "../../src/core/supabase-admin.ts";

/** AuthAdmin palsu: mencatat panggilan, tidak pernah menghubungi Supabase (PROMPT §10). */
export function createFakeAuthAdmin() {
  const users = new Map<string, string>(); // email → id
  const invited: string[] = [];
  const passwordSetup: string[] = [];
  const failInviteFor = new Set<string>();
  const banned = new Map<string, boolean>();
  const emailChanges: { userId: string; email: string }[] = [];
  const recoveryLinks: string[] = [];
  let failEmailUpdate = false;
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
    async updateUserEmail(userId, email) {
      if (failEmailUpdate) throw new Error("fake email update failure");
      emailChanges.push({ userId, email });
    },
    async generateRecoveryLink(email, redirectTo) {
      recoveryLinks.push(email.toLowerCase());
      return `https://auth.test/recover?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(redirectTo)}`;
    },
  };

  return {
    admin,
    invited,
    passwordSetup,
    banned,
    /** D-048: email Auth yang diganti (alamat turunan NIK). */
    emailChanges,
    /** D-048: email Auth yang dibuatkan tautan recovery. */
    recoveryLinks,
    setFailEmailUpdate(value: boolean) {
      failEmailUpdate = value;
    },
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
