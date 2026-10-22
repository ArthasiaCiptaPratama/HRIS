import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/app/feature-flags";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// TM-D6 lembur & upah grade, TM-D7 tombol istirahat di HP.

type Role = Omit<ReturnType<typeof me>, "grants"> & {
  grants: { permission: string; expiresAt: string | null }[];
};
type Call = { method: string; path: string; search: string; body: unknown };

const approval = (id: string) => ({
  id,
  subjectType: "OVERTIME",
  subjectId: id,
  status: "PENDING",
  createdAt: "2026-10-05T12:00:00.000Z",
  decidedAt: null,
  steps: [
    {
      kind: "MANAGER",
      decision: "PENDING",
      decidedAt: null,
      note: null,
      isOverride: false,
      myRight: "regular",
    },
    {
      kind: "HR",
      decision: "PENDING",
      decidedAt: null,
      note: null,
      isOverride: false,
      myRight: null,
    },
  ],
  canDecide: true,
  canOverride: false,
});
const overtime = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  dayId: `day-${id}`,
  employee: { id: `emp-${id}`, fullName: name, employeeNumber: `ACP-${id}` },
  workDate: "2026-10-05",
  shiftCode: "O",
  checkIn: "2026-10-05T00:00:00.000Z",
  checkOut: "2026-10-05T10:50:00.000Z",
  dayType: "WORKDAY",
  formula: "FIVE_DAY",
  rawMin: 110,
  earlyMin: 0,
  debtMin: 0,
  regularMin: 0,
  proposedMin: 120,
  equivalentHours: 3.5,
  flags: [],
  status: "PENDING",
  approval: approval(`apr-${id}`),
  pay: null,
  ...extra,
});

function mockFetch(role: Role, rows: unknown[], summary?: unknown) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const path = url.pathname.replace("/api/v1", "");
      const method = init?.method ?? "GET";
      calls.push({
        method,
        path,
        search: url.search,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
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
      if (path === "/master-data")
        return json(200, {
          data: {
            companies: [{ id: "co-acp", code: "ACP", name: "PT Arthasia Cipta Pratama" }],
            departments: [],
            positions: [],
            employmentStatuses: [],
            grades: [],
            workLocations: [],
          },
        });
      if (path === "/overtime") return json(200, { data: rows });
      if (path === "/overtime/summary") return json(200, { data: summary });
      if (path.startsWith("/approvals/"))
        return json(200, { data: { requestId: "x", status: "PENDING" } });
      if (path === "/grade-wages")
        return json(200, {
          data: [
            {
              gradeId: "g1",
              gradeName: "Level 1",
              basePay: 5_700_000,
              fixedAllowance: 1_500_000,
              hourly: 41_618,
              updatedAt: null,
            },
          ],
        });
      if (path.startsWith("/grade-wages/"))
        return json(200, {
          data: {
            gradeId: "g1",
            gradeName: "Level 1",
            basePay: 6_000_000,
            fixedAllowance: 1_500_000,
            hourly: 43_353,
            updatedAt: null,
          },
        });
      return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
    }),
  );
  return calls;
}

const withCost = (role: Role) => ({
  ...role,
  grants: [{ permission: "labor.cost.read", expiresAt: null }],
});

beforeEach(() => {
  authState.session = { access_token: "tok", user: { id: "u1" } };
});
afterEach(() => vi.unstubAllGlobals());

