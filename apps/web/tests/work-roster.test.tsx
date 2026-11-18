import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tmOn } from "@/app/feature-flags";
import { RosterWeek } from "@/features/time-management/components/roster-week";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// TM-D28: Pola Kerja (siklus kerja–libur), lokasi kerja (kantor / Homebase lokal), kelompok karyawan
// (office / lapangan lokal / lapangan non-lokal), Isi dengan pola kerja, & time off (TO).

type Call = { method: string; path: string; body: unknown };

const CO = "11111111-1111-4111-8111-111111111111";
const LOC = "22222222-2222-4222-8222-222222222222";
const R_LOCAL = "33333333-3333-4333-8333-333333333333";
const R_NONLOCAL = "44444444-4444-4444-8444-444444444444";
const R_OFFICE = "77777777-7777-4777-8777-777777777777";
const LOC_HQ = "88888888-8888-4888-8888-888888888888";
const HB1 = "99999999-9999-4999-8999-999999999991";
const HB2 = "99999999-9999-4999-8999-999999999992";
const E1 = "55555555-5555-4555-8555-555555555551";
const E2 = "55555555-5555-4555-8555-555555555552";
const E3 = "55555555-5555-4555-8555-555555555553";
const E4 = "55555555-5555-4555-8555-555555555554";

const roster = (id: string, extra: Record<string, unknown>) => ({
  id,
  companyId: CO,
  crewCount: 1,
  inUse: false,
  ...extra,
});
const rosters = [
  roster(R_NONLOCAL, {
    name: "Non-lokal 13/1 + time off",
    residency: "NON_LOCAL",
    workDays: 13,
    offDays: 1,
    cyclesBeforeTimeOff: 4,
    timeOffDays: 14,
    cycleLength: 70,
    summary: "13/1 × 4 + time off 14 hari (70 hari)",
    inUse: true,
  }),
  roster(R_LOCAL, {
    name: "Lokal 6/1",
    residency: "LOCAL",
    workDays: 6,
    offDays: 1,
    cyclesBeforeTimeOff: 0,
    timeOffDays: 0,
    cycleLength: 7,
    summary: "6/1",
  }),
  roster(R_OFFICE, {
    name: "Office 5/2",
    residency: "OFFICE",
    workDays: 5,
    offDays: 2,
    cyclesBeforeTimeOff: 0,
    timeOffDays: 0,
    cycleLength: 7,
    summary: "5/2",
  }),
];

const plan = (employeeId: string, fullName: string, crewName: string) => ({
  installed: false,
  cycleStartDate: "2099-01-01",
  crews: [{ name: crewName, existing: 0, added: 1 }],
  assignments: [
    {
      employeeId,
      fullName,
      employeeNumber: null,
      crewName,
      fromCrew: null,
      stays: false,
      needsApproval: false,
    },
  ],
  skipped: [],
  replacedDays: 0,
  lockedDays: 0,
  approvalCount: 0,
  newAlphaDays: 0,
  restWarnings: [],
});
const assignResult = {
  groups: [
    {
      residency: "OFFICE",
      roster: rosters[2],
      templateName: "Roster Office 5/2 · D",
      plan: plan(E4, "Dewi", "Roster Office 5/2 · D · Crew A (Kantor)"),
    },
    {
      residency: "LOCAL",
      roster: rosters[1],
      templateName: "Roster Lokal 6/1 · D",
      plan: plan(E1, "Ani", "Roster Lokal 6/1 · D · Crew A (Site)"),
    },
    {
      residency: "NON_LOCAL",
      roster: rosters[0],
      templateName: "Roster Non-lokal 13/1 + time off · D",
      plan: plan(E2, "Budi", "Roster Non-lokal 13/1 + time off · D · Crew A (Site)"),
    },
  ],
  unresolved: [
    { employeeId: E3, fullName: "Citra", reason: "Homebase belum diisi — pilih kelompoknya" },
  ],
};

