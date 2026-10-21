import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/app/feature-flags";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));
// ECharts butuh canvas sungguhan — di jsdom cukup dicek label aksesibelnya.
vi.mock("@/features/reports/components/report-chart", () => ({
  ReportChart: ({ label }: { label: string }) => <div role="img" aria-label={label} />,
}));

// ARS-D16/D17 (Arsip gelombang 3): Personal Management › Laporan batch 1.

const person = {
  employeeId: "e1",
  fullName: "Agus Pratama",
  employeeNumber: "ACP-2023-0007",
  company: "ACP",
  unit: "Drilling",
  position: "Helper",
};
const months = Array.from({ length: 10 }, (_, i) => ({
  month: i + 1,
  startActive: 10,
  endActive: 10,
  joined: i === 2 ? 1 : 0,
  left: i === 4 ? 1 : 0,
  turnover: i === 4 ? 10 : 0,
}));
const headcount = {
  year: 2026,
  asOf: "2026-10-16",
  months,
  summary: { startActive: 10, endActive: 10, joined: 1, left: 1, turnover: 10 },
  byCompany: [{ key: "co", label: "ACP", active: 10, joined: 1, left: 1 }],
  byUnit: [{ key: "u", label: "Drilling", active: 10, joined: 1, left: 1 }],
  byStatus: [{ key: "s", label: "Karyawan Tetap", active: 10, joined: 1, left: 1 }],
  exitReasons: [{ key: "RESIGNATION", label: "Mengundurkan diri", count: 1 }],
  leavers: [
    { ...person, fullName: "Budi Keluar", endDate: "2026-05-31", exitReason: "Mengundurkan diri" },
  ],
  joiners: [{ ...person, employeeId: "e9", fullName: "Citra Masuk", joinDate: "2026-03-02" }],
};
const documentExpiry = (hidden: number) => ({
  asOf: "2026-10-16",
  counts: { EXPIRED: 1, D30: 1, D60: 0, D90: 0 },
  byType: [{ documentType: "Sertifikat K3", EXPIRED: 1, D30: 1, D60: 0, D90: 0, total: 2 }],
  hiddenSensitive: hidden,
  rows: [{ ...person, documentType: "Sertifikat K3", expiresAt: "2026-10-10", bucket: "EXPIRED" }],
});
const completeness = {
  total: 2,
  complete: 1,
  percent: 50,
  siteTypesSkipped: [],
  byItem: [
    { key: "NPWP", label: "NPWP", missing: 1 },
    { key: "BANK", label: "Rekening bank", missing: 2 },
  ],
  byCompany: [{ label: "ACP", total: 2, complete: 1, percent: 50 }],
  rows: [
    { ...person, missing: ["NPWP", "Rekening bank"], missingKeys: ["NPWP", "BANK"] },
    {
      ...person,
      employeeId: "e2",
      fullName: "Dewi Rekening",
      employeeNumber: "ACP-2024-0002",
      missing: ["Rekening bank"],
      missingKeys: ["BANK"],
    },
  ],
};
const warningLetters = (canList: boolean) => ({
  year: 2026,
  asOf: "2026-10-16",
  activeTotal: 1,
  activeByLevel: { SP1: 1, SP2: 0, SP3: 0 },
  unconfirmed: 1,
  byViolation: [{ label: "Terlambat berulang", count: 1 }],
  byCompany: [{ label: "ACP", SP1: 1, SP2: 0, SP3: 0, total: 1 }],
  issuedByMonth: Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    SP1: i === 9 ? 1 : 0,
    SP2: 0,
    SP3: 0,
  })),
  canList,
  rows: canList
    ? [
        {
          ...person,
          letterId: "sp1",
          level: "SP1",
          number: "001/SP1/HRD-ACP/X/2026",
          violation: "Terlambat berulang",
          issuedAt: "2026-10-06",
          effectiveUntil: "2027-04-05",
          confirmed: false,
        },
      ]
    : [],
});
// --- Batch 2 (ARS-D21) ---
const tenureRow = { label: "Drilling", "<1": 1, "1-3": 0, "3-5": 0, "5-10": 1, "10+": 0, total: 2 };
const tenure = {
  asOf: "2026-10-16",
  year: 2026,
  month: 10,
  total: 2,
  averageYears: 3.5,
  buckets: [
    { key: "<1", label: "< 1 tahun", count: 1 },
    { key: "1-3", label: "1–3 tahun", count: 0 },
    { key: "3-5", label: "3–5 tahun", count: 0 },
    { key: "5-10", label: "5–10 tahun", count: 1 },
    { key: "10+", label: "≥ 10 tahun", count: 0 },
  ],
  byCompany: [{ ...tenureRow, label: "ACP" }],
  byUnit: [tenureRow],
  jubilees: [{ ...person, fullName: "Eko Jubilee", joinDate: "2021-10-05", years: 5 }],
};
const demographics = {
  asOf: "2026-10-16",
  total: 2,
  age: [
    { key: "<25", label: "< 25 tahun", count: 1 },
    { key: "-", label: "Belum diisi", count: 1 },
  ],
  gender: [
    { key: "MALE", label: "Laki-laki", count: 1 },
    { key: "FEMALE", label: "Perempuan", count: 1 },
    { key: "-", label: "Belum diisi", count: 0 },
  ],
  education: [
    { key: "S1", label: "S1", count: 2 },
    { key: "-", label: "Belum diisi", count: 0 },
  ],
  originCity: [
    { label: "Balikpapan", count: 2 },
    { label: "Belum diisi", count: 0 },
  ],
  cityCount: 1,
};
const movementCounts = { PROMOTION: 1, DEMOTION: 0, TRANSFER: 1, UNRANKED: 0 };
const movements = {
  year: 2026,
  asOf: "2026-10-16",
  total: 2,
  counts: movementCounts,
  byMonth: Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    PROMOTION: i === 3 ? 1 : 0,
    DEMOTION: 0,
    TRANSFER: i === 6 ? 1 : 0,
    UNRANKED: 0,
  })),
  rows: [
    {
      ...person,
      fullName: "Fajar Naik",
      historyId: "h1",
      effectiveDate: "2026-04-01",
      kind: "PROMOTION",
      fromPosition: "Helper",
      toPosition: "Foreman",
      fromLevel: "Helper / Non-staf",
      toLevel: "Foreman",
      fromUnit: "Drilling",
      toUnit: "Drilling",
      fromCompany: null,
      toCompany: null,
    },
    {
      ...person,
      employeeId: "e3",
      fullName: "Gita Pindah",
      historyId: "h2",
      effectiveDate: "2026-07-01",
      kind: "TRANSFER",
      fromPosition: "Helper",
      toPosition: "Helper",
      fromLevel: "Helper / Non-staf",
      toLevel: "Helper / Non-staf",
      fromUnit: "Drilling",
      toUnit: "Blasting",
      fromCompany: "CD2",
      toCompany: "ACP",
    },
  ],
};
const birthdays = {
  asOf: "2026-10-16",
  year: 2026,
  month: 10,
  total: 1,
  rows: [{ ...person, fullName: "Hana Ultah", day: 16 }],
};
const assetCounts = { AVAILABLE: 1, ASSIGNED: 1, MAINTENANCE: 0, LOST: 0, RETIRED: 0 };
const assets = {
  asOf: "2026-10-16",
  total: 2,
  counts: assetCounts,
  overdueLoans: 0,
  byCategory: [{ label: "Laptop", ...assetCounts, total: 2 }],
  byLocation: [{ label: "Tanpa lokasi", ...assetCounts, total: 2 }],
  byCompany: [{ label: "ACP", ...assetCounts, total: 2 }],
  unreturned: [
    {
      ...person,
      fullName: "Indra Keluar",
      endDate: "2026-09-30",
      kind: "Aset",
      item: "Laptop Dell (ACP-LTP-0001)",
      quantity: 1,
      since: "2025-06-01",
    },
  ],
};
const changeCounts = { PENDING: 1, APPROVED: 1, REJECTED: 0, CANCELLED: 0 };
const dataChanges = (canList: boolean) => ({
  year: 2026,
  asOf: "2026-10-16",
  total: 2,
  counts: changeCounts,
  pendingNow: 1,
  oldestPendingDays: 4,
  averageDays: 1.5,
  bySection: [{ key: "BANK", label: "Rekening bank", ...changeCounts, total: 2, averageDays: 1.5 }],
  byMonth: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, submitted: 0, decided: 0 })),
  canList,
  rows: canList
    ? [
        {
          ...person,
          fullName: "Joko Ajukan",
          requestId: "r1",
          section: "Rekening bank",
          status: "PENDING",
          submittedAt: "2026-10-12T02:00:00.000Z",
          reviewedAt: null,
          days: null,
        },
      ]
    : [],
});
type Call = { path: string; search: string };

