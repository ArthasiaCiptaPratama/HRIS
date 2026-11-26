import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/app/feature-flags";
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
  data: {
    companies: [],
    departments: [],
    positions: [],
    employmentStatuses: [],
    grades: [],
    workLocations: [],
  },
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
  company: { id: "co-acp", code: "ACP", name: "PT Arthasia Cipta Pratama" },
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
        "Import Data Karyawan",
        "Pengaktifan Karyawan",
        "Kontrak Akan Habis",
        "Data Karyawan Tidak Aktif",
        "Struktur Organisasi",
        "Data Kontak",
        "Laporan",
      ])
        expect(items).toContain(label);
    }
    // D-057 / ARS-D13: Riwayat Peringatan untuk SA dan HR ber-grant SP (bukan HR tanpa grant).
    expect(labels("SUPER_ADMIN")).toContain("Riwayat Peringatan");
    expect(labels("HR_ADMIN")).not.toContain("Riwayat Peringatan");
    // Arsip 1c: Data Keluarga & Data Bank (sensitif) hanya SA / pemegang grant baca.
    expect(labels("SUPER_ADMIN")).toEqual(expect.arrayContaining(["Data Keluarga", "Data Bank"]));
    expect(labels("HR_ADMIN")).not.toContain("Data Keluarga");
    expect(labels("HR_ADMIN")).not.toContain("Data Bank");
  });

  it("MANAGER (punya data karyawan): hanya baca — tanpa ubah status, arsip, laporan", () => {
    const items = labels("MANAGER", "emp-1");
    expect(items).toContain("Semua Karyawan Aktif");
    expect(items).toContain("Vendor");
    expect(items).toContain("Struktur Organisasi");
    for (const label of [
      "Ubah Status Karyawan",
      "Import Data Karyawan",
      "Pengaktifan Karyawan",
      "Kontrak Akan Habis",
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
          "Harian Lepas (THL)",
          "Semua Karyawan Internal",
        ],
      ],
      ["Program Magang", ["Magang"]],
      ["Tenaga Kerja Eksternal", ["Outsourcing", "Vendor", "Semua Tenaga Kerja Eksternal"]],
    ]);
    expect(personal?.sections[1]?.items.map((i) => i.label)).toEqual([
      "Ubah Status Karyawan",
      "Import Data Karyawan",
      "Pengaktifan Karyawan",
      "Kontrak Akan Habis",
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
      "Harian Lepas (THL)0",
      "Semua Karyawan Internal4",
    ]);
  });

  it("KTR-D2 revisi: halaman PKWT punya filter Tahap ber-jumlah; tahap menyatu di badge Status (2026-11-26) + Akhir kontrak", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T05:00:00Z"));
    const withStages = {
      data: {
        ...summary.data,
        active: {
          ...summary.data.active,
          pkwtStages: { stage1: 1, stage2: 0, stage3: 1, none: 0 },
        },
      },
    };
    const fetchMock = mockApi({
      "/me": [200, { data: me("SUPER_ADMIN", true) }],
      "/health": [200, health],
      "/notifications": [200, emptyNotifications],
      "/employees/summary": [200, withStages],
      "/master-data": [200, masterData],
      "/employees": [
        200,
        {
          data: [
            { ...employee("1", "Nur Aisyah"), contractStage: 1, contractEndDate: "2027-05-31" },
            { ...employee("2", "Wahyu Saputra"), contractStage: 3, contractEndDate: "2026-12-10" },
          ],
          meta: { page: 1, pageSize: 20, total: 2 },
        },
      ],
    });
    renderAt("/personal/pegawai-aktif/pkwt?tahap=3");
    const table = await screen.findByRole("table", { name: "Daftar karyawan" });
    expect(await within(table).findByText("Nur Aisyah")).toBeInTheDocument();
    const calls = () =>
      fetchMock.mock.calls
        .map(([input]) => new URL(String(input)))
        .filter((url) => url.pathname.endsWith("/employees"));
    expect(calls().at(-1)?.searchParams.get("pkwtStage")).toBe("3");
    const filter = screen.getByRole("group", { name: "Filter Tahap" });
    await waitFor(() =>
      expect(within(filter).getByRole("button", { name: /PKWT 3/ })).toHaveTextContent("1"),
    );
    expect(within(filter).getByRole("button", { name: /PKWT 3/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(filter).getByRole("button", { name: /Semua/ })).toHaveTextContent("2");
    // Masukan pengguna 2026-11-26: kolom Tahap dilebur ke badge Status ("PKWT 3"), Status bisa diurutkan.
    expect(within(table).queryByRole("columnheader", { name: /Tahap/ })).toBeNull();
    expect(
      within(within(table).getByRole("columnheader", { name: /Status/ })).getByRole("button"),
    ).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: /Akhir kontrak/ })).toBeInTheDocument();
    expect(within(table).getByText("PKWT 3")).toBeInTheDocument();
    // 15 hari lagi → merah; > 60 hari → hijau.
    expect(within(table).getByText("10 Des 2026")).toHaveClass("text-red-700");
    expect(within(table).getByText("31 Mei 2027")).toHaveClass("text-green-700");
    await userEvent.click(within(filter).getByRole("button", { name: /Tahap belum diisi/ }));
    await waitFor(() => expect(calls().at(-1)?.searchParams.get("pkwtStage")).toBe("NONE"));
    vi.useRealTimers();
  });

  it("KTR-D2 revisi: filter Tahap & kolom kontrak hanya di halaman PKWT", async () => {
    const fetchMock = mockApi({
      "/me": [200, { data: me("SUPER_ADMIN", true) }],
      "/health": [200, health],
      "/notifications": [200, emptyNotifications],
      "/employees/summary": [200, summary],
      "/master-data": [200, masterData],
      "/employees": [
        200,
        { data: [employee("1", "Nur Aisyah")], meta: { page: 1, pageSize: 20, total: 1 } },
      ],
    });
    renderAt("/personal/pegawai-aktif/tetap?tahap=2");
    const table = await screen.findByRole("table", { name: "Daftar karyawan" });
    expect(await within(table).findByText("Nur Aisyah")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filter Tahap" })).not.toBeInTheDocument();
    expect(
      within(table).queryByRole("columnheader", { name: /Akhir kontrak/ }),
    ).not.toBeInTheDocument();
    const listCall = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((url) => url.pathname.endsWith("/employees"));
    expect(listCall?.searchParams.has("pkwtStage")).toBe(false);
  });

  it("KTR-D5/D11: halaman Kontrak Akan Habis — filter 60 hari, urut akhir, jenis, badge menu & peringatan lewat", async () => {
    const ending = {
      data: {
        ...summary.data,
        active: { ...summary.data.active, contractsEnding: { soon: 3, overdue: 2 } },
      },
    };
    const fetchMock = mockApi({
      "/me": [200, { data: me("HR_ADMIN") }],
      "/health": [200, health],
      "/notifications": [200, emptyNotifications],
      "/employees/summary": [200, ending],
      "/master-data": [200, masterData],
      "/employees": [
        200,
        {
          data: [
            { ...employee("1", "Nur Aisyah"), contractStage: 3, contractEndDate: "2026-01-02" },
          ],
          meta: { page: 1, pageSize: 20, total: 1 },
        },
      ],
    });
    renderAt("/personal/kontrak-akan-habis");
    const table = await screen.findByRole("table", { name: "Daftar karyawan" });
    expect(await within(table).findByText("Nur Aisyah")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Kontrak Akan Habis");
    const calls = () =>
      fetchMock.mock.calls
        .map(([input]) => new URL(String(input)))
        .filter((url) => url.pathname.endsWith("/employees"));
    expect(calls().at(-1)?.searchParams.get("contractEndsWithin")).toBe("60");
    expect(calls().at(-1)?.searchParams.get("sort")).toBe("contractEndDate:asc");
    expect(calls().at(-1)?.searchParams.has("category")).toBe(false);
    expect(within(table).getByText(/Kontrak lewat \d+ hari/)).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent("2 kontrak sudah lewat");
    const side = screen.getByRole("navigation", { name: "Menu samping" });
    await waitFor(() =>
      expect(within(side).getByText("Kontrak Akan Habis").closest("a")).toHaveTextContent("5"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Masa Percobaan" }));
    await waitFor(() => expect(calls().at(-1)?.searchParams.get("category")).toBe("PROBATION"));
    expect(calls().at(-1)?.searchParams.get("contractEndsWithin")).toBe("60");
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

  it("EMP-D6: kolom Homebase & filter homebase → ?homebaseId= (param URL hb)", async () => {
    const HB = "00000000-0000-4000-8000-0000000000b1";
    const fetchMock = mockApi({
      "/me": [200, { data: me("HR_ADMIN") }],
      "/health": [200, health],
      "/notifications": [200, emptyNotifications],
      "/employees/summary": [200, summary],
      "/master-data": [
        200,
        {
          data: {
            ...masterData.data,
            homebases: [{ id: HB, name: "Palangka Raya", city: null, province: null }],
          },
        },
      ],
      "/employees": [
        200,
        {
          data: [{ ...employee("1", "Nur Aisyah"), homebase: { id: HB, name: "Palangka Raya" } }],
          meta: { page: 1, pageSize: 20, total: 1 },
        },
      ],
    });
    renderAt("/personal/pegawai-aktif/semua");
    const user = userEvent.setup();
    const table = await screen.findByRole("table", { name: "Daftar karyawan" });
    expect(await within(table).findByText("Nur Aisyah")).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Homebase" })).toBeInTheDocument();
    expect(within(table).getByText("Palangka Raya")).toBeInTheDocument();

    await user.click(await screen.findByRole("combobox", { name: "Filter homebase" }));
    await user.click(await screen.findByRole("option", { name: "Palangka Raya" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input]) => new URL(String(input)).searchParams.get("homebaseId") === HB,
        ),
      ).toBe(true),
    );
    // Filter aktif → tombol Reset muncul dan mengosongkan filter.
    await user.click(screen.getByRole("button", { name: /Reset/ }));
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Filter homebase" })).toHaveTextContent(
        "Semua homebase",
      ),
    );
  });

  it("menu Laporan mengikuti FEATURES.reports (ARS-D16)", async () => {
    mockApi({
      "/me": [200, { data: me("HR_ADMIN") }],
      "/health": [200, health],
      "/notifications": [200, emptyNotifications],
      "/employees/summary": [200, summary],
      "/master-data": [200, masterData],
    });
    renderAt("/personal/laporan");
    if (FEATURES.reports) {
      // Halaman Laporan memuat ECharts (lazy): beri waktu lebih di suite penuh.
      expect(
        await screen.findByRole("heading", { name: "Laporan" }, { timeout: 5000 }),
      ).toBeInTheDocument();
    } else {
      expect(
        await screen.findByRole("heading", { name: "Laporan sedang disiapkan" }),
      ).toBeInTheDocument();
    }
  });

  // Menu b–e mengikuti saklar FEATURES: aktif → halaman asli; nonaktif → Maintenance ("Segera").
  const MENUS = [
    ["/personal/ubah-status", "Ubah Status Karyawan", FEATURES.changeStatus],
    ["/personal/pengaktifan", "Pengaktifan Karyawan", FEATURES.activation],
    ["/personal/pegawai-tidak-aktif", "Data Karyawan Tidak Aktif", FEATURES.inactiveEmployees],
    ["/personal/struktur-organisasi", "Struktur Organisasi", FEATURES.orgStructure],
  ] as const;

  it.each(MENUS)("menu %s (%s) mengikuti FEATURES", async (path, title, enabled) => {
    mockApi({
      "/me": [200, { data: me("HR_ADMIN") }],
      "/health": [200, health],
      "/notifications": [200, emptyNotifications],
      "/employees/summary": [200, summary],
      "/master-data": [200, masterData],
      "/employees": [200, { data: [], meta: { page: 1, pageSize: 20, total: 0 } }],
      "/org-structure": [200, { data: { departments: [], totalEmployees: 0 } }],
    });
    renderAt(path);
    if (enabled) {
      expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
      expect(screen.queryByText("Maintenance")).not.toBeInTheDocument();
    } else {
      expect(
        await screen.findByRole("heading", { name: `${title} sedang disiapkan` }),
      ).toBeInTheDocument();
    }
  });

  it("sidebar: label 'Segera' hanya pada menu b–e yang belum aktif", async () => {
    mockApi({
      "/me": [200, { data: me("HR_ADMIN") }],
      "/health": [200, health],
      "/notifications": [200, emptyNotifications],
      "/employees/summary": [200, summary],
    });
    renderAt("/personal/arsip/kontak");
    const side = await screen.findByRole("navigation", { name: "Menu samping" });
    for (const [, title, enabled] of MENUS) {
      const link = within(side).getByText(title).closest("a");
      if (enabled) expect(link).not.toHaveTextContent(/segera/i);
      else expect(link).toHaveTextContent(/segera/i);
    }
  });

  // D-043 rilis bertahap (2026-10-08): fitur develop yang belum dirilis → menu "Segera" + halaman
  // Maintenance; Import & Struktur Organisasi tidak terpengaruh.
  const STAGED = [
    ["Penerimaan Karyawan Baru", "/penerimaan", FEATURES.onboarding],
    ["Jenis dokumen", "/master-data/jenis-dokumen", FEATURES.archive],
    ["Data Kontak", "/personal/arsip/kontak", FEATURES.archive],
    ["Pengajuan Perubahan Data", "/pengajuan-data", FEATURES.selfService],
    ["Layanan Mandiri", "/ess", FEATURES.selfService],
  ] as const;

  it.each(STAGED)("menu %s mengikuti saklar rilis bertahap", (label, to, enabled) => {
    const entries = flattenNav(visibleGroups(me("SUPER_ADMIN")));
    const entry = entries.find((e) => e.item.label === label);
    expect(entry?.item.to).toBe(to);
    expect(Boolean(entry?.item.maintenance)).toBe(!enabled);
    const importEntry = entries.find((e) => e.item.label === "Import Data Karyawan");
    expect(importEntry?.item.maintenance).toBeFalsy();
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
    ["daily-worker", "Harian Lepas (THL)"],
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

describe("K4 daftar THL", () => {
  it("chip dengan jumlah, kolom hadir/status, dan query thlStatus", async () => {
    const fetchMock = mockApi({
      "/me": [200, { data: me("SUPER_ADMIN", true) }],
      "/health": [200, health],
      "/notifications": [200, emptyNotifications],
      "/master-data": [200, masterData],
      "/employees/summary": [
        200,
        {
          data: {
            ...summary.data,
            active: { ...summary.data.active, thlStatuses: { APPROACHING: 1, REQUIRED: 2 } },
          },
        },
      ],
      "/employees": [
        200,
        {
          data: [
            { ...employee("1", "Contoh THL"), thlStatus: "REQUIRED", thlPresentDaysLastMonth: 22 },
          ],
          meta: { page: 1, pageSize: 20, total: 1 },
        },
      ],
    });
    renderAt("/personal/pegawai-aktif/harian?thlStatus=REQUIRED");
    const table = await screen.findByRole("table", { name: "Daftar karyawan" });
    expect(await within(table).findByText("Contoh THL")).toBeVisible();
    expect(within(table).getByRole("columnheader", { name: "Hadir bln lalu" })).toBeVisible();
    expect(within(table).getByText("22")).toBeVisible();
    expect(within(table).getByText("Wajib diangkat PKWTT")).toBeVisible();
    const filter = screen.getByRole("group", { name: "Filter status THL" });
    expect(
      within(filter).getByRole("button", { name: "Wajib diangkat PKWTT (2)" }),
    ).toHaveAttribute("aria-pressed", "true");
    const calls = () =>
      fetchMock.mock.calls
        .map(([input]) => new URL(String(input)))
        .filter((url) => url.pathname.endsWith("/employees"));
    expect(calls().at(-1)?.searchParams.get("thlStatus")).toBe("REQUIRED");
    await userEvent.click(within(filter).getByRole("button", { name: "Mendekati batas (1)" }));
    await waitFor(() => expect(calls().at(-1)?.searchParams.get("thlStatus")).toBe("APPROACHING"));
    await userEvent.click(within(filter).getByRole("button", { name: /Semua/ }));
    await waitFor(() => expect(calls().at(-1)?.searchParams.has("thlStatus")).toBe(false));
  });
  it("filter dan kolom THL tidak muncul pada halaman lain", async () => {
    const fetchMock = mockApi({
      "/me": [200, { data: me("SUPER_ADMIN", true) }],
      "/health": [200, health],
      "/notifications": [200, emptyNotifications],
      "/master-data": [200, masterData],
      "/employees/summary": [200, summary],
      "/employees": [
        200,
        { data: [employee("1", "Bukan THL")], meta: { page: 1, pageSize: 20, total: 1 } },
      ],
    });
    renderAt("/personal/pegawai-aktif/tetap?thlStatus=REQUIRED");
    expect(await screen.findByText("Bukan THL")).toBeVisible();
    expect(screen.queryByRole("group", { name: "Filter status THL" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Hadir bln lalu" })).not.toBeInTheDocument();
    const call = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((url) => url.pathname.endsWith("/employees"));
    expect(call?.searchParams.has("thlStatus")).toBe(false);
  });
});