const shift = {
  id: "s1",
  companyId: CO,
  code: "D",
  name: "Day",
  startMinute: 420,
  endMinute: 1140,
  crossesMidnight: false,
  checkInOpenMin: 60,
  lateToleranceMin: 0,
  earlyLeaveToleranceMin: 0,
  checkOutCloseMin: 240,
  color: "#2563eb",
  archived: false,
};
const grid = {
  month: "2099-01",
  companyId: CO,
  dates: ["2099-01-01", "2099-01-02"],
  holidays: [],
  shifts: [shift],
  employees: [
    { id: E1, fullName: "Ani", employeeNumber: "A1", crew: null },
    { id: E2, fullName: "Budi", employeeNumber: "B1", crew: null },
    { id: E3, fullName: "Citra", employeeNumber: "C1", crew: null },
    { id: E4, fullName: "Dewi", employeeNumber: "D1", crew: null },
  ],
  days: [
    { employeeId: E2, date: "2099-01-01", code: "D", source: "PATTERN" },
    { employeeId: E2, date: "2099-01-02", code: "TO", source: "PATTERN" },
  ],
  canEdit: true,
};
const residencies = [
  {
    employeeId: E1,
    fullName: "Ani",
    employeeNumber: "A1",
    homebase: { id: "hb1", name: "Samarinda" },
    workLocation: { id: LOC, name: "Site" },
    residency: "LOCAL",
    source: "HOMEBASE",
    note: null,
    override: null,
  },
  {
    employeeId: E3,
    fullName: "Citra",
    employeeNumber: "C1",
    homebase: null,
    workLocation: { id: LOC, name: "Site" },
    residency: null,
    source: "UNKNOWN",
    note: "Homebase belum diisi",
    override: null,
  },
  {
    employeeId: E4,
    fullName: "Dewi",
    employeeNumber: "D1",
    homebase: { id: HB2, name: "Balikpapan" },
    workLocation: { id: LOC_HQ, name: "Kantor Pusat" },
    residency: "OFFICE",
    source: "LOCATION",
    note: null,
    override: null,
  },
];
const localHomebases = {
  homebases: [
    { id: HB1, name: "Samarinda", city: "Samarinda", province: "Kalimantan Timur" },
    { id: HB2, name: "Balikpapan", city: "Balikpapan", province: "Kalimantan Timur" },
  ],
  locations: [
    { id: LOC_HQ, name: "Kantor Pusat", city: null, office: false, homebaseIds: [HB2] },
    { id: LOC, name: "Site", city: null, office: false, homebaseIds: [HB1] },
  ],
};

function mockFetch() {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const path = url.pathname.replace("/api/v1", "");
      const method = init?.method ?? "GET";
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const json = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      const data = (body: unknown) => json(200, { data: body });
      if (path === "/me") return data(me("HR_ADMIN"));
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
          workLocations: [{ id: LOC, name: "Site", city: null }],
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
      if (path === "/work-rosters" && method === "GET") return data(rosters);
      if (path === "/work-rosters" && method === "POST")
        return data({ ...rosters[1], id: "66666666-6666-4666-8666-666666666666" });
      if (path === "/work-rosters/defaults") return data(rosters);
      if (path === "/work-rosters/residencies" && method === "GET") return data(residencies);
      if (path === "/work-rosters/local-homebases" && method === "GET") return data(localHomebases);
      if (path === "/work-rosters/local-homebases" && method === "PUT")
        return data(calls.at(-1)?.body);
      if (path === "/work-rosters/residencies" && method === "PUT") return data({ updated: 2 });
      if (path === "/work-rosters/assign/preview" || path === "/work-rosters/assign")
        return data(assignResult);
      if (path === "/roster") return data(grid);
      if (path === "/crews") return data([]);
      if (path === "/shifts") return data([shift]);
      return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
    }),
  );
  return calls;
}

beforeEach(() => {
  authState.session = { access_token: "tok", user: { id: "u1" } };
});
afterEach(() => vi.unstubAllGlobals());

