import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authState, me, mockApi, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// ONB-D2: akun Karyawan/Manager wajib tertaut ke data karyawan — badge & aksi "Tautkan" di daftar Akun,
// dialog Undang akun memilih karyawan (role Karyawan → antrean Undang Karyawan Terdaftar).
const health = {
  data: { status: "ok", checks: { database: "ok" }, time: new Date().toISOString() },
};
const meta = (total: number) => ({ page: 1, pageSize: 20, total });
const unlinked = {
  id: "acc-seifal",
  email: "seifal@example.test",
  role: "EMPLOYEE",
  isActive: true,
  isPrimarySuperAdmin: false,
  employeeId: null,
  companyIds: [],
  lastLoginAt: "2026-11-15T01:00:00.000Z",
  createdAt: "2026-11-10T00:00:00.000Z",
  needsEmployeeLink: true,
};
const employeeRow = {
  id: "emp-1",
  employeeNumber: "2602.ACP.033",
  fullName: "Seifal Uji",
  workEmail: "seifal.kantor@example.test",
  phoneNumber: null,
  gender: null,
  joinDate: "2026-02-01",
  endDate: null,
  isActive: true,
  exitReason: null,
  employmentStatus: { id: "st", name: "Tetap", category: null },
  company: { id: "co", name: "PT Uji", code: "ACP" },
  position: { id: "pos", name: "Operator" },
  department: null,
  workLocation: null,
  grade: null,
  manager: null,
  photoUrl: null,
};

function setup() {
  return mockApi({
    "/me": [200, { data: me("SUPER_ADMIN", true) }],
    "/health": [200, health],
    "/notifications": [200, { data: [], meta: { ...meta(0), unreadCount: 0 } }],
    "/accounts": [200, { data: [unlinked], meta: meta(1) }],
    "/accounts/acc-seifal/link-suggestions": [
      200,
      {
        data: [
          {
            employeeId: "emp-1",
            fullName: "Seifal Uji",
            employeeNumber: "2602.ACP.033",
            companyId: "co",
            matchedBy: "PERSONAL_EMAIL",
          },
        ],
      },
    ],
    "/accounts/acc-seifal/employee": [
      200,
      { data: { ...unlinked, employeeId: "emp-1", needsEmployeeLink: false } },
    ],
    "/employees": [200, { data: [employeeRow], meta: meta(1) }],
    "/accounts/invite": [202, { data: { employeeId: "emp-1", queued: true } }],
  });
}

type FetchCall = [input: RequestInfo | URL, init?: RequestInit];
const callsTo = (fetch: ReturnType<typeof setup>, path: string, method: string) =>
  (fetch.mock.calls as unknown as FetchCall[]).filter(
    ([url, init]) => String(url).includes(`/api/v1${path}`) && (init?.method ?? "GET") === method,
  );

beforeEach(() => {
  authState.session = { access_token: "t", user: { id: "u" } };
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("ONB-D2: akun wajib tertaut karyawan", () => {
  it("daftar: badge Belum tertaut + Tautkan dengan saran email → PUT employeeId", async () => {
    const user = userEvent.setup();
    const fetch = setup();
    renderAt("/akun");
    const table = await screen.findByRole("table", { name: "Daftar akun" });
    expect(await within(table).findByText("Belum tertaut")).toBeInTheDocument();
    await user.click(within(table).getByRole("button", { name: /Tautkan/ }));
    const dialog = await screen.findByRole("dialog", { name: "Tautkan ke karyawan" });
    const suggestions = await within(dialog).findByRole("list", { name: "Saran karyawan" });
    const suggestion = within(suggestions).getByRole("button", { name: /Seifal Uji/ });
    expect(within(suggestion).getByText("email pribadi")).toBeInTheDocument();
    await user.click(suggestion);
    await user.click(within(dialog).getByRole("button", { name: "Tautkan ke Seifal Uji" }));
    await waitFor(() =>
      expect(callsTo(fetch, "/accounts/acc-seifal/employee", "PUT")).toHaveLength(1),
    );
    const [, init] = callsTo(fetch, "/accounts/acc-seifal/employee", "PUT")[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({ employeeId: "emp-1" });
  });

  it("undang role Karyawan: wajib pilih karyawan; email terisi dari email kerja; terkirim ke antrean", async () => {
    const user = userEvent.setup();
    const fetch = setup();
    renderAt("/akun");
    await user.click(await screen.findByRole("button", { name: "Undang akun" }));
    const dialog = await screen.findByRole("dialog", { name: "Undang akun" });
    await user.type(within(dialog).getByLabelText(/Email/), "baru@example.test");
    await user.click(within(dialog).getByRole("button", { name: "Kirim undangan" }));
    expect(
      await within(dialog).findByText("Pilih karyawan yang ditautkan ke akun ini."),
    ).toBeInTheDocument();
    expect(callsTo(fetch, "/accounts/invite", "POST")).toHaveLength(0);

    await user.clear(within(dialog).getByLabelText(/Email/));
    await user.click(await within(dialog).findByRole("button", { name: /Seifal Uji/ }));
    expect(within(dialog).getByLabelText(/Email/)).toHaveValue("seifal.kantor@example.test");
    await user.click(within(dialog).getByRole("button", { name: "Kirim undangan" }));
    await waitFor(() => expect(callsTo(fetch, "/accounts/invite", "POST")).toHaveLength(1));
    const [, init] = callsTo(fetch, "/accounts/invite", "POST")[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      email: "seifal.kantor@example.test",
      role: "EMPLOYEE",
      employeeId: "emp-1",
    });
    // Berhasil → dialog tertutup.
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Undang akun" })).not.toBeInTheDocument(),
    );
  });
});
