import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));
// jsdom tanpa kanvas & ResizeObserver: grafik analitik diganti placeholder berlabel.
vi.mock("@/features/dashboard/pivot-chart", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/dashboard/pivot-chart")>()),
  EChart: ({ label }: { label: string }) => <div role="img" aria-label={label} />,
}));

// DSB-D1: widget "Analitik SDM & biaya" di dashboard SA/HR (GET /dashboard/analytics).

type Role = Omit<ReturnType<typeof me>, "grants"> & {
  grants: { permission: string; expiresAt: string | null }[];
};
type Call = { path: string; params: URLSearchParams };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const month = (m: string, extra: Record<string, unknown> = {}) => ({
  month: m,
  start: 3,
  joined: 0,
  left: 0,
  leftByReason: {},
  end: 3,
  turnoverPct: 0,
  ...extra,
});

function analytics(withCost: boolean) {
  const history = Array.from({ length: 11 }, (_, i) =>
    month(`2025-${String(i + 1).padStart(2, "0")}`),
  );
  return {
    month: "2026-10",
    scope: "all",
    showCost: withCost,
    headcount: {
      ...month("2026-10", {
        joined: 1,
        left: 1,
        leftByReason: { RESIGNATION: 1 },
        turnoverPct: 33.3,
      }),
      prevEnd: 3,
      endChangePct: 0,
      history: [...history, month("2026-10", { joined: 1, left: 1, turnoverPct: 33.3 })],
    },
    gender: [
      { gender: "MALE", count: 2, pct: 66.7 },
      { gender: "FEMALE", count: 1, pct: 33.3 },
    ],
    tenure: {
      avgYears: 2.1,
      buckets: [
        {
          bucket: "1-3",
          count: 3,
          pct: 100,
          avgYears: 2.1,
          avgGranted: 12,
          avgUsed: 4,
          avgRemaining: 8,
        },
      ],
    },
    leave: {
      year: 2026,
      onLeaveToday: 2,
      pendingRequests: 5,
      usedDays: 10,
      remainingDays: 26,
      debtDays: 1,
    },
    efficiency: {
      scheduledHours: 480,
      effectiveHours: 456,
      efficiencyPct: 95,
      overtimeHours: 12,
      overtimePct: 2.5,
      latePct: 4,
      alphaPct: 1,
      prevEfficiencyPct: 93,
      byLocation: [],
    },
    projection: Array.from({ length: 12 }, (_, i) => ({
      month: `2027-${String(i + 1).padStart(2, "0")}`,
      contractEnds: i === 0 ? 1 : 0,
      tierChanges: 0,
      retirements: null,
      costDelta: withCost ? 0 : null,
    })),
    laborCost: withCost
      ? {
          rows: [
            {
              category: "PERMANENT",
              headcount: 3,
              wage: 21_000_000,
              overtime: 500_000,
              total: 21_500_000,
              pct: 100,
            },
          ],
          total: 21_500_000,
          wageMissing: 1,
        }
      : null,
    liability: withCost
      ? {
          scenario: "PHK_NORMAL",
          severance: 30_000_000,
          upmk: 7_000_000,
          pkwt: 0,
          leaveComp: 2_000_000,
          total: 39_000_000,
          employees: 3,
          wageMissing: 0,
        }
      : null,
  };
}

function mockBackend(role: Role, opts: { withCost: boolean; layout?: unknown }) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const path = url.pathname.replace("/api/v1", "");
      calls.push({ path, params: url.searchParams });
      if (path === "/me") return json(200, { data: role });
      if (path === "/notifications")
        return json(200, { data: [], meta: { page: 1, pageSize: 5, total: 0, unreadCount: 0 } });
      if (path === "/dashboard")
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
      if (path === "/me/dashboard-layout")
        return json(200, { data: { layout: opts.layout ?? null, updatedAt: null } });
      if (path === "/dashboard/pivot")
        return json(200, {
          data: { rows: "category", cols: null, rowKeys: [], colKeys: [], cells: [], total: 0 },
        });
      if (path === "/dashboard/analytics") return json(200, { data: analytics(opts.withCost) });
      return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
    }),
  );
  return calls;
}

