import { vi } from "vitest";

// Mock supabase-js tanpa meng-import kode aplikasi (mencegah siklus/deadlock pada vi.mock).
export const authState: { session: { access_token: string; user: { id: string } } | null } = {
  session: null,
};
export const supabaseMock = {
  auth: {
    getSession: vi.fn(async () => ({ data: { session: authState.session } })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signInWithPassword: vi.fn(async () => ({
      data: {},
      error: { message: "Invalid login credentials" },
    })),
    signOut: vi.fn(async () => ({ error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
    updateUser: vi.fn(async () => ({ data: {}, error: null })),
  },
};
