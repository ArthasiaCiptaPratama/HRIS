import { ROLE_LABELS } from "@hris/shared";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tmOn } from "@/app/feature-flags";
import { createQueryClient } from "@/app/providers";
import { routes } from "@/app/router";
import { AuthProvider } from "@/features/auth/auth-provider";
import { authState, me, supabaseMock } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// #102 susulan (investigasi "Akses ditolak" 2026-11-16): akun Karyawan (beranda /absen) yang membuka
// rute terlarang dialihkan ke /absen + toast, bukan layar "Akses ditolak". Penyebab nyata: ?next dari
// akun lain (H1) dan sesi Supabase yang berganti di tab lain pada browser yang sama (H2b).

type Role = Parameters<typeof me>[0];
let who: { role: Role; employeeId: string | null } = { role: "EMPLOYEE", employeeId: "emp-1" };
let emit: ((event: string, session: unknown) => void) | null = null;

function backend() {
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
        return json(200, { data: { ...me(who.role, false, who.employeeId), onboarding: null } });
      if (path === "/notifications")
        return json(200, { data: [], meta: { page: 1, pageSize: 5, total: 0, unreadCount: 0 } });
      if (path === "/health")
        return json(200, { data: { status: "ok", checks: { database: "ok" }, time: "x" } });
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

const info = vi.spyOn(toast, "info");

beforeEach(() => {
  emit = null;
  info.mockClear();
  authState.session = { access_token: "t", user: { id: "u" } };
  supabaseMock.auth.onAuthStateChange.mockImplementation(((
    cb: (event: string, session: unknown) => void,
  ) => {
    emit = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  }) as never);
});
afterEach(() => vi.unstubAllGlobals());

const toAbsen = async (router: ReturnType<typeof renderRouter>) => {
  await waitFor(() => expect(router.state.location.pathname).toBe("/absen"), { timeout: 15000 });
  expect(screen.queryByText("Akses ditolak")).not.toBeInTheDocument();
  expect(info).toHaveBeenCalledWith(
    "Halaman itu tidak tersedia untuk akun Karyawan — dibuka halaman Absen.",
    expect.anything(),
  );
};

describe.skipIf(!tmOn("tmAbsen"))("#102: karyawan tidak melihat layar Akses ditolak", () => {
  it("H1: login dengan ?next ke halaman HR (/time/absen-harian) → dialihkan ke /absen", async () => {
    who = { role: "EMPLOYEE", employeeId: "emp-1" };
    backend();
    await toAbsen(renderRouter("/login?next=%2Ftime%2Fabsen-harian"));
  });

  it("H2b: tab di halaman SA berganti sesi ke akun Karyawan → dialihkan ke /absen", async () => {
    who = { role: "SUPER_ADMIN", employeeId: null };
    backend();
    const router = renderRouter("/time/absen-harian");
    await screen.findByRole("button", { name: /Menu akun/ }, { timeout: 15000 });
    expect(router.state.location.pathname).toBe("/time/absen-harian");
    who = { role: "EMPLOYEE", employeeId: "emp-1" };
    act(() => emit?.("SIGNED_IN", { access_token: "t2", user: { id: "u-emp" } }));
    await toAbsen(router);
  });

  it("halaman Approval absen (khusus atasan/HR) dibuka akun Karyawan → kembali ke beranda absen", async () => {
    who = { role: "EMPLOYEE", employeeId: "emp-1" };
    backend();
    await toAbsen(renderRouter("/absen/approval"));
  });

  it("role lain: Akses ditolak + akun aktif + Ke Beranda / Masuk dengan akun lain (F2)", async () => {
    who = { role: "MANAGER", employeeId: "emp-2" };
    backend();
    supabaseMock.auth.signOut.mockClear();
    const router = renderRouter("/akun");
    expect(await screen.findByText("Akses ditolak", {}, { timeout: 15000 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/akun");
    expect(info).not.toHaveBeenCalled();
    expect(screen.getByText(/Masuk sebagai:/)).toHaveTextContent(
      `Masuk sebagai: manager@example.test (${ROLE_LABELS.MANAGER})`,
    );
    expect(screen.getByRole("link", { name: "Ke Beranda" })).toHaveAttribute("href", "/");
    await userEvent.click(screen.getByRole("button", { name: "Masuk dengan akun lain" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"), { timeout: 5000 });
    expect(router.state.location.search).toBe("");
    expect(supabaseMock.auth.signOut).toHaveBeenCalled();
  });

  it("EMPLOYEE belum tertaut membuka /absen → Akses ditolak (tanpa pengalihan berulang)", async () => {
    who = { role: "EMPLOYEE", employeeId: null };
    backend();
    const router = renderRouter("/absen");
    expect(await screen.findByText("Akses ditolak", {}, { timeout: 15000 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/absen");
  });
});
