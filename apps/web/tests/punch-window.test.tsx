import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/app/feature-flags";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// TM-D12: hari OFF → Lembur hari libur; Clock Out sebelum dibuka = Pulang darurat; jendela istirahat.

const shift = {
  id: "s1",
  companyId: "co-acp",
  code: "D",
  name: "Pagi",
  startMinute: 420,
  endMinute: 900,
  crossesMidnight: false,
  checkInOpenMin: 60,
  lateToleranceMin: 15,
  earlyLeaveToleranceMin: 15,
  checkOutCloseMin: 240,
  breakStartMinute: 720,
  breakEndMinute: 780,
  color: null,
  archived: false,
};
const employee = { id: "emp-1", fullName: "Rina", employeeNumber: "ACP-1" };
const inPunch = {
  id: "p-in",
  kind: "IN",
  at: "2026-10-20T23:00:00.000Z",
  latitude: -3.8,
  longitude: 115.2,
  accuracyM: 10,
  distanceM: 5,
  insideGeofence: true,
  labels: [],
  reason: null,
  selfieUrl: null,
  selfiePurged: false,
  status: "PENDING",
  source: "DEVICE",
  approval: null,
  canCancel: false,
};
const openDay = {
  id: "d1",
  employee,
  workDate: "2026-10-21",
  shiftCode: "D",
  scheduledStart: "2026-10-20T23:00:00.000Z",
  scheduledEnd: "2026-10-21T07:00:00.000Z",
  workLocation: { id: "loc", name: "Pelabuhan" },
  status: "OPEN",
  labels: [],
  punches: [inPunch],
  approval: null,
};
// Jam server 11.00 WITA.
const base = {
  serverTime: "2026-10-21T03:00:00.000Z",
  timezone: "Asia/Makassar",
  gpsAccuracyMaxM: 100,
  employee,
  location: { id: "loc", name: "Pelabuhan", latitude: -3.8, longitude: 115.2, radiusM: 500 },
  anywhere: false,
  locationSource: "EMPLOYEE",
};
const working = (extra: Record<string, unknown>) => ({
  ...base,
  roster: [{ date: "2026-10-21", code: "D", shift }],
  openDay,
  recent: [openDay],
  next: "OUT",
  breakState: "NONE",
  offDay: false,
  checkOutOpensAt: "2026-10-21T06:30:00.000Z",
  breakOpensAt: "2026-10-21T04:00:00.000Z",
  breakClosesAt: "2026-10-21T05:00:00.000Z",
  ...extra,
});

function mockToday(body: unknown) {
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
}

beforeEach(() => {
  authState.session = { access_token: "tok", user: { id: "u1" } };
});
afterEach(() => vi.unstubAllGlobals());

describe.skipIf(!FEATURES.timeManagement)("batas waktu absen di HP (TM-D12)", () => {
  it("hari OFF: diminta istirahat; Datang diganti Lembur hari libur", async () => {
    mockToday({
      ...base,
      roster: [{ date: "2026-10-21", code: "OFF", shift: null }],
      openDay: null,
      recent: [],
      next: "IN",
      breakState: "NOT_REQUIRED",
      offDay: true,
      checkOutOpensAt: null,
      breakOpensAt: null,
      breakClosesAt: null,
    });
    renderAt("/absen");
    expect(await screen.findByText(/Silakan beristirahat/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Lembur hari libur/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Datang/ })).not.toBeInTheDocument();
  });

  it("sebelum Clock Out dibuka: tombol Pulang darurat + jam buka", async () => {
    mockToday(working({}));
    renderAt("/absen");
    expect(await screen.findByRole("button", { name: /Pulang darurat/ })).toBeInTheDocument();
    expect(screen.getByText(/Clock Out dibuka 14\.30/)).toBeInTheDocument();
  });

  it("sesudah Clock Out dibuka: tombol Pulang biasa", async () => {
    mockToday(working({ checkOutOpensAt: "2026-10-21T02:30:00.000Z" }));
    renderAt("/absen");
    await screen.findByText("Rina");
    expect(screen.queryByRole("button", { name: /Pulang darurat/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pulang/ })).toBeInTheDocument();
  });

  it("sebelum jendela istirahat: Mulai istirahat terkunci dengan jam buka", async () => {
    mockToday(working({}));
    renderAt("/absen");
    expect(await screen.findByText(/Istirahat dibuka 12\.00/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mulai istirahat/ })).not.toBeInTheDocument();
  });

  it("di dalam jendela istirahat: tombol Mulai istirahat aktif", async () => {
    mockToday(
      working({
        breakOpensAt: "2026-10-21T02:30:00.000Z",
        breakClosesAt: "2026-10-21T03:30:00.000Z",
      }),
    );
    renderAt("/absen");
    expect(await screen.findByRole("button", { name: /Mulai istirahat/ })).toBeEnabled();
  });

  it("jendela istirahat lewat: terkunci", async () => {
    mockToday(
      working({
        breakOpensAt: "2026-10-21T01:00:00.000Z",
        breakClosesAt: "2026-10-21T02:00:00.000Z",
      }),
    );
    renderAt("/absen");
    expect(await screen.findByText(/Jam istirahat 09\.00–10\.00 sudah lewat/)).toBeInTheDocument();
  });
});
