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
  // D-037: unggah foto ke signed upload URL (tidak pernah ke Supabase sungguhan).
  storageUpload: vi.fn(async (..._args: unknown[]) => ({ data: { path: "x" }, error: null })),
  storage: {
    from: vi.fn((_bucket: string) => ({
      uploadToSignedUrl: (...args: unknown[]) => supabaseMock.storageUpload(...args),
    })),
  },
};
