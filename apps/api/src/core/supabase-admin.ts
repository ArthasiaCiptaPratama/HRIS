import { createClient } from "@supabase/supabase-js";

// Client Admin API Supabase (service role). HANYA server/script; kunci tidak pernah ke frontend (PROMPT §3.13).
export function createSupabaseAdmin(supabaseUrl: string, serviceRoleKey: string) {
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const auth = client.auth.admin;

  return {
    /** Cari user Auth berdasarkan email (Admin API tidak punya pencarian email; dipaginasi). */
    async findUserByEmail(email: string) {
      const target = email.toLowerCase();
      for (let page = 1; page <= 50; page += 1) {
        const { data, error } = await auth.listUsers({ page, perPage: 200 });
        if (error) throw new Error(`Supabase listUsers failed: ${error.message}`);
        const found = data.users.find((user) => user.email?.toLowerCase() === target);
        if (found) return found;
        if (data.users.length < 200) return null;
      }
      throw new Error("Supabase listUsers: too many pages");
    },

    /** Membuat user Auth berpassword yang sudah terkonfirmasi (tanpa email undangan; SMTP menunggu OD-5). */
    async createConfirmedUser(email: string, password: string) {
      const { data, error } = await auth.createUser({ email, password, email_confirm: true });
      if (error || !data.user)
        throw new Error(`Supabase createUser failed: ${error?.message ?? "no user"}`);
      return data.user;
    },
  };
}
