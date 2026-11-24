import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tmOn } from "@/app/feature-flags";
import { createQueryClient } from "@/app/providers";
import { routes } from "@/app/router";
import { AuthProvider } from "@/features/auth/auth-provider";
import { safeNext } from "@/features/auth/pages/login-page";
import { isAbsenPath, isStandalone } from "@/lib/standalone";
import { authState, me } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// TM-D32: Absen sebagai aplikasi layar utama. Mode "hanya Absen" HANYA saat display-mode: standalone;
// di browser biasa web tetap utuh (tanpa pengalihan).

type Role = Parameters<typeof me>[0];

function stubDisplayMode(standalone: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: standalone && query.includes("display-mode: standalone"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  );
}

function backend(role: Role, employeeId: string | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname.replace("/api/v1", "");
      const json = (status: number, data: unknown) =>
        new Response(JSON.stringify(data), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (path === "/me")
        return json(200, { data: { ...me(role, false, employeeId), onboarding: null } });
      if (path === "/notifications")
        return json(200, { data: [], meta: { page: 1, pageSize: 5, total: 0, unreadCount: 0 } });
      return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
    }),
  );
}

function renderRouter(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  authState.session = { access_token: "t", user: { id: "u" } };
});
afterEach(() => vi.unstubAllGlobals());

const landsOn = (router: ReturnType<typeof renderRouter>, path: string) =>
  waitFor(() => expect(router.state.location.pathname).toBe(path), { timeout: 15000 });

describe("TM-D32: deteksi mode & path", () => {
  it("isStandalone mengikuti display-mode; isAbsenPath hanya /absen dan turunannya", () => {
    stubDisplayMode(false);
    expect(isStandalone()).toBe(false);
    stubDisplayMode(true);
    expect(isStandalone()).toBe(true);
    expect(isAbsenPath("/absen")).toBe(true);
    expect(isAbsenPath("/absen/riwayat")).toBe(true);
    expect(isAbsenPath("/absensi")).toBe(false);
    expect(isAbsenPath("/time/absen")).toBe(false);
  });

  it("safeNext: standalone hanya menerima /absen*; browser tidak berubah", () => {
    expect(safeNext("/time/cuti", true)).toBe("/absen");
    expect(safeNext("/", true)).toBe("/absen");
    expect(safeNext(null, true)).toBe("/absen");
    expect(safeNext("//jahat.test", true)).toBe("/absen");
    expect(safeNext("/absen/riwayat?x=1", true)).toBe("/absen/riwayat?x=1");
    expect(safeNext("/time/cuti", false)).toBe("/time/cuti");
    expect(safeNext("//jahat.test", false)).toBe("/");
    expect(safeNext(null, false)).toBe("/");
  });
});

describe.skipIf(!tmOn("tmAbsen"))("TM-D32: standalone (dibuka dari ikon layar utama)", () => {
  beforeEach(() => stubDisplayMode(true));

  it("Karyawan: halaman web (/time/absen-harian) dialihkan ke /absen", async () => {
    backend("EMPLOYEE", "emp-1");
    await landsOn(renderRouter("/time/absen-harian"), "/absen");
  });

  it("Manager/HR/SA dengan data karyawan: / dan /time/* → /absen", async () => {
    backend("MANAGER", "emp-2");
    await landsOn(renderRouter("/"), "/absen");
  });

  it("login dengan ?next ke halaman web → tetap /absen", async () => {
    backend("EMPLOYEE", "emp-1");
    await landsOn(renderRouter("/login?next=%2Ftime%2Fcuti"), "/absen");
  });

  it("Akun tanpa data karyawan: pesan + 'Buka web di browser' (membuka web penuh)", async () => {
    backend("SUPER_ADMIN", null);
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const router = renderRouter("/");
    await landsOn(router, "/absen");
    expect(
      await screen.findByText(/Akun ini belum terhubung ke data karyawan/, {}, { timeout: 15000 }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Buka web di browser" }));
    expect(open).toHaveBeenCalledWith(`${window.location.origin}/`, "_blank", "noopener");
    expect(screen.getByRole("button", { name: "Salin tautan" })).toBeInTheDocument();
  });

  it("belum login: /login tetap terbuka; jalur terproteksi ke /login seperti biasa", async () => {
    authState.session = null;
    backend("EMPLOYEE", "emp-1");
    const login = renderRouter("/login");
    expect(
      await screen.findByRole("button", { name: "Masuk" }, { timeout: 15000 }),
    ).toBeInTheDocument();
    expect(login.state.location.pathname).toBe("/login");
  });
});

describe.skipIf(!tmOn("tmAbsen"))("TM-D32: browser biasa (bukan standalone) tidak berubah", () => {
  beforeEach(() => stubDisplayMode(false));

  it("SA tanpa data karyawan: dashboard / dan /time/* tetap terbuka, tanpa pengalihan", async () => {
    backend("SUPER_ADMIN", null);
    const router = renderRouter("/");
    await screen.findByRole("button", { name: /Menu akun/ }, { timeout: 15000 });
    expect(router.state.location.pathname).toBe("/");
    expect(screen.queryByText(/Akun ini belum terhubung/)).not.toBeInTheDocument();
  });

  it("Manager dengan data karyawan: /time/absen-harian tidak dialihkan ke /absen", async () => {
    backend("MANAGER", "emp-2");
    const router = renderRouter("/time/absen-harian");
    await screen.findByRole("button", { name: /Menu akun/ }, { timeout: 15000 });
    expect(router.state.location.pathname).toBe("/time/absen-harian");
  });

  it("login dengan ?next ke halaman web tetap dihormati", async () => {
    backend("SUPER_ADMIN", null);
    const router = renderRouter("/login?next=%2Ftime%2Fabsen-harian");
    await landsOn(router, "/time/absen-harian");
  });

  it("akun tanpa data karyawan membuka /absen → Akses ditolak (bukan pesan standalone)", async () => {
    backend("EMPLOYEE", null);
    renderRouter("/absen");
    expect(await screen.findByText("Akses ditolak", {}, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Buka web di browser" })).not.toBeInTheDocument();
  });
});
