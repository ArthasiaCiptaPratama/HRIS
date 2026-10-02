import { createClient } from "@supabase/supabase-js";
import { BusinessRuleError } from "./errors.ts";

// Admin API Supabase (service role). HANYA server/script; kunci tidak pernah ke frontend (PROMPT §3.13).
// Antarmuka supaya test memakai implementasi palsu (tidak pernah mengirim undangan/ban sungguhan).
export interface AuthAdmin {
  findUserByEmail(email: string): Promise<{ id: string } | null>;
  /** Mengirim email undangan (SMTP Supabase, D-032) dan mengembalikan user Auth baru. */
  inviteUser(email: string, redirectTo: string): Promise<{ id: string }>;
  createConfirmedUser(email: string, password: string): Promise<{ id: string }>;
  /**
   * D-045: kirim ulang tautan atur password ke user Auth yang sudah ada (undangan ulang ditolak
   * Supabase untuk email terdaftar). Email dikirim SMTP Supabase; tautan kembali ke `redirectTo`.
   */
  sendPasswordSetupEmail(email: string, redirectTo: string): Promise<void>;
  /** PLAN §3.2.7: user Auth tidak dihapus; akun nonaktif di-ban agar tidak bisa login. */
  setBanned(userId: string, banned: boolean): Promise<void>;
}

// Durasi ban "selamanya" (± 100 tahun); dibuka dengan "none".
const BAN_FOREVER = "876000h";

export function createSupabaseAdmin(supabaseUrl: string, serviceRoleKey: string): AuthAdmin {
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const auth = client.auth.admin;

  return {
    async findUserByEmail(email) {
      const target = email.toLowerCase();
      for (let page = 1; page <= 50; page += 1) {
        const { data, error } = await auth.listUsers({ page, perPage: 200 });
        if (error) throw new Error(`Supabase listUsers failed: ${error.message}`);
        const found = data.users.find((user) => user.email?.toLowerCase() === target);
        if (found) return { id: found.id };
        if (data.users.length < 200) return null;
      }
      throw new Error("Supabase listUsers: too many pages");
    },

    async inviteUser(email, redirectTo) {
      const { data, error } = await auth.inviteUserByEmail(email, { redirectTo });
      if (error || !data.user)
        throw new Error(`Supabase inviteUserByEmail failed: ${error?.message ?? "no user"}`);
      return { id: data.user.id };
    },

    async createConfirmedUser(email, password) {
      const { data, error } = await auth.createUser({ email, password, email_confirm: true });
      if (error || !data.user)
        throw new Error(`Supabase createUser failed: ${error?.message ?? "no user"}`);
      return { id: data.user.id };
    },

    async sendPasswordSetupEmail(email, redirectTo) {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw new Error(`Supabase resetPasswordForEmail failed: ${error.message}`);
    },

    async setBanned(userId, banned) {
      const { error } = await auth.updateUserById(userId, {
        ban_duration: banned ? BAN_FOREVER : "none",
      });
      if (error) throw new Error(`Supabase updateUserById failed: ${error.message}`);
    },
  };
}

/** Dipakai bila SUPABASE_SERVICE_ROLE_KEY belum diisi: aksi akun ditolak dengan pesan jelas. */
export const UNCONFIGURED_AUTH_ADMIN: AuthAdmin = {
  findUserByEmail: notConfigured,
  inviteUser: notConfigured,
  createConfirmedUser: notConfigured,
  sendPasswordSetupEmail: notConfigured,
  setBanned: notConfigured,
};

async function notConfigured(): Promise<never> {
  throw new BusinessRuleError("Layanan akun belum dikonfigurasi (SUPABASE_SERVICE_ROLE_KEY).");
}
