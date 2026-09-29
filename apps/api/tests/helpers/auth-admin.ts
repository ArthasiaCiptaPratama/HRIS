import type { AuthAdmin } from "../../src/core/supabase-admin.ts";

/** AuthAdmin palsu: mencatat panggilan, tidak pernah menghubungi Supabase (PROMPT §10). */
export function createFakeAuthAdmin() {
  const users = new Map<string, string>(); // email → id
  const invited: string[] = [];
  const banned = new Map<string, boolean>();
  let failBan = false;

  const admin: AuthAdmin = {
    async findUserByEmail(email) {
      const id = users.get(email.toLowerCase());
      return id ? { id } : null;
    },
    async inviteUser(email) {
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
    async setBanned(userId, isBanned) {
      if (failBan) throw new Error("fake ban failure");
      banned.set(userId, isBanned);
    },
  };

  return {
    admin,
    invited,
    banned,
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
