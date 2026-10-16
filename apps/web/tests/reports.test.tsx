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

function renderWith(role: Record<string, unknown>, canList: boolean) {
  mockFetch(role, { canList });
  return renderAt("/personal/laporan?laporan=sp");
}
