import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activeTrail, CATEGORY_SLUGS, flattenNav, visibleGroups } from "@/app/navigation";
import { authState, me, mockApi, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// D-035: navigasi kelompok besar → kecil → isi dan halaman Personal Management.
const health = {
  data: { status: "ok", checks: { database: "ok" }, time: new Date().toISOString() },
};
const emptyNotifications = { data: [], meta: { page: 1, pageSize: 5, total: 0, unreadCount: 0 } };
const summary = {
  data: {
    active: {
      total: 3,
      byCategory: { PERMANENT: 1, PKWT: 2, INTERNSHIP: 0, DAILY_WORKER: 0, OUTSOURCING: 0 },
      uncategorized: 0,
    },
    inactive: 1,
  },
};
const masterData = {
  data: { departments: [], positions: [], employmentStatuses: [], grades: [], workLocations: [] },
};
const employee = (id: string, name: string) => ({
  id,
  employeeNumber: `ACP-${id}`,
  fullName: name,
  workEmail: null,
  phoneNumber: null,
  gender: "FEMALE",
  joinDate: "2025-05-05",
  endDate: null,
  isActive: true,
  exitReason: null,
  employmentStatus: { id: "st-pkwt", name: "PKWT", category: "PKWT" },
  position: { id: "p1", name: "Sales Executive" },
  department: { id: "d1", name: "Penjualan & Pemasaran" },
  workLocation: null,
  grade: null,
  manager: null,
});

beforeEach(() => {
  authState.session = { access_token: "t", user: { id: "u" } };
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("navigation.ts (satu sumber menu per role)", () => {
  const labels = (role: Parameters<typeof me>[0], employeeId: string | null = null) =>
    flattenNav(visibleGroups(me(role, false, employeeId))).map((e) => e.item.label);

  it("SA & HR: seluruh Kepegawaian + Arsip + Laporan", () => {
    for (const role of ["SUPER_ADMIN", "HR_ADMIN"] as const) {
      const items = labels(role);
      for (const label of [
        "Pegawai Tetap",
        "Semua Pegawai",
        "Ubah Status Pegawai",
        "Pengaktifan Pegawai",
        "Data Pegawai Tidak Aktif",
        "Struktur Organisasi",
        "Data Keluarga",
        "Riwayat Peringatan",
        "Laporan",
      ])
        expect(items).toContain(label);
    }
  });

  it("MANAGER (punya data karyawan): hanya baca — tanpa ubah status, arsip, laporan", () => {
    const items = labels("MANAGER", "emp-1");
    expect(items).toContain("Semua Pegawai");
    expect(items).toContain("Struktur Organisasi");
    for (const label of ["Ubah Status Pegawai", "Pengaktifan Pegawai", "Data Keluarga", "Laporan"])
      expect(items).not.toContain(label);
  });

  it("MANAGER tanpa data karyawan & EMPLOYEE: tanpa Personal Management", () => {
    expect(visibleGroups(me("MANAGER")).map((g) => g.id)).not.toContain("personal");
    expect(visibleGroups(me("EMPLOYEE")).map((g) => g.id)).toEqual(["dashboard", "me"]);
  });

  it("slug kategori ↔ breadcrumb", () => {
    expect(CATEGORY_SLUGS.pkwt).toBe("PKWT");
    const trail = activeTrail(visibleGroups(me("HR_ADMIN")), "/personal/pegawai-aktif/pkwt");
    expect(trail?.group.label).toBe("Personal Management");
    expect(trail?.section.label).toBe("Kepegawaian");
    expect(trail?.child?.label).toBe("PKWT");
  });
});

describe("halaman Personal Management", () => {
  it("SA: Data Pegawai Aktif PKWT memanggil API dengan kategori & menampilkan baris + jumlah", async () => {
    const fetchMock = mockApi({
      "/me": [200, { data: me("SUPER_ADMIN", true) }],
      "/health": [200, health],
      "/notifications": [200, emptyNotifications],
      "/employees/summary": [200, summary],
      "/master-data": [200, masterData],
      "/employees": [
        200,
        {
          data: [employee("1", "Nur Aisyah"), employee("2", "Wahyu Saputra")],
          meta: { page: 1, pageSize: 20, total: 2 },
        },
      ],
    });
    renderAt("/personal/pegawai-aktif/pkwt");
    const table = await screen.findByRole("table", { name: "Daftar pegawai" });
    expect(await within(table).findByText("Nur Aisyah")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("PKWT");
    const listCall = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((url) => url.pathname.endsWith("/employees"));
    expect(listCall?.searchParams.get("category")).toBe("PKWT");
    expect(listCall?.searchParams.get("active")).toBe("true");
    // Badge jumlah di sidebar dari /employees/summary.
    const side = screen.getByRole("navigation", { name: "Menu samping" });
    // Badge jumlah aktif (3) & PKWT (2) dari /employees/summary.
    await waitFor(() =>
      expect(within(side).getByText("Semua Pegawai").closest("a")).toHaveTextContent("3"),
    );
    expect(within(side).getByText("PKWT").closest("a")).toHaveTextContent("2");
  });

  it("pencarian tersinkron ke URL (debounce) dan dikirim sebagai ?q=", async () => {
    const fetchMock = mockApi({
      "/me": [200, { data: me("HR_ADMIN") }],
      "/health": [200, health],
      "/notifications": [200, emptyNotifications],
      "/employees/summary": [200, summary],
      "/master-data": [200, masterData],
      "/employees": [200, { data: [], meta: { page: 1, pageSize: 20, total: 0 } }],
    });
    renderAt("/personal/pegawai-aktif/semua");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Cari pegawai"), "nur");
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input]) => new URL(String(input)).searchParams.get("q") === "nur",
        ),
      ).toBe(true),
    );
    expect(await screen.findByText("Tidak ada yang cocok")).toBeInTheDocument();
  });

  it("menu Arsip menampilkan halaman Maintenance", async () => {
    mockApi({
      "/me": [200, { data: me("HR_ADMIN") }],
      "/health": [200, health],
      "/notifications": [200, emptyNotifications],
      "/employees/summary": [200, summary],
    });
    renderAt("/personal/arsip/keluarga");
    expect(
      await screen.findByRole("heading", { name: "Data Keluarga sedang disiapkan" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Maintenance")).toBeInTheDocument();
  });

  it.each([
    ["/personal/ubah-status", "Ubah Status Pegawai sedang disiapkan"],
    ["/personal/pengaktifan", "Pengaktifan Pegawai sedang disiapkan"],
    ["/personal/pegawai-tidak-aktif", "Data Pegawai Tidak Aktif sedang disiapkan"],
    ["/personal/struktur-organisasi", "Struktur Organisasi sedang disiapkan"],
  ])("menu b–e ditutup sementara (FEATURES): %s → Maintenance", async (path, heading) => {
    mockApi({
      "/me": [200, { data: me("HR_ADMIN") }],
      "/health": [200, health],
      "/notifications": [200, emptyNotifications],
      "/employees/summary": [200, summary],
    });
    renderAt(path);
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it("sidebar menandai menu b–e 'Segera' (badge angka Tidak Aktif tidak tampil)", async () => {
    mockApi({
      "/me": [200, { data: me("HR_ADMIN") }],
      "/health": [200, health],
      "/notifications": [200, emptyNotifications],
      "/employees/summary": [200, summary],
    });
    renderAt("/personal/arsip/kontak");
    const side = await screen.findByRole("navigation", { name: "Menu samping" });
    for (const label of [
      "Ubah Status Pegawai",
      "Pengaktifan Pegawai",
      "Data Pegawai Tidak Aktif",
      "Struktur Organisasi",
    ]) {
      const link = within(side).getByText(label).closest("a");
      expect(link).toHaveTextContent(/segera/i);
    }
    expect(within(side).getByText("Data Pegawai Tidak Aktif").closest("a")).not.toHaveTextContent(
      "1",
    );
  });

  it("MANAGER membuka Ubah Status → akses ditolak (API juga menolak)", async () => {
    mockApi({
      "/me": [200, { data: me("MANAGER", false, "emp-1") }],
      "/health": [200, health],
      "/notifications": [200, emptyNotifications],
      "/employees/summary": [200, summary],
    });
    renderAt("/personal/ubah-status");
    expect(await screen.findByRole("heading", { name: "Akses ditolak" })).toBeInTheDocument();
  });

  it("EMPLOYEE membuka Personal Management → akses ditolak", async () => {
    mockApi({
      "/me": [200, { data: me("EMPLOYEE") }],
      "/health": [200, health],
      "/notifications": [200, emptyNotifications],
    });
    renderAt("/personal/pegawai-aktif/semua");
    expect(await screen.findByRole("heading", { name: "Akses ditolak" })).toBeInTheDocument();
  });

  it("slug kategori tidak dikenal → diarahkan ke Semua Pegawai", async () => {
    mockApi({
      "/me": [200, { data: me("HR_ADMIN") }],
      "/health": [200, health],
      "/notifications": [200, emptyNotifications],
      "/employees/summary": [200, summary],
      "/master-data": [200, masterData],
      "/employees": [200, { data: [], meta: { page: 1, pageSize: 20, total: 0 } }],
    });
    renderAt("/personal/pegawai-aktif/entah");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Semua Pegawai");
  });
});
