import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeNext } from "@/features/auth/pages/login-page";
import { authState, me, mockApi, renderAt, supabaseMock } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

const health = {
  data: { status: "ok", checks: { database: "ok" }, time: new Date().toISOString() },
};
const emptyNotifications = { data: [], meta: { page: 1, pageSize: 5, total: 0, unreadCount: 0 } };

beforeEach(() => {
  authState.session = null;
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("route guard & menu per role", () => {
  it("tanpa sesi → diarahkan ke halaman login", async () => {
    mockApi({});
    renderAt("/akun");
    expect(
      await screen.findByRole("heading", { name: "Masuk ke Akselerasi Arthasia" }),
    ).toBeInTheDocument();
  });

  it("EMPLOYEE: top nav hanya Dashboard; /akun menampilkan akses ditolak", async () => {
    authState.session = { access_token: "t", user: { id: "u" } };
    mockApi({
      "/me": [200, { data: me("EMPLOYEE") }],
      "/notifications": [200, emptyNotifications],
      "/health": [200, health],
    });
    renderAt("/akun");
    expect(await screen.findByRole("heading", { name: "Akses ditolak" })).toBeInTheDocument();
    const top = screen.getByRole("navigation", { name: "Navigasi utama" });
    expect(top).toHaveTextContent("Dashboard");
    expect(top).not.toHaveTextContent("Personal Management");
    expect(top).not.toHaveTextContent("Administrasi");
  });

  it("SUPER_ADMIN: top nav lengkap; sidebar Administrasi berisi Akun, Grant izin, Audit log", async () => {
    authState.session = { access_token: "t", user: { id: "u" } };
    mockApi({
      "/me": [200, { data: me("SUPER_ADMIN", true) }],
      "/health": [200, health],
      "/notifications": [200, emptyNotifications],
      "/accounts": [200, { data: [], meta: { page: 1, pageSize: 20, total: 0 } }],
    });
    renderAt("/akun");
    const top = await screen.findByRole("navigation", { name: "Navigasi utama" });
    for (const label of ["Dashboard", "Personal Management", "Administrasi"])
      expect(top).toHaveTextContent(label);
    const side = screen.getByRole("navigation", { name: "Menu samping" });
    for (const label of ["Akun", "Grant izin", "Audit log"]) expect(side).toHaveTextContent(label);
  });

  it("HR_ADMIN: boleh Akun, tidak boleh Grant & Audit", async () => {
    authState.session = { access_token: "t", user: { id: "u" } };
    mockApi({
      "/me": [200, { data: me("HR_ADMIN") }],
      "/health": [200, health],
      "/notifications": [200, emptyNotifications],
    });
    renderAt("/grant");
    expect(await screen.findByRole("heading", { name: "Akses ditolak" })).toBeInTheDocument();
    const side = screen.getByRole("navigation", { name: "Menu samping" });
    expect(side).toHaveTextContent("Akun");
    expect(side).not.toHaveTextContent("Grant izin");
  });

  it("API /me 401 (akun nonaktif) → sesi dikeluarkan", async () => {
    authState.session = { access_token: "t", user: { id: "u" } };
    mockApi({
      "/me": [
        401,
        { error: { code: "UNAUTHENTICATED", message: "Akun tidak aktif", requestId: "r" } },
      ],
    });
    renderAt("/");
    await waitFor(() => expect(supabaseMock.auth.signOut).toHaveBeenCalled());
  });
});

describe("halaman login", () => {
  it("validasi di client, lalu pesan generik bila kredensial salah", async () => {
    mockApi({});
    renderAt("/login");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Masuk" }));
    expect(await screen.findByText("Isi NIP atau email.")).toBeInTheDocument();
    expect(supabaseMock.auth.signInWithPassword).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("NIP atau email"), "Budi@Example.test");
    await user.type(screen.getByLabelText("Password"), "salah-password");
    await user.click(screen.getByRole("button", { name: "Masuk" }));
    expect(await screen.findByText(/NIP\/email atau password salah/)).toBeInTheDocument();
    expect(supabaseMock.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "budi@example.test",
      password: "salah-password",
    });
  });

  it("D-048: NIP dipetakan ke alamat login turunan; masukan tidak sah ditolak di client", async () => {
    mockApi({});
    renderAt("/login");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("NIP atau email"), "bukan nik!");
    await user.type(screen.getByLabelText("Password"), "rahasia-panjang");
    await user.click(screen.getByRole("button", { name: "Masuk" }));
    expect(await screen.findByText("Masukkan NIP atau email yang valid.")).toBeInTheDocument();
    expect(supabaseMock.auth.signInWithPassword).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("NIP atau email"));
    await user.type(screen.getByLabelText("NIP atau email"), "25.11.ACP.023");
    await user.click(screen.getByRole("button", { name: "Masuk" }));
    await waitFor(() =>
      expect(supabaseMock.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "25.11.acp.023@test.login.akselerasi.invalid",
        password: "rahasia-panjang",
      }),
    );
  });

  it("lupa password lewat API (NIP/email); pesan selalu sama", async () => {
    const fetchMock = mockApi({ "/auth/password-reset": [200, { data: { accepted: true } }] });
    renderAt("/lupa-password");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("NIP atau email"), "25.11.ACP.023");
    await user.click(screen.getByRole("button", { name: "Kirim tautan" }));
    expect(await screen.findByText(/Jika akun tersebut terdaftar/)).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit];
    expect(String(url)).toContain("/auth/password-reset");
    expect(JSON.parse(String(init.body))).toEqual({ identifier: "25.11.ACP.023" });
    expect(supabaseMock.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("?next= hanya menerima path internal (cegah open redirect)", () => {
    expect(safeNext("/akun")).toBe("/akun");
    expect(safeNext("https://jahat.test")).toBe("/");
    expect(safeNext("//jahat.test")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});