function mockFetch(
  role: ReturnType<typeof me> | Record<string, unknown>,
  opts: { hidden?: number; canList?: boolean } = {},
) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const path = url.pathname.replace("/api/v1", "");
      calls.push({ path, search: url.search });
      const json = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (path === "/me") return json(200, { data: role });
      if (path === "/health")
        return json(200, { data: { status: "ok", checks: { database: "ok" }, time: "x" } });
      if (path === "/notifications")
        return json(200, { data: [], meta: { page: 1, pageSize: 5, total: 0, unreadCount: 0 } });
      if (path === "/employees/summary")
        return json(200, {
          data: { active: { total: 1, byCategory: {}, uncategorized: 0 }, inactive: 0 },
        });
      if (path === "/master-data")
        return json(200, {
          data: {
            companies: [{ id: "co-acp", code: "ACP", name: "PT Arthasia Cipta Pratama" }],
            departments: [
              {
                id: "u1",
                name: "Drilling",
                parentId: null,
                unitType: "DEPARTMENT",
                companyId: "co-acp",
              },
            ],
            positions: [],
            employmentStatuses: [],
            grades: [],
            workLocations: [],
          },
        });
      if (path === "/reports/headcount") return json(200, { data: headcount });
      if (path === "/reports/document-expiry")
        return json(200, { data: documentExpiry(opts.hidden ?? 0) });
      if (path === "/reports/completeness") return json(200, { data: completeness });
      if (path === "/reports/warning-letters")
        return json(200, { data: warningLetters(opts.canList ?? true) });
      if (path === "/reports/tenure") return json(200, { data: tenure });
      if (path === "/reports/demographics") return json(200, { data: demographics });
      if (path === "/reports/movements") return json(200, { data: movements });
      if (path === "/reports/birthdays") return json(200, { data: birthdays });
      if (path === "/reports/assets") return json(200, { data: assets });
      if (path === "/reports/data-changes")
        return json(200, { data: dataChanges(opts.canList ?? true) });
      if (path.endsWith("/export"))
        return json(200, { data: { fileName: "laporan.xlsx", rows: 3, contentBase64: "UEs=" } });
      return json(404, { error: { code: "NOT_FOUND", message: "Tidak ditemukan." } });
    }),
  );
  return calls;
}