describe.skipIf(!tmOn("tmWorkRoster"))("Jadwal › Pola Kerja (TM-D28)", () => {
  it("tab Pola kerja: daftar, Buat pola kerja bawaan, dan tambah pola kerja dengan ringkasan langsung", async () => {
    const user = userEvent.setup();
    const calls = mockFetch();
    renderAt("/time/pola-kerja");
    expect(await screen.findByRole("heading", { name: "Pola Kerja" })).toBeInTheDocument();
    expect(await screen.findByText("Non-lokal 13/1 + time off")).toBeInTheDocument();
    expect(screen.getByText("Office 5/2")).toBeInTheDocument();
    expect(screen.getByText("Dipakai")).toBeInTheDocument();
    expect(
      screen.getByText(/13\/1 × 4 \+ time off 14 hari \(70 hari\) · 1 crew/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Buat pola kerja bawaan/ }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === "/work-rosters/defaults")?.body).toEqual({
        companyId: CO,
      }),
    );

    await user.click(screen.getByRole("button", { name: /Tambah pola kerja/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Tambah pola kerja" })).toBeInTheDocument();
    expect(within(dialog).getByTestId("roster-summary")).toHaveTextContent(
      "13/1 × 4 + time off 14 hari (70 hari)",
    );
    await user.type(within(dialog).getByLabelText("Nama"), "Lokal 6/1 baru");
    await user.click(within(dialog).getByRole("combobox", { name: "Untuk" }));
    expect(await screen.findByRole("option", { name: "Office" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Lapangan non-lokal" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Lapangan lokal" }));
    fireEvent.change(within(dialog).getByLabelText("Hari kerja"), { target: { value: "6" } });
    fireEvent.change(within(dialog).getByLabelText("Siklus sebelum time off"), {
      target: { value: "0" },
    });
    expect(within(dialog).getByTestId("roster-summary")).toHaveTextContent(/^6\/1$/);
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST" && c.path === "/work-rosters")?.body).toEqual({
        companyId: CO,
        name: "Lokal 6/1 baru",
        residency: "LOCAL",
        workDays: 6,
        offDays: 1,
        cyclesBeforeTimeOff: 0,
        timeOffDays: 0,
        crewCount: 1,
      }),
    );
  });

  it("pola kerja dipakai: siklus terkunci saat diubah", async () => {
    const user = userEvent.setup();
    mockFetch();
    renderAt("/time/pola-kerja");
    await user.click(await screen.findByRole("button", { name: "Ubah Non-lokal 13/1 + time off" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Pola kerja sudah dipakai; buat pola kerja baru untuk siklus lain."),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Hari kerja")).toBeDisabled();
    expect(within(dialog).getByLabelText("Nama")).toBeEnabled();
  });

  it("tab Lokasi kerja: tandai lokasi kantor mengirim office=true (Homebase lokal disembunyikan)", async () => {
    const user = userEvent.setup();
    const calls = mockFetch();
    renderAt("/time/pola-kerja?tab=homebase");
    expect(await screen.findByRole("tab", { name: "Lokasi kerja" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.click(await screen.findByRole("button", { name: "Atur lokasi kerja Kantor Pusat" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("checkbox", { name: /Balikpapan/ })).toBeChecked();
    await user.click(
      within(dialog).getByRole("checkbox", {
        name: "Lokasi kantor — karyawan di sini memakai pola kerja office",
      }),
    );
    expect(within(dialog).queryByRole("checkbox", { name: /Balikpapan/ })).not.toBeInTheDocument();
    expect(
      within(dialog).getByText("Homebase lokal tidak dipakai untuk lokasi kantor."),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.method === "PUT" && c.path === "/work-rosters/local-homebases")?.body,
      ).toEqual({ workLocationId: LOC_HQ, office: true, homebaseIds: [HB2] }),
    );
  });

  it("tab Kelompok karyawan: status & sumber, bulk Jadikan lapangan non-lokal / office", async () => {
    const user = userEvent.setup();
    const calls = mockFetch();
    renderAt("/time/pola-kerja?tab=residency");
    expect(await screen.findByText("Belum diisi")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Kelompok karyawan" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Belum diketahui")).toBeInTheDocument();
    expect(screen.getByText("Otomatis (Homebase)")).toBeInTheDocument();
    expect(screen.getByText("Lokasi kantor")).toBeInTheDocument();
    expect(screen.getByText("Homebase belum diisi")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Office")).toBeInTheDocument();
    expect(within(table).getByText("Lapangan lokal")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Pilih Ani" }));
    await user.click(screen.getByRole("checkbox", { name: "Pilih Citra" }));
    expect(screen.getByRole("button", { name: "Jadikan lapangan lokal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kembalikan otomatis" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Jadikan lapangan non-lokal" }));
    const puts = () =>
      calls.filter((c) => c.method === "PUT" && c.path === "/work-rosters/residencies");
    await waitFor(() =>
      expect(puts()[0]?.body).toEqual({
        companyId: CO,
        employeeIds: [E1, E3],
        residency: "NON_LOCAL",
      }),
    );

    // Pilihan dikosongkan setelah berhasil → pilih lagi lalu Jadikan office.
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Pilih Citra" })).not.toBeChecked(),
    );
    await user.click(screen.getByRole("checkbox", { name: "Pilih Citra" }));
    await user.click(screen.getByRole("button", { name: "Jadikan office" }));
    await waitFor(() =>
      expect(puts()[1]?.body).toEqual({ companyId: CO, employeeIds: [E3], residency: "OFFICE" }),
    );
  });

  it("Jadwal Bulanan › Isi dengan pola kerja: pratinjau tiga kelompok + tidak dipasang, lalu simpan", async () => {
    const user = userEvent.setup();
    const calls = mockFetch();
    renderAt("/time/roster");
    await user.click(await screen.findByRole("button", { name: /Isi dengan pola kerja/ }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Isi jadwal dengan pola kerja" }),
    ).toBeInTheDocument();
    await user.click(await within(dialog).findByRole("combobox", { name: "Lokasi kerja" }));
    await user.click(await screen.findByRole("option", { name: "Site" }));
    await user.click(within(dialog).getByRole("combobox", { name: "Shift hari kerja" }));
    await user.click(await screen.findByRole("option", { name: /^D · Day/ }));
    // Bawaan: pola kerja pertama tiap kelompok.
    expect(within(dialog).getByRole("combobox", { name: "Pola kerja office" })).toHaveTextContent(
      "Office 5/2",
    );
    expect(
      within(dialog).getByRole("combobox", { name: "Pola kerja lapangan lokal" }),
    ).toHaveTextContent("Lokal 6/1");
    expect(
      within(dialog).getByRole("combobox", { name: "Pola kerja lapangan non-lokal" }),
    ).toHaveTextContent("Non-lokal 13/1 + time off");
    await user.click(within(dialog).getByRole("button", { name: "Pilih semua" }));
    expect(within(dialog).getByRole("button", { name: "Simpan" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Pratinjau" }));

    expect(await within(dialog).findByText("Office · 5/2")).toBeInTheDocument();
    expect(within(dialog).getByText("Lapangan lokal · 6/1")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Lapangan non-lokal · 13/1 × 4 + time off 14 hari (70 hari)"),
    ).toBeInTheDocument();
    expect(
      within(within(dialog).getByRole("region", { name: "Kelompok Office" })).getByText("Dewi"),
    ).toBeInTheDocument();
    const unresolved = within(dialog).getByRole("region", { name: "Tidak dipasang" });
    expect(within(unresolved).getByText("Citra")).toBeInTheDocument();
    expect(
      within(unresolved).getByText("Homebase belum diisi — pilih kelompoknya"),
    ).toBeInTheDocument();
    expect(within(unresolved).getByRole("link", { name: /Kelompok karyawan/ })).toHaveAttribute(
      "href",
      "/time/pola-kerja?tab=residency",
    );

    const body = {
      companyId: CO,
      workLocationId: LOC,
      employeeIds: [E1, E2, E3, E4],
      shiftCode: "D",
      officeRosterId: R_OFFICE,
      localRosterId: R_LOCAL,
      nonLocalRosterId: R_NONLOCAL,
    };
    expect(calls.find((c) => c.path === "/work-rosters/assign/preview")?.body).toMatchObject(body);
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === "/work-rosters/assign")?.body).toMatchObject({
        ...body,
        effectiveDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("hari time off (TO) tampil sebagai Time off di grid Jadwal Bulanan", async () => {
    mockFetch();
    renderAt("/time/roster");
    const table = await screen.findByRole("table");
    const cell = within(table)
      .getAllByText("TO")
      .find((el) => el.closest("td")) as HTMLElement;
    expect(cell.closest("td")?.getAttribute("title")).toContain("Time off (bukan cuti)");
    expect(screen.getByText(/Time off \(bukan cuti\)$/)).toBeInTheDocument();
  });
});

describe("RosterWeek: time off (TM-D28)", () => {
  it("kode TO tampil sebagai Time off, bukan shift tak dikenal", () => {
    render(
      <RosterWeek
        today="2099-01-01"
        roster={[
          { date: "2099-01-01", code: "D", shift: { ...shift } },
          { date: "2099-01-02", code: "TO", shift: null },
          { date: "2099-01-03", code: "OFF", shift: null },
        ]}
      />,
    );
    const item = screen
      .getAllByTitle("Time off (bukan cuti)")
      .find((el) => el.tagName === "LI") as HTMLElement;
    expect(within(item).getByText("TO")).toBeInTheDocument();
    expect(screen.getByText("Time off")).toBeInTheDocument();
    expect(screen.getByText("Libur")).toBeInTheDocument();
  });
});
