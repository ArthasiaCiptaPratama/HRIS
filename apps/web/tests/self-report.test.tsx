import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tmOn } from "@/app/feature-flags";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// TM-D29 (STAGING): Absen Mandiri — HR/SA mengizinkan crew mengisi jam sendiri dari HP.
// Hapus file ini saat fitur dicabut (docs/features/time-management/tm-d29-absen-mandiri.md).

type Call = { method: string; path: string; body: unknown };
const CO = "11111111-1111-4111-8111-111111111111";
const CREW_INTERN = "22222222-2222-4222-8222-222222222222";
const CREW_SITE = "33333333-3333-4333-8333-333333333333";

function mockFetch(role: "HR_ADMIN" | "EMPLOYEE" = "HR_ADMIN") {
  const calls: Call[] = [];
  const crews = [
    {
      crewId: CREW_INTERN,
      crewName: "The Intern's",
      activeMembers: 8,
      enabled: false,
      enabledAt: null,
    },
    {
      crewId: CREW_SITE,
      crewName: "Crew Site A",
      activeMembers: 20,
      enabled: true,
      enabledAt: "2026-11-18T01:00:00.000Z",
    },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const path = url.pathname.replace("/api/v1", "");
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path, body });
      const json = (status: number, payload: unknown) =>
        new Response(JSON.stringify(payload), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      const data = (payload: unknown) => json(200, { data: payload });
      if (path === "/me") return data(me(role));
      if (path === "/health") return data({ status: "ok", checks: { database: "ok" }, time: "x" });
      if (path === "/notifications")
        return json(200, { data: [], meta: { page: 1, pageSize: 5, total: 0, unreadCount: 0 } });
      if (path === "/master-data")
        return data({
          companies: [{ id: CO, code: "ACP", name: "PT Arthasia Cipta Pratama" }],
          departments: [],
          positions: [],
          employmentStatuses: [],
          grades: [],
          workLocations: [],
        });
      if (path === "/time/queue")
        return data({
          attendance: 0,
          leave: 0,
          corrections: 0,
          rosterChanges: 0,
          overtime: 0,
          overtimeClaims: 0,
          total: 0,
        });
      if (path === "/attendance/self-report/crews" && method === "GET") return data(crews);
      if (path === "/attendance/self-report/crews" && method === "PUT") {
        const crew = crews.find((c) => c.crewId === body.crewId);
        if (crew) crew.enabled = body.enabled;
        return data(crew);
      }
      return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
    }),
  );
  return calls;
}

beforeEach(() => {
  authState.session = { access_token: "tok", user: { id: "u1" } };
});
afterEach(() => vi.unstubAllGlobals());

describe.skipIf(!tmOn("tmSelfReport"))("Absen Mandiri (TM-D29, staging)", () => {
  it("daftar crew & status izin; Izinkan mengirim PUT crewId + enabled", async () => {
    const user = userEvent.setup();
    const calls = mockFetch();
    renderAt("/time/absen-mandiri");
    expect(await screen.findByRole("heading", { name: "Absen Mandiri" })).toBeInTheDocument();
    expect(await screen.findByText("The Intern's")).toBeInTheDocument();
    expect(screen.getByText("Crew Site A")).toBeInTheDocument();
    expect(screen.getByText("Diizinkan")).toBeInTheDocument();
    expect(screen.getByText("Fitur sementara (staging)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Izinkan" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
        crewId: CREW_INTERN,
        enabled: true,
      }),
    );
    // Daftar dimuat ulang → kedua crew kini berstatus Diizinkan, tombol berubah jadi Cabut izin.
    await waitFor(() => expect(screen.getAllByText("Diizinkan")).toHaveLength(2));
    expect(screen.getAllByRole("button", { name: "Cabut izin" })).toHaveLength(2);
  });
});