beforeEach(() => {
  authState.session = { access_token: "tok", user: { id: "u1" } };
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());

describe.skipIf(!FEATURES.reports)("Personal Management › Laporan (ARS-D16/D17)", () => {
  it("HR: headcount & turnover — kartu ringkasan, tabel per bulan, karyawan keluar; filter tahun dikirim", async () => {
    const calls = mockFetch(me("HR_ADMIN"));
    renderAt("/personal/laporan");
    expect(
      await screen.findByRole("heading", { name: "Laporan" }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Turnover 2026", undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("10%", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Headcount per bulan" })).toBeInTheDocument();
    expect(screen.getByText("Budi Keluar")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /Masuk \(1\)/ }));
    expect(screen.getByText("Citra Masuk")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Grafik masuk dan keluar 2026/ })).toBeInTheDocument();
    expect(
      calls.some((c) => c.path === "/reports/headcount" && c.search.includes("year=2026")),
    ).toBe(true);
  });

  it("dokumen kedaluwarsa: kelompok + keterangan dokumen sensitif yang disembunyikan", async () => {
    mockFetch(me("HR_ADMIN"), { hidden: 2 });
    renderAt("/personal/laporan?laporan=dokumen");
    expect(
      await screen.findByText(/2 dokumen sensitif tidak ditampilkan/, undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Daftar dokumen kedaluwarsa" });
    expect(within(table).getByText("Sertifikat K3")).toBeInTheDocument();
  });

  it("kelengkapan: persen & daftar data kurang tanpa nilai", async () => {
    mockFetch(me("HR_ADMIN"));
    renderAt("/personal/laporan?laporan=kelengkapan");
    const table = await screen.findByRole(
      "table",
      { name: "Karyawan belum lengkap" },
      { timeout: 5000 },
    );
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(screen.getByText("50%", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Persen lengkap" })).toBeInTheDocument();
  });

  it("kelengkapan: klik item menyaring daftar (chip bisa dihapus); cari nama/NIP", async () => {
    mockFetch(me("HR_ADMIN"));
    renderAt("/personal/laporan?laporan=kelengkapan");
    const table = await screen.findByRole(
      "table",
      { name: "Karyawan belum lengkap" },
      { timeout: 5000 },
    );
    expect(within(table).getByText("Dewi Rekening")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^NPWP/ }));
    const npwp = screen.getByRole("table", { name: "Karyawan belum lengkap" });
    expect(within(npwp).queryByText("Dewi Rekening")).not.toBeInTheDocument();
    expect(within(npwp).getByText("Agus Pratama")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Hapus saringan Belum: NPWP" }));
    const again = screen.getByRole("table", { name: "Karyawan belum lengkap" });
    expect(within(again).getByText("Dewi Rekening")).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole("textbox", { name: "Cari di Karyawan belum lengkap" }),
      "2024-0002",
    );
    const filtered = screen.getByRole("table", { name: "Karyawan belum lengkap" });
    expect(within(filtered).queryByText("Agus Pratama")).not.toBeInTheDocument();
    expect(within(filtered).getByText("Dewi Rekening")).toBeInTheDocument();
  });

  it("klik nama karyawan membuka panel profil di halaman yang sama", async () => {
    mockFetch(me("HR_ADMIN"));
    renderAt("/personal/laporan?laporan=kelengkapan");
    const table = await screen.findByRole(
      "table",
      { name: "Karyawan belum lengkap" },
      { timeout: 5000 },
    );
    await userEvent.click(within(table).getByText("Dewi Rekening"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    // Halaman laporan tetap di belakang panel (tidak berpindah halaman).
    expect(screen.getByRole("heading", { name: "Laporan", hidden: true })).toBeInTheDocument();
  });

  it("SP aktif: tanpa grant hanya jumlah; dengan grant daftar per orang", async () => {
    const view = renderWith(me("HR_ADMIN"), false);
    expect(
      await screen.findByText(/hanya untuk HR dengan izin surat peringatan/),
    ).toBeInTheDocument();
    view.unmount();
    renderWith(
      { ...me("HR_ADMIN"), grants: [{ permission: "employee.discipline.read", expiresAt: null }] },
      true,
    );
    expect(
      await screen.findByText("001/SP1/HRD-ACP/X/2026", undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it("Ekspor Excel memanggil endpoint ekspor tab aktif", async () => {
    const calls = mockFetch(me("SUPER_ADMIN", true));
    renderAt("/personal/laporan?laporan=kelengkapan");
    await screen.findByRole("table", { name: "Karyawan belum lengkap" }, { timeout: 5000 });
    await userEvent.click(screen.getByRole("button", { name: /Ekspor Excel/ }));
    await waitFor(() =>
      expect(calls.some((c) => c.path === "/reports/completeness/export")).toBe(true),
    );
  });

  it("MANAGER & karyawan: akses ditolak", async () => {
    mockFetch(me("MANAGER", false, "m1"));
    const view = renderAt("/personal/laporan");
    expect(await screen.findByRole("heading", { name: /Akses ditolak/ })).toBeInTheDocument();
    view.unmount();
    mockFetch(me("EMPLOYEE", false, "e1"));
    renderAt("/personal/laporan");
    expect(await screen.findByRole("heading", { name: /Akses ditolak/ })).toBeInTheDocument();
  });
});

describe.skipIf(!FEATURES.reports)("Laporan batch 2 (ARS-D21)", () => {
  it("masa kerja: kelompok + jubilee; bulan & tahun dikirim", async () => {
    const calls = mockFetch(me("HR_ADMIN"));
    renderAt("/personal/laporan?laporan=masa-kerja&bulan=10&tahun=2026");
    const table = await screen.findByRole("table", { name: "Daftar jubilee" }, { timeout: 5000 });
    expect(within(table).getByText("Eko Jubilee")).toBeInTheDocument();
    expect(within(table).getByText("5 tahun")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Grafik sebaran masa kerja" })).toBeInTheDocument();
    expect(
      calls.some(
        (c) =>
          c.path === "/reports/tenure" &&
          c.search.includes("month=10") &&
          c.search.includes("year=2026"),
      ),
    ).toBe(true);
  });

  it("demografi: agregat saja (tanpa daftar orang)", async () => {
    mockFetch(me("HR_ADMIN"));
    renderAt("/personal/laporan?laporan=demografi");
    expect(
      await screen.findByRole("list", { name: "Kota asal" }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Balikpapan")).toBeInTheDocument();
    expect(screen.queryByText("Agus Pratama")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("table")).toHaveLength(0);
  });

  it("mutasi & promosi: klik kartu Promosi menyaring daftar", async () => {
    mockFetch(me("HR_ADMIN"));
    renderAt("/personal/laporan?laporan=mutasi");
    const table = await screen.findByRole(
      "table",
      { name: "Daftar perpindahan" },
      { timeout: 5000 },
    );
    expect(within(table).getByText("Gita Pindah")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Promosi/ }));
    const filtered = screen.getByRole("table", { name: "Daftar perpindahan" });
    expect(within(filtered).getByText("Fajar Naik")).toBeInTheDocument();
    expect(within(filtered).queryByText("Gita Pindah")).not.toBeInTheDocument();
  });

  it("ulang tahun: tanggal-bulan saja; tanpa pilihan tahun", async () => {
    mockFetch(me("HR_ADMIN"));
    renderAt("/personal/laporan?laporan=ulang-tahun&bulan=10");
    const table = await screen.findByRole(
      "table",
      { name: "Daftar ulang tahun" },
      { timeout: 5000 },
    );
    expect(within(table).getByText(/16 Oktober/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Bulan" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Tahun" })).not.toBeInTheDocument();
  });

  it("aset: daftar belum kembali dari karyawan keluar", async () => {
    mockFetch(me("HR_ADMIN"));
    renderAt("/personal/laporan?laporan=aset");
    const table = await screen.findByRole(
      "table",
      { name: "Aset belum kembali" },
      { timeout: 5000 },
    );
    expect(within(table).getByText("Indra Keluar")).toBeInTheDocument();
    expect(within(table).getByText(/Laptop Dell/)).toBeInTheDocument();
  });

  it("pengajuan data: tanpa grant hanya angka; dengan grant daftar", async () => {
    mockFetch(me("HR_ADMIN"), { canList: false });
    const view = renderAt("/personal/laporan?laporan=pengajuan-data");
    expect(
      await screen.findByText(/hanya untuk pemeriksa pengajuan data/, undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("1,5 hari").length).toBeGreaterThan(0);
    view.unmount();
    mockFetch({
      ...me("HR_ADMIN"),
      grants: [{ permission: "employee.changes.review", expiresAt: null }],
    });
    renderAt("/personal/laporan?laporan=pengajuan-data");
    const table = await screen.findByRole(
      "table",
      { name: "Daftar pengajuan perubahan data" },
      { timeout: 5000 },
    );
    expect(within(table).getByText("Joko Ajukan")).toBeInTheDocument();
  });
});

function renderWith(role: Record<string, unknown>, canList: boolean) {
  mockFetch(role, { canList });
  return renderAt("/personal/laporan?laporan=sp");
}