describe.skipIf(!FEATURES.timeManagement)("Time Management › Lembur (TM-D6)", () => {
  it("HR ber-grant Biaya melihat rupiah; lembur lewat batas wajib alasan sebelum disetujui", async () => {
    const user = userEvent.setup();
    const calls = mockFetch(withCost(me("HR_ADMIN")), [
      overtime("1", "Agus Pratama", { pay: 145_665 }),
      overtime("2", "Budi Santoso", {
        rawMin: 270,
        proposedMin: 270,
        equivalentHours: 8.5,
        flags: ["OVER_DAY_LIMIT"],
        pay: 353_757,
      }),
    ]);
    renderAt("/time/lembur");
    expect(await screen.findByRole("heading", { name: "Lembur" })).toBeInTheDocument();
    const agus = (await screen.findByText("Agus Pratama")).closest("tr") as HTMLElement;
    expect(within(agus).getByText("2 jam")).toBeInTheDocument();
    expect(within(agus).getByText(/145\.665/)).toBeInTheDocument();
    const budi = screen.getByText("Budi Santoso").closest("tr") as HTMLElement;
    expect(within(budi).getByText("Lebih dari 4 jam sehari")).toBeInTheDocument();
    // Lewat batas: tanpa tombol setuju cepat.
    expect(within(budi).queryByRole("button", { name: "Setujui" })).not.toBeInTheDocument();

    await user.click(within(budi).getByRole("button", { name: "Detail" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /Setujui/ }));
    expect(calls.some((c) => c.path.startsWith("/approvals/"))).toBe(false);
    await user.type(within(dialog).getByLabelText("Catatan keputusan"), "Kapal tertunda");
    await user.click(within(dialog).getByRole("button", { name: /Setujui/ }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === "/approvals/apr-2/decision")?.body).toEqual({
        decision: "APPROVED",
        note: "Kapal tertunda",
      }),
    );
  });

  it("atasan tidak melihat kolom rupiah; rekap menampilkan total rupiah tim", async () => {
    const user = userEvent.setup();
    mockFetch(me("MANAGER", false, "emp-mgr"), [overtime("1", "Agus Pratama")], {
      month: "2026-10",
      rows: [
        {
          employee: { id: "emp-1", fullName: "Agus Pratama", employeeNumber: "ACP-1" },
          regularMin: 0,
          regularEquivalentHours: 0,
          approvedMin: 120,
          approvedEquivalentHours: 3.5,
          pendingMin: 0,
          totalEquivalentHours: 3.5,
          pay: null,
          wageMissing: false,
        },
      ],
      totals: {
        regularMin: 0,
        approvedMin: 120,
        pendingMin: 0,
        totalEquivalentHours: 3.5,
        pay: 145_665,
      },
      showPay: false,
    });
    renderAt("/time/lembur");
    await screen.findByText("Agus Pratama");
    expect(screen.queryByRole("columnheader", { name: "Rupiah" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Rekap bulanan" }));
    expect(await screen.findByText("Total rupiah tim")).toBeInTheDocument();
    expect(screen.getByText(/145\.665/)).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Rupiah" })).not.toBeInTheDocument();
  });
});

describe.skipIf(!FEATURES.timeManagement)("Time Management › Upah Grade (TM-D6)", () => {
  it("SA mengubah upah grade; upah sejam = (pokok + tunjangan) ÷ 173", async () => {
    const user = userEvent.setup();
    const calls = mockFetch(me("SUPER_ADMIN"), []);
    renderAt("/time/upah-grade");
    expect(await screen.findByText("Level 1")).toBeInTheDocument();
    expect(screen.getByText(/41\.618/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ubah Level 1" }));
    const dialog = await screen.findByRole("dialog");
    const base = within(dialog).getByLabelText("Upah pokok / bulan");
    await user.clear(base);
    await user.type(base, "6000000");
    expect(within(dialog).getByText(/43\.353/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
        basePay: 6_000_000,
        fixedAllowance: 1_500_000,
      }),
    );
  });

  it("HR tanpa grant Biaya tidak bisa membuka halaman", async () => {
    const calls = mockFetch(me("HR_ADMIN"), []);
    renderAt("/time/upah-grade");
    await waitFor(() => expect(calls.some((c) => c.path === "/me")).toBe(true));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Upah Grade" })).not.toBeInTheDocument(),
    );
    expect(calls.some((c) => c.path === "/grade-wages")).toBe(false);
  });
});

describe.skipIf(!FEATURES.timeManagement)("Absen HP — istirahat (TM-D7)", () => {
  const shift = {
    id: "s1",
    companyId: "co-acp",
    code: "JTP",
    name: "JT Pagi",
    startMinute: 420,
    endMinute: 900,
    crossesMidnight: false,
    checkInOpenMin: 60,
    lateToleranceMin: 15,
    earlyLeaveToleranceMin: 15,
    checkOutCloseMin: 240,
    color: null,
    archived: false,
  };
  const punch = (kind: string, at: string) => ({
    id: `p-${kind}`,
    kind,
    at,
    latitude: -3.8,
    longitude: 115.2,
    accuracyM: 10,
    distanceM: 5,
    insideGeofence: true,
    labels: [],
    reason: null,
    selfieUrl: null,
    selfiePurged: false,
    status: kind.startsWith("BREAK") ? "APPROVED" : "PENDING",
    source: "DEVICE",
    approval: null,
    canCancel: false,
  });
  const today = (breakState: string, punches: unknown[]) => {
    const day = {
      id: "d1",
      employee: { id: "emp-1", fullName: "Rina", employeeNumber: "ACP-1" },
      workDate: "2026-10-21",
      shiftCode: "JTP",
      scheduledStart: "2026-10-20T23:00:00.000Z",
      scheduledEnd: "2026-10-21T07:00:00.000Z",
      workLocation: { id: "loc", name: "Pelabuhan" },
      status: "OPEN",
      labels: [],
      punches,
      approval: null,
    };
    return {
      serverTime: "2026-10-21T03:00:00.000Z",
      timezone: "Asia/Makassar",
      gpsAccuracyMaxM: 100,
      employee: day.employee,
      roster: [{ date: "2026-10-21", code: "JTP", shift }],
      location: { id: "loc", name: "Pelabuhan", latitude: -3.8, longitude: 115.2, radiusM: 500 },
      anywhere: false,
      locationSource: "EMPLOYEE",
      openDay: day,
      recent: [day],
      next: "OUT",
      breakState,
    };
  };
  const mockToday = (body: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(String(input)).pathname.replace("/api/v1", "");
        const json = (status: number, data: unknown) =>
          new Response(JSON.stringify(data), {
            status,
            headers: { "Content-Type": "application/json" },
          });
        if (path === "/me") return json(200, { data: me("EMPLOYEE", false, "emp-1") });
        if (path === "/attendance/me/today") return json(200, { data: body });
        if (path === "/health")
          return json(200, { data: { status: "ok", checks: { database: "ok" }, time: "x" } });
        return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
      }),
    );

  it("lokasi wajib istirahat: Mulai → sedang istirahat → selesai menampilkan jam istirahat", async () => {
    mockToday(today("NONE", [punch("IN", "2026-10-20T23:00:00.000Z")]));
    const first = renderAt("/absen");
    expect(await screen.findByRole("button", { name: /Mulai istirahat/ })).toBeInTheDocument();
    first.unmount();

    mockToday(
      today("ON_BREAK", [
        punch("IN", "2026-10-20T23:00:00.000Z"),
        punch("BREAK_START", "2026-10-21T03:00:00.000Z"),
      ]),
    );
    const second = renderAt("/absen");
    expect(
      await screen.findByRole("button", { name: /Selesai istirahat \(mulai 11\.00\)/ }),
    ).toBeInTheDocument();
    second.unmount();

    mockToday(
      today("DONE", [
        punch("IN", "2026-10-20T23:00:00.000Z"),
        punch("BREAK_START", "2026-10-21T03:00:00.000Z"),
        punch("BREAK_END", "2026-10-21T04:00:00.000Z"),
      ]),
    );
    renderAt("/absen");
    expect(await screen.findByText(/Istirahat 11\.00–12\.00/)).toBeInTheDocument();
  });

  it("lokasi tanpa kewajiban: tidak ada tombol istirahat", async () => {
    mockToday(today("NOT_REQUIRED", [punch("IN", "2026-10-20T23:00:00.000Z")]));
    renderAt("/absen");
    await screen.findByText("Rina");
    expect(screen.queryByRole("button", { name: /istirahat/i })).not.toBeInTheDocument();
  });
});
