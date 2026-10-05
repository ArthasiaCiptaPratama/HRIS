import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSelectedCompany } from "@/features/employee/company-scope";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// D-039/D-040 (web): pemilih perusahaan di top bar, kolom perusahaan, default PT di form, dan
// penugasan PT akun HR di halaman Akun. Cakupan sesungguhnya dijaga API (test api integration).
const ACP = { id: "co-acp", code: "ACP", name: "PT Arthasia Cipta Pratama" };
const CD2 = { id: "co-cd2", code: "CD2", name: "PT Contoh Dua (Dummy)" };

const employee = (id: string, name: string, company = ACP) => ({
  id,
  employeeNumber: `N-${id}`,
  fullName: name,
  workEmail: null,
  phoneNumber: null,
  gender: null,
  joinDate: "2025-01-02",
  endDate: null,
  isActive: true,
  exitReason: null,
  employmentStatus: { id: "st", name: "PKWT", category: "PKWT" },
  company,
  position: { id: "p1", name: "Staff" },
  department: null,
  workLocation: null,
  grade: null,
  manager: null,
  photoUrl: null,
});

const hrAccount = {
  id: "acc-hr",
  email: "hr.uji@example.test",
  role: "HR_ADMIN",
  isActive: true,
  isPrimarySuperAdmin: false,
  employeeId: null,
  companyIds: [ACP.id],
  lastLoginAt: null,
  createdAt: "2026-09-28T00:00:00.000Z",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mockBackend(role: "SUPER_ADMIN" | "HR_ADMIN", companies: (typeof ACP)[]) {
  const requests: { method: string; url: URL; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      requests.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
      const key = url.pathname.replace("/api/v1", "");
      if (key === "/me") return json(200, { data: me(role) });
      if (key === "/health")
        return json(200, { data: { status: "ok", checks: { database: "ok" }, time: "x" } });
      if (key === "/notifications")
        return json(200, { data: [], meta: { page: 1, pageSize: 5, total: 0, unreadCount: 0 } });
      if (key === "/master-data")
        return json(200, {
          data: {
            companies,
            departments: [],
            positions: [],
            employmentStatuses: [],
            grades: [],
            workLocations: [],
          },
        });
      if (key === "/employees/summary")
        return json(200, {
          data: {
            active: {
              total: 2,
              byCategory: {
                PERMANENT: 0,
                PROBATION: 0,
                PKWT: 2,
                DAILY_WORKER: 0,
                INTERNSHIP: 0,
                OUTSOURCING: 0,
                VENDOR: 0,
              },
              uncategorized: 0,
            },
            inactive: 0,
          },
        });
      if (key === "/employees")
        return json(200, {
          data: [employee("1", "Ani Contoh"), employee("2", "Budi Contoh", CD2)],
          meta: { page: 1, pageSize: 20, total: 2 },
        });
      if (key === "/accounts")
        return json(200, { data: [hrAccount], meta: { page: 1, pageSize: 20, total: 1 } });
      if (key === "/accounts/acc-hr/companies" && method === "PUT")
        return json(200, { data: { ...hrAccount, companyIds: [ACP.id, CD2.id] } });
      return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
    }),
  );
  return requests;
}

beforeEach(() => {
  authState.session = { access_token: "t", user: { id: "u" } };
  setSelectedCompany(null);
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("Pemilih perusahaan & kolom perusahaan", () => {
  it("SA dengan 2 PT: pemilih tampil, kolom Perusahaan tampil; memilih CD2 mengirim ?companyId=", async () => {
    const requests = mockBackend("SUPER_ADMIN", [ACP, CD2]);
    renderAt("/personal/pegawai-aktif/semua");
    const table = await screen.findByRole("table", { name: "Daftar karyawan" });
    await within(table).findByText("Budi Contoh");
    expect(await within(table).findByRole("columnheader", { name: "Perusahaan" })).toBeTruthy();
    expect(within(table).getByText("CD2")).toBeTruthy();

    const user = userEvent.setup();
    // Dua pemilih di DOM (desktop di top bar, mobile di atas isi; dipisah CSS) — pakai yang pertama.
    await user.click(
      (await screen.findAllByRole("combobox", { name: "Perusahaan" }))[0] as HTMLElement,
    );
    await user.click(await screen.findByRole("option", { name: /CD2/ }));
    await waitFor(() => {
      const list = requests.filter((r) => r.url.pathname.endsWith("/employees"));
      expect(list.at(-1)?.url.searchParams.get("companyId")).toBe(CD2.id);
      const summary = requests.filter((r) => r.url.pathname.endsWith("/employees/summary"));
      expect(summary.at(-1)?.url.searchParams.get("companyId")).toBe(CD2.id);
    });
  });

  it("HR dengan 1 PT: tanpa pemilih & tanpa kolom Perusahaan; daftar tanpa ?companyId=", async () => {
    const requests = mockBackend("HR_ADMIN", [ACP]);
    renderAt("/personal/pegawai-aktif/semua");
    const table = await screen.findByRole("table", { name: "Daftar karyawan" });
    await within(table).findByText("Ani Contoh");
    await waitFor(() =>
      expect(requests.some((r) => r.url.pathname.endsWith("/master-data"))).toBe(true),
    );
    expect(screen.queryByRole("combobox", { name: "Perusahaan" })).toBeNull();
    expect(within(table).queryByRole("columnheader", { name: "Perusahaan" })).toBeNull();
    const list = requests.filter((r) => r.url.pathname.endsWith("/employees"));
    expect(list.every((r) => !r.url.searchParams.has("companyId"))).toBe(true);
  });

  it("Tambah karyawan: PT terpilih di top bar menjadi nilai awal field Perusahaan", async () => {
    mockBackend("SUPER_ADMIN", [ACP, CD2]);
    setSelectedCompany(CD2.id);
    renderAt("/personal/pegawai-aktif/semua");
    const user = userEvent.setup();
    await screen.findByRole("table", { name: "Daftar karyawan" });
    await user.click(
      (await screen.findAllByRole("button", { name: /Tambah karyawan/ }))[0] as HTMLElement,
    );
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(dialog).getByRole("combobox", { name: /Perusahaan/ })).toHaveTextContent("CD2"),
    );
  });
});

describe("Halaman Akun: penugasan perusahaan (SA)", () => {
  it("badge PT akun HR + Atur PT → PUT /accounts/:id/companies dengan set baru", async () => {
    const requests = mockBackend("SUPER_ADMIN", [ACP, CD2]);
    renderAt("/akun");
    const table = await screen.findByRole("table", { name: "Daftar akun" });
    await within(table).findByText("hr.uji@example.test");
    await waitFor(() => expect(within(table).getByText("ACP")).toBeTruthy());
    const user = userEvent.setup();
    await user.click(within(table).getByRole("button", { name: "Atur PT" }));
    const dialog = await screen.findByRole("dialog");
    const boxes = within(dialog).getAllByRole("checkbox");
    expect(boxes.map((b) => (b as HTMLInputElement).checked)).toEqual([true, false]);
    await user.click(boxes[1] as HTMLElement);
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => {
      const put = requests.find((r) => r.method === "PUT");
      expect(put?.url.pathname).toBe("/api/v1/accounts/acc-hr/companies");
      expect(put?.body).toEqual({ companyIds: [ACP.id, CD2.id] });
    });
  });
});
