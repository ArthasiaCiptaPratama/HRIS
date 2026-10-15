import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/app/feature-flags";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// TM-D1 — Time Management › Lokasi Absen: lokasi absen per karyawan (SA, HR PT).

type Role = ReturnType<typeof me>;
type Call = { method: string; path: string; search: string; body: unknown };

const view = {
  date: "2026-10-15",
  locations: [
    { id: "loc-jkt", name: "Kantor Jakarta", city: "Jakarta", radiusM: 200 },
    { id: "loc-mrw", name: "Site Morowali", city: "Morowali", radiusM: 800 },
  ],
  employees: [
    {
      employeeId: "e1",
      fullName: "Agus Pratama",
      employeeNumber: "ACP-0001",
      mode: "DEFAULT",
      customLocation: null,
      effective: {
        source: "CREW",
        location: { id: "loc-mrw", name: "Site Morowali", hasGeofence: true },
        crewName: "Crew A",
      },
      updatedAt: null,
    },
    {
      employeeId: "e2",
      fullName: "Budi Santoso",
      employeeNumber: "ACP-0002",
      mode: "ANYWHERE",
      customLocation: null,
      effective: { source: "ANYWHERE", location: null, crewName: null },
      updatedAt: "2026-10-14T01:00:00.000Z",
    },
    {
      employeeId: "e3",
      fullName: "Citra Lestari",
      employeeNumber: "ACP-0003",
      mode: "DEFAULT",
      customLocation: null,
      effective: { source: "NONE", location: null, crewName: null },
      updatedAt: null,
    },
  ],
};

function mockFetch(role: Role) {
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
      if (path === "/attendance-locations" && method === "GET") return json(200, { data: view });
      if (path === "/attendance-locations" && method === "PUT")
        return json(200, { data: { updated: 2 } });
      return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
    }),
  );
  return calls;
}

beforeEach(() => {
  authState.session = { access_token: "tok", user: { id: "u1" } };
});
afterEach(() => vi.unstubAllGlobals());

describe.skipIf(!FEATURES.timeManagement)("Time Management › Lokasi Absen (TM-D1)", () => {
  it("menampilkan site berlaku hari ini beserta asalnya; peringatan bila belum ada lokasi", async () => {
    const calls = mockFetch(me("HR_ADMIN"));
    renderAt("/time/lokasi-absen");
    expect(await screen.findByRole("heading", { name: "Lokasi Absen" })).toBeInTheDocument();
    const agus = (await screen.findByText("Agus Pratama")).closest("tr") as HTMLElement;
    expect(within(agus).getByText("Lokasi crew · Crew A")).toBeInTheDocument();
    expect(within(agus).getByText("Site Morowali")).toBeInTheDocument();
    const budi = screen.getByText("Budi Santoso").closest("tr") as HTMLElement;
    expect(within(budi).getAllByText("Bebas lokasi").length).toBeGreaterThan(0);
    const citra = screen.getByText("Citra Lestari").closest("tr") as HTMLElement;
    expect(within(citra).getByText(/selalu berlabel di luar radius/)).toBeInTheDocument();
    expect(
      calls.some(
        (c) => c.path === "/attendance-locations" && c.search.includes("companyId=co-acp"),
      ),
    ).toBe(true);
  });

  it("pilih banyak karyawan → atur lokasi khusus; lokasi wajib dipilih dulu", async () => {
    const user = userEvent.setup();
    const calls = mockFetch(me("SUPER_ADMIN"));
    renderAt("/time/lokasi-absen");
    await user.click(await screen.findByRole("checkbox", { name: "Pilih Agus Pratama" }));
    await user.click(screen.getByRole("checkbox", { name: "Pilih Citra Lestari" }));
    expect(screen.getByText("2 karyawan dipilih")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Atur lokasi absen/ }));

    const dialog = await screen.findByRole("dialog");
    const save = within(dialog).getByRole("button", { name: "Simpan" });
    expect(save).toBeDisabled();
    await user.click(within(dialog).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /Kantor Jakarta/ }));
    await user.click(save);

    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
        employeeIds: ["e1", "e3"],
        mode: "LOCATION",
        workLocationId: "loc-jkt",
      }),
    );
  });

  it("satu karyawan → bebas lokasi (tanpa lokasi dikirim)", async () => {
    const user = userEvent.setup();
    const calls = mockFetch(me("SUPER_ADMIN"));
    renderAt("/time/lokasi-absen");
    const row = (await screen.findByText("Agus Pratama")).closest("tr") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Atur" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("radio", { name: /Bebas lokasi/ }));
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")?.body).toEqual({
        employeeIds: ["e1"],
        mode: "ANYWHERE",
      }),
    );
  });

  it("MANAGER & karyawan tidak bisa membuka halaman", async () => {
    mockFetch(me("MANAGER", false, "emp-mgr"));
    renderAt("/time/lokasi-absen");
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Lokasi Absen" })).not.toBeInTheDocument(),
    );
    const calls = mockFetch(me("EMPLOYEE", false, "emp-1"));
    renderAt("/time/lokasi-absen");
    await waitFor(() => expect(calls.some((c) => c.path === "/attendance-locations")).toBe(false));
  });
});
