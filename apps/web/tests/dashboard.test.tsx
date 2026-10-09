import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// Dashboard: agregat karyawan hanya untuk SA/HR (GET /dashboard); role lain melihat sapaan dan
// tidak pernah meminta data agregat.
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mockBackend(role: Parameters<typeof me>[0], dashboardStatus = 500) {
  const paths: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname.replace("/api/v1", "");
      paths.push(path);
      if (path === "/me") return json(200, { data: me(role) });
      if (path === "/notifications")
        return json(200, { data: [], meta: { page: 1, pageSize: 5, total: 0, unreadCount: 0 } });
      if (path === "/dashboard" && dashboardStatus === 200)
        return json(200, {
          data: {
            overview: { total: 12, active: 10, inactive: 2, avgTenureYears: 3.4 },
            byCategory: [],
            byLocation: [],
            byDepartment: [],
            byPosition: [],
            byJoinYear: [],
            byEducationPivot: [],
          },
        });
      if (path === "/dashboard")
        return json(dashboardStatus, { error: { code: "INTERNAL", message: "x", requestId: "r" } });
      // D-062: belum pernah simpan susunan → susunan bawaan; pivot kosong (tanpa kanvas ECharts).
      if (path === "/me/dashboard-layout")
        return json(200, { data: { layout: null, updatedAt: null } });
      if (path === "/dashboard/pivot")
        return json(200, {
          data: { rows: "category", cols: null, rowKeys: [], colKeys: [], cells: [], total: 0 },
        });
      return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
    }),
  );
  return paths;
}

beforeEach(() => {
  authState.session = { access_token: "t", user: { id: "u" } };
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("Dashboard", () => {
  it.each(["MANAGER", "EMPLOYEE"] as const)("%s: sapaan tanpa meminta /dashboard", async (role) => {
    const paths = mockBackend(role);
    renderAt("/");
    expect(await screen.findByText("Dashboard masih kosong")).toBeInTheDocument();
    expect(paths).not.toContain("/dashboard");
  });

  it.each(["SUPER_ADMIN", "HR_ADMIN"] as const)(
    "%s: meminta /dashboard; gagal → pesan jelas",
    async (role) => {
      const paths = mockBackend(role);
      renderAt("/");
      expect(
        await screen.findByText(/Gagal memuat data dashboard/, {}, { timeout: 5000 }),
      ).toBeInTheDocument();
      await waitFor(() => expect(paths).toContain("/dashboard"));
    },
  );

  it("SUPER_ADMIN: susunan bawaan (statistik + widget pivot) dan katalog Tambah widget", async () => {
    const paths = mockBackend("SUPER_ADMIN", 200);
    renderAt("/");
    expect(
      await screen.findByText("Pendidikan per Kategori", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Lokasi Kerja per Kategori")).toBeInTheDocument();
    expect(screen.getByText("Distribusi Unit per Kategori")).toBeInTheDocument();
    expect(await screen.findByText("12")).toBeInTheDocument();
    await waitFor(() => expect(paths).toContain("/me/dashboard-layout"));
    await waitFor(() => expect(paths).toContain("/dashboard/pivot"));

    await userEvent.click(screen.getByRole("button", { name: /Tambah widget/ }));
    expect(await screen.findByText("Buat grafik sendiri")).toBeInTheDocument();
    expect(screen.getByText("Kelompok Umur per Jenis Kelamin")).toBeInTheDocument();
  });
});
