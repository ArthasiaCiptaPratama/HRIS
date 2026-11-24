import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES, tmOn } from "@/app/feature-flags";
import { visibleGroups } from "@/app/navigation";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// #102 (TM-D30): akun EMPLOYEE yang tertaut karyawan berberanda di halaman absen — "/" (login, atur
// password, root) → /absen; menu web Dashboard/Time Management diganti tab "Absen"; beranda absen
// memuat banner Lengkapi data, kartu Perlu ditindaklanjuti, menu Lembur & Layanan Mandiri.

type Role = Parameters<typeof me>[0];
const employee = { id: "emp-1", fullName: "Rina", employeeNumber: "ACP-1" };
const today = {
  serverTime: "2026-10-21T03:00:00.000Z",
  timezone: "Asia/Makassar",
  gpsAccuracyMaxM: 100,
  employee,
  location: { id: "loc", name: "Pelabuhan", latitude: -3.8, longitude: 115.2, radiusM: 500 },
  anywhere: false,
  locationSource: "EMPLOYEE",
  roster: [{ date: "2026-10-21", code: "OFF", shift: null }],
  openDay: null,
  recent: [],
  next: "IN",
  breakState: "NOT_REQUIRED",
  offDay: true,
  checkOutOpensAt: null,
  breakOpensAt: null,
  breakClosesAt: null,
};

interface Options {
  role?: Role;
  employeeId?: string | null;
  completionRequired?: boolean;
  alphaWithoutStatement?: boolean;
}

function mockBackend({
  role = "EMPLOYEE",
  employeeId = "emp-1",
  completionRequired = false,
  alphaWithoutStatement = false,
}: Options = {}) {
  const paths: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname.replace("/api/v1", "");
      paths.push(path);
      const json = (status: number, data: unknown) =>
        new Response(JSON.stringify(data), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (path === "/me")
        return json(200, {
          data: {
            ...me(role, false, employeeId),
            onboarding: completionRequired
              ? { status: "INVITED", completionRequired: true, submitted: false, locked: false }
              : null,
          },
        });
      if (path === "/attendance/me/today") return json(200, { data: today });
      if (path === "/attendance/me/history") return json(200, { data: [] });
      if (path === "/attendance/statements/me")
        return json(200, {
          data: alphaWithoutStatement
            ? [{ dayId: "d9", employee, workDate: "2026-10-14", statement: null }]
            : [],
        });
      if (path === "/roster-changes") return json(200, { data: [] });
      if (path === "/notifications")
        return json(200, { data: [], meta: { page: 1, pageSize: 5, total: 0, unreadCount: 0 } });
      if (path === "/health")
        return json(200, { data: { status: "ok", checks: { database: "ok" }, time: "x" } });
      return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
    }),
  );
  return paths;
}

const onAbsenHome = () => screen.findByText("Menu", {}, { timeout: 15000 });