const analyticsCalls = (calls: Call[]) => calls.filter((c) => c.path === "/dashboard/analytics");

beforeEach(() => {
  authState.session = { access_token: "t", user: { id: "u" } };
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("Dashboard — Analitik SDM & biaya (DSB-D1)", () => {
  it("SA: statistik turnover & angka pergerakan karyawan bulan berjalan", async () => {
    const calls = mockBackend(me("SUPER_ADMIN"), { withCost: true });
    renderAt("/");
    expect(await screen.findByText("Turnover Bulan Ini", {}, { timeout: 15000 })).toBeVisible();
    // Kartu statistik + angka turnover di widget pergerakan (+ porsi perempuan 33,3%).
    expect((await screen.findAllByText("33,3%", {}, { timeout: 15000 })).length).toBeGreaterThan(1);
    expect(screen.getByText("1 keluar · 3 aktif akhir bulan")).toBeInTheDocument();
    expect(screen.getByText("Pergerakan Karyawan")).toBeInTheDocument();
    expect(screen.getByText("Aktif awal bulan")).toBeInTheDocument();
    expect(screen.getByText(/Mengundurkan diri 1/)).toBeInTheDocument();
    expect(screen.getByText("5 menunggu persetujuan")).toBeInTheDocument();
    // Widget rupiah tampil untuk SA.
    expect(screen.getByText("Biaya Tenaga Kerja")).toBeInTheDocument();
    expect(screen.getByText("1 karyawan tanpa upah grade (tidak dihitung).")).toBeInTheDocument();
    expect(screen.getByLabelText("Periode analitik")).toBeInTheDocument();

    const [first] = analyticsCalls(calls);
    expect(first?.params.get("month")).toMatch(/^\d{4}-\d{2}$/);
    expect(first?.params.get("scenario")).toBe("PHK_NORMAL");
  });

  it("SA: skenario kewajiban mengubah parameter scenario permintaan", async () => {
    const calls = mockBackend(me("SUPER_ADMIN"), { withCost: true });
    renderAt("/");
    const select = await screen.findByRole(
      "combobox",
      { name: "Skenario kompensasi" },
      { timeout: 15000 },
    );
    await userEvent.click(select);
    await userEvent.click(await screen.findByRole("option", { name: /Pensiun \(1,75×/ }));
    await waitFor(() =>
      expect(analyticsCalls(calls).some((c) => c.params.get("scenario") === "RETIREMENT")).toBe(
        true,
      ),
    );
  });

  it("HR tanpa grant Biaya: widget rupiah tidak dirender", async () => {
    mockBackend(me("HR_ADMIN"), { withCost: false });
    renderAt("/");
    expect(await screen.findByText("Aktif awal bulan", {}, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.getByText("Komposisi Jenis Kelamin")).toBeInTheDocument();
    expect(screen.queryByText("Biaya Tenaga Kerja")).not.toBeInTheDocument();
    expect(screen.queryByText("Kewajiban Kompensasi")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Skenario kompensasi" })).not.toBeInTheDocument();
  });

  it("susunan lama tanpa widget analitik tetap tampil (tanpa meminta analitik)", async () => {
    const calls = mockBackend(me("SUPER_ADMIN"), {
      withCost: true,
      layout: {
        version: 1,
        widgets: [
          { id: "stat-total", kind: "stat", size: "sm", metric: "total" },
          {
            id: "category",
            kind: "pivot",
            size: "md",
            title: "Distribusi Kategori",
            rows: "category",
            cols: null,
            chart: "donut",
            status: "active",
            filters: {},
            sort: "natural",
            limit: 12,
            horizontal: true,
          },
        ],
      },
    });
    renderAt("/");
    expect(await screen.findByText("Distribusi Kategori", {}, { timeout: 15000 })).toBeVisible();
    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.queryByLabelText("Periode analitik")).not.toBeInTheDocument();
    expect(analyticsCalls(calls)).toHaveLength(0);
  });
});
