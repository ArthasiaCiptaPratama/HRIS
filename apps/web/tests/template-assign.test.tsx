import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TemplateAssignDialog } from "@/features/time-management/components/template-assign-dialog";
import { authState } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// TM-D20 Fase 2: Roster Bulanan › Isi dengan template — pratinjau pembagian crew lalu terapkan.
const template = {
  id: "t1",
  companyId: "co",
  name: "Rotasi D-N",
  description: null,
  steps: ["D", "D", "N", "N", "OFF", "OFF"],
  crewCount: 2,
  crewOffsetDays: 2,
  startOnMonday: false,
  cycleLength: 6,
  workDays: 4,
  installations: [],
  updatedAt: "2026-10-27T00:00:00.000Z",
};
const plan = {
  installed: false,
  cycleStartDate: "2099-01-01",
  crews: [
    { name: "Rotasi D-N · Crew A (Site)", existing: 0, added: 1 },
    { name: "Rotasi D-N · Crew B (Site)", existing: 0, added: 1 },
  ],
  assignments: [
    {
      employeeId: "e1",
      fullName: "Ani",
      employeeNumber: "A1",
      crewName: "Rotasi D-N · Crew A (Site)",
      fromCrew: null,
      stays: false,
    },
    {
      employeeId: "e2",
      fullName: "Budi",
      employeeNumber: "B1",
      crewName: "Rotasi D-N · Crew B (Site)",
      fromCrew: "Crew Lama",
      stays: false,
    },
  ],
  skipped: [],
  manualDays: 3,
  restWarnings: [],
};
const grid = {
  month: "2099-01",
  companyId: "co",
  dates: ["2099-01-01", "2099-01-02"],
  holidays: [],
  shifts: [],
  employees: [
    { id: "e1", fullName: "Ani", employeeNumber: "A1", crew: null },
    { id: "e2", fullName: "Budi", employeeNumber: "B1", crew: "Crew Lama" },
  ],
  days: [],
  canEdit: true,
};

beforeEach(() => {
  authState.session = { access_token: "tok", user: { id: "u1" } };
});
afterEach(() => vi.unstubAllGlobals());

describe("Isi roster dengan template", () => {
  it("pilih template, lokasi, karyawan → pratinjau crew → terapkan mengirim body yang sama", async () => {
    const user = userEvent.setup();
    const calls: { path: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname.replace("/api/v1", "");
        const json = (data: unknown) =>
          new Response(JSON.stringify({ data }), {
            headers: { "Content-Type": "application/json" },
          });
        if (init?.method === "POST") {
          calls.push({ path, body: JSON.parse(String(init.body)) });
          return json(plan);
        }
        if (path === "/roster-custom-templates") return json([template]);
        if (path === "/master-data")
          return json({
            companies: [],
            departments: [],
            positions: [],
            employmentStatuses: [],
            grades: [],
            workLocations: [{ id: "loc1", name: "Site", city: null }],
          });
        return json(null);
      }),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <TemplateAssignDialog companyId="co" grid={grid} onClose={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("combobox", { name: "Template" }));
    await user.click(await screen.findByRole("option", { name: "Rotasi D-N" }));
    await user.click(screen.getByRole("combobox", { name: "Lokasi kerja" }));
    await user.click(await screen.findByRole("option", { name: "Site" }));
    await user.click(screen.getByRole("button", { name: "Pilih semua" }));
    expect(await screen.findByText("Pindah dari Crew Lama")).toBeInTheDocument();
    expect(
      screen.getByText(/Timpa isian manual \/ import mulai tanggal ini \(3 sel\)/),
    ).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Crew A (Site)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Terapkan template" }));
    await waitFor(() =>
      expect(calls.some((c) => c.path === "/roster-custom-templates/t1/assign")).toBe(true),
    );
    const applied = calls.find((c) => c.path === "/roster-custom-templates/t1/assign");
    expect(applied?.body).toMatchObject({
      workLocationId: "loc1",
      employeeIds: ["e1", "e2"],
      replaceManual: false,
    });
  });
});