beforeEach(() => {
  authState.session = { access_token: "t", user: { id: "u" } };
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe.skipIf(!tmOn("tmAbsen"))("#102: karyawan berberanda di halaman absen", () => {
  it("EMPLOYEE tertaut: membuka / langsung ke beranda absen tanpa meminta data dashboard", async () => {
    const paths = mockBackend();
    renderAt("/");
    expect(await onAbsenHome()).toBeInTheDocument();
    expect(screen.queryByText("Perlu tindakan")).not.toBeInTheDocument();
    expect(paths).not.toContain("/dashboard");
  });

  // /absen sendiri di bingkai HP (tanpa kerangka web); halaman web lain yang jatuh ke grup Absen
  // (grup 1 halaman) tidak lagi menampilkan sidebar desktop berisi satu menu.
  it("halaman web yang jatuh ke grup Absen tanpa sidebar desktop", async () => {
    mockBackend();
    renderAt("/tidak-ada");
    expect(
      await screen.findByRole("heading", { name: "Halaman tidak ditemukan" }, { timeout: 15000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Menu samping" })).not.toBeInTheDocument();
  });

  it("login: tanpa ?next → beranda absen; ?next tetap dihormati", async () => {
    mockBackend();
    renderAt("/login");
    expect(await onAbsenHome()).toBeInTheDocument();
  });

  it("login dengan ?next=/profil tetap ke /profil", async () => {
    mockBackend();
    renderAt("/login?next=%2Fprofil");
    expect(
      await screen.findByRole("heading", { name: /Profil/ }, { timeout: 15000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Menu")).not.toBeInTheDocument();
  });

  it("atur password (tautan undangan) → setelah simpan mendarat di beranda absen", async () => {
    const user = userEvent.setup();
    mockBackend();
    renderAt("/auth/atur-password");
    await user.type(await screen.findByLabelText("Password baru"), "Sekali-Pendek-1234");
    await user.type(screen.getByLabelText("Ulangi password"), "Sekali-Pendek-1234");
    await user.click(screen.getByRole("button", { name: /Simpan/ }));
    expect(await onAbsenHome()).toBeInTheDocument();
  });

  it("EMPLOYEE belum tertaut tetap di dashboard web (tidak bisa absen)", async () => {
    mockBackend({ employeeId: null });
    renderAt("/");
    expect(await screen.findByText("Perlu tindakan", {}, { timeout: 15000 })).toBeInTheDocument();
  });

  it("MANAGER yang juga karyawan tetap di dashboard", async () => {
    mockBackend({ role: "MANAGER" });
    renderAt("/");
    expect(await screen.findByText("Perlu tindakan", {}, { timeout: 15000 })).toBeInTheDocument();
  });

  it("beranda absen: banner Lengkapi data, Perlu ditindaklanjuti, menu Lembur & Layanan Mandiri", async () => {
    mockBackend({ completionRequired: true, alphaWithoutStatement: true });
    renderAt("/absen");
    await onAbsenHome();
    expect(screen.getByRole("link", { name: /Lengkapi data Anda/ })).toHaveAttribute(
      "href",
      "/onboarding",
    );
    const tasks = await screen.findByRole("region", { name: "Perlu ditindaklanjuti" });
    expect(
      within(tasks).getByRole("link", { name: /1 hari Alpha belum ada surat pernyataan/ }),
    ).toHaveAttribute("href", "/absen/koreksi");
    if (tmOn("tmOvertime")) {
      expect(screen.getByRole("link", { name: "Lembur & SPL" })).toHaveAttribute(
        "href",
        "/absen/lembur-spl",
      );
    }
    if (FEATURES.selfService) {
      expect(screen.getByRole("link", { name: "Layanan Mandiri" })).toHaveAttribute("href", "/ess");
    }
  });

  it("beranda absen tanpa permintaan HR & tanpa tugas: banner dan kartu tidak tampil", async () => {
    mockBackend();
    renderAt("/absen");
    await onAbsenHome();
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Perlu ditindaklanjuti" })).toBeNull(),
    );
    expect(screen.queryByText(/Lengkapi data Anda/)).not.toBeInTheDocument();
  });

  it("profil absen: EMPLOYEE melihat 'Akun Saya (versi web)' tanpa tautan versi web ke /", async () => {
    mockBackend();
    renderAt("/absen/profil");
    expect(
      await screen.findByRole("link", { name: /Akun Saya \(versi web\)/ }, { timeout: 15000 }),
    ).toHaveAttribute("href", "/profil");
    expect(screen.queryByRole("link", { name: /Buka HRIS versi web/ })).not.toBeInTheDocument();
  });

  it("profil absen: MANAGER tetap punya tautan Buka HRIS versi web", async () => {
    mockBackend({ role: "MANAGER" });
    renderAt("/absen/profil");
    expect(
      await screen.findByRole("link", { name: /Buka HRIS versi web/ }, { timeout: 15000 }),
    ).toHaveAttribute("href", "/");
  });
});

describe.skipIf(!tmOn("tmAbsen"))("#102: navigasi web karyawan", () => {
  const groupsOf = (role: Role, employeeId: string | null) =>
    visibleGroups({ ...me(role, false, employeeId), onboarding: null } as never).map((g) => g.id);

  it("EMPLOYEE tertaut: tab Absen + Akun Saya; tanpa Dashboard & Time Management", () => {
    const ids = groupsOf("EMPLOYEE", "emp-1");
    expect(ids).toContain("absen");
    expect(ids).toContain("me");
    expect(ids).not.toContain("dashboard");
    expect(ids).not.toContain("time");
  });

  it("EMPLOYEE belum tertaut tetap Dashboard; MANAGER & HR tidak berubah", () => {
    expect(groupsOf("EMPLOYEE", null)).toContain("dashboard");
    expect(groupsOf("EMPLOYEE", null)).not.toContain("absen");
    for (const role of ["MANAGER", "HR_ADMIN", "SUPER_ADMIN"] as const) {
      const ids = groupsOf(role, "emp-1");
      expect(ids).toContain("dashboard");
      expect(ids).toContain("time");
      expect(ids).not.toContain("absen");
    }
  });
});
