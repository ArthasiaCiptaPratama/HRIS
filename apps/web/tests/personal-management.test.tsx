import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activeTrail, flattenNav, visibleGroups } from "@/app/navigation";
import { authState, me, mockApi, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// D-035: navigasi kelompok besar → kecil → isi dan halaman Personal Management.
// D-038: Data Karyawan Aktif dikelompokkan Internal / Magang / Eksternal.
const health = {
  data: { status: "ok", checks: { database: "ok" }, time: new Date().toISOString() },
};
const emptyNotifications = { data: [], meta: { page: 1, pageSize: 5, total: 0, unreadCount: 0 } };
const summary = {
  data: {
    active: {
      total: 7,
      byCategory: {
        PERMANENT: 1,
        PROBATION: 1,
        PKWT: 2,
        DAILY_WORKER: 0,
        INTERNSHIP: 1,
        OUTSOURCING: 1,
        VENDOR: 1,
      },
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
  photoUrl: null,
});

beforeEach(() => {
  authState.session = { access_token: "t", user: { id: "u" } };
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("navigation.ts (satu sumber menu per role)", () => {
  const labels = (role: Parameters<typeof me>[0], employeeId: string | null = null) =>
    flattenNav(visibleGroups(me(role, false, employeeId))).map((e) => e.item.label);

  it("SA & HR: seluruh Data Karyawan Aktif + Pengelolaan + Arsip + Laporan", () => {
    for (const role of ["SUPER_ADMIN", "HR_ADMIN"] as const) {
      const items = labels(role);
      for (const label of [
        "Karyawan Tetap",
        "Semua Karyawan Aktif",
        "Ubah Status Karyawan",
        "Pengaktifan Karyawan",
        "Data Karyawan Tidak Aktif",
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
    expect(items).toContain("Semua Karyawan Aktif");
    expect(items).toContain("Vendor");
    expect(items).toContain("Struktur Organisasi");
    for (const label of [
      "Ubah Status Karyawan",
      "Pengaktifan Karyawan",
      "Data Keluarga",
      "Laporan",
    ])
      expect(items).not.toContain(label);
  });

  it("MANAGER tanpa data karyawan & EMPLOYEE: tanpa Personal Management", () => {
    expect(visibleGroups(me("MANAGER")).map((g) => g.id)).not.toContain("personal");
    expect(visibleGroups(me("EMPLOYEE")).map((g) => g.id)).toEqual(["dashboard", "me"]);
  });

  it("D-038: susunan sidebar Data Karyawan Aktif (grup → kategori) & seksi Pengelolaan", () => {
    const personal = visibleGroups(me("HR_ADMIN")).find((g) => g.id === "personal");
    expect(personal?.sections.map((s) => s.label)).toEqual([
      "Data Karyawan Aktif",
      "Pengelolaan Karyawan",
      "Arsip",
      "Laporan & Rekap",
    ]);
    const active = personal?.sections[0]?.items ?? [];
    expect(active.map((i) => [i.label, i.children?.map((c) => c.label) ?? []])).toEqual([
      ["Semua Karyawan Aktif", []],
      [
        "Karyawan Internal",
        [
          "Karyawan Tetap",
          "Karyawan Percobaan",
          "PKWT",
          "Pekerja Harian",
          "Semua Karyawan Internal",
        ],
      ],
      ["Program Magang", ["Magang"]],
      ["Tenaga Kerja Eksternal", ["Outsourcing", "Vendor", "Semua Tenaga Kerja Eksternal"]],
    ]);
    expect(personal?.sections[1]?.items.map((i) => i.label)).toEqual([
      "Ubah Status Karyawan",
      "Pengaktifan Karyawan",
      "Data Karyawan Tidak Aktif",
      "Struktur Organisasi",
    ]);
  });

  it.each([
    ["pkwt", "Karyawan Internal", "PKWT"],
    ["internal", "Karyawan Internal", "Semua Karyawan Internal"],
    ["magang", "Program Magang", "Magang"],
    ["vendor", "Tenaga Kerja Eksternal", "Vendor"],
    ["eksternal", "Tenaga Kerja Eksternal", "Semua Tenaga Kerja Eksternal"],
  ])("slug %s ↔ breadcrumb grup %s › %s", (slug, item, child) => {
    const trail = activeTrail(visibleGroups(me("HR_ADMIN")), `/personal/pegawai-aktif/${slug}`);
    expect(trail?.group.label).toBe("Personal Management");
    expect(trail?.section.label).toBe("Data Karyawan Aktif");
    expect(trail?.item.label).toBe(item);
    expect(trail?.child?.label).toBe(child);
  });

  it("slug semua → item Semua Karyawan Aktif (tanpa anak)", () => {
    const trail = activeTrail(visibleGroups(me("HR_ADMIN")), "/personal/pegawai-aktif/semua");
    expect(trail?.item.label).toBe("Semua Karyawan Aktif");
    expect(trail?.child).toBeUndefined();
  });
});

describe("halaman Personal Management", () => {
  it("SA: Data Karyawan Aktif PKWT memanggil API dengan kategori & menampilkan baris + jumlah", async () => {
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
    const table = await screen.findByRole("table", { name: "Daftar karyawan" });
    expect(await within(table).findByText("Nur Aisyah")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("PKWT");
    const listCall = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((url) => url.pathname.endsWith("/employees"));
    expect(listCall?.searchParams.get("category")).toBe("PKWT");
    expect(listCall?.searchParams.get("active")).toBe("true");
    expect(listCall?.searchParams.has("group")).toBe(false);
    // Badge jumlah di sidebar dari /employees/summary: aktif 7, PKWT 2, gabungan grup dijumlahkan.
    const side = screen.getByRole("navigation", { name: "Menu samping" });
    await waitFor(() =>
      expect(within(side).getByText("Semua Karyawan Aktif").closest("a")).toHaveTextContent("7"),
    );
    expect(within(side).getByText("PKWT").closest("a")).toHaveTextContent("2");
    expect(within(side).getByText("Semua Karyawan Internal").closest("a")).toHaveTextContent("4");
    expect(within(side).getByText("Semua Tenaga Kerja Eksternal").closest("a")).toHaveTextContent(
      "2",
    );
    // Chip halaman = saudara dalam grup Internal.
    const chips = screen.getByRole("navigation", { name: "Kategori karyawan" });
    expect(
      within(chips)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual([
      "Karyawan Tetap1",
      "Karyawan Percobaan1",
      "PKWT2",
      "Pekerja Harian0",
      "Semua Karyawan Internal4",
    ]);
  });

  it("D-038: Semua Tenaga Kerja Eksternal → API ?group=EXTERNAL tanpa category", async () => {
    const fetchMock = mockApi({
      "/me": [200, { data: me("HR_ADMIN") }],
      "/health": [200, health],
      "/notifications": [200, emptyNotifications],
      "/employees/summary": [200, summary],
      "/master-data": [200, masterData],
      "/employees": [200, { data: [], meta: { page: 1, pageSize: 20, total: 0 } }],
    });
    renderAt("/personal/pegawai-aktif/eksternal");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Semua Tenaga Kerja Eksternal",
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls
          .map(([input]) => new URL(String(input)))
          .some((url) => url.pathname.endsWith("/employees") && url.searchParams.get("group")),
      ).toBe(true),
    );
    const listCall = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((url) => url.pathname.endsWith("/employees"));
    expect(listCall?.searchParams.get("group")).toBe("EXTERNAL");
    expect(listCall?.searchParams.has("category")).toBe(false);
    expect(await screen.findByText("Belum ada karyawan aktif di kelompok ini")).toBeTruthy();
  });

  it("D-038: halaman Semua Karyawan Aktif → chip per grup", async () => {
    mockApi({
      "/me": [200, { data: me("HR_ADMIN") }],
      "/health": [200, health],
      "/notifications": [200, emptyNotifications],
      "/employees/summary": [200, summary],
      "/master-data": [200, masterData],
      "/employees": [200, { data: [], meta: { page: 1, pageSize: 20, total: 0 } }],
    });
    renderAt("/personal/pegawai-aktif/semua");
    const chips = await screen.findByRole("navigation", { name: "Kategori karyawan" });
    await waitFor(() =>
      expect(
        within(chips)
          .getAllByRole("link")
          .map((a) => a.textContent),
      ).toEqual([
        "Semua Karyawan Aktif7",
        "Karyawan Internal4",
        "Program Magang1",
        "Tenaga Kerja Eksternal2",
      ]),
    );
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
    await user.type(await screen.findByLabelText("Cari karyawan"), "nur");
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
    ["/personal/ubah-status", "Ubah Status Karyawan sedang disiapkan"],
    ["/personal/pengaktifan", "Pengaktifan Karyawan sedang disiapkan"],
    ["/personal/pegawai-tidak-aktif", "Data Karyawan Tidak Aktif sedang disiapkan"],
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
      "Ubah Status Karyawan",
      "Pengaktifan Karyawan",
      "Data Karyawan Tidak Aktif",
      "Struktur Organisasi",
    ]) {
      const link = within(side).getByText(label).closest("a");
      expect(link).toHaveTextContent(/segera/i);
    }
    expect(within(side).getByText("Data Karyawan Tidak Aktif").closest("a")).not.toHaveTextContent(
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

  it.each([
    ["internship", "Magang"],
    ["daily-worker", "Pekerja Harian"],
    ["entah", "Semua Karyawan Aktif"],
  ])("slug lama/tidak dikenal %s → diarahkan ke %s", async (slug, heading) => {
    mockApi({
      "/me": [200, { data: me("HR_ADMIN") }],
      "/health": [200, health],
      "/notifications": [200, emptyNotifications],
      "/employees/summary": [200, summary],
      "/master-data": [200, masterData],
      "/employees": [200, { data: [], meta: { page: 1, pageSize: 20, total: 0 } }],
    });
    renderAt(`/personal/pegawai-aktif/${slug}`);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(heading);
  });
});
