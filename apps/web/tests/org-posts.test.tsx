import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// D-051: Administrasi › Master Data › Pos jabatan — SA kelola, HR lihat.
const ID = (n: number) => `00000000-0000-4000-8000-00000000002${n}`;
const health = {
  data: { status: "ok", checks: { database: "ok" }, time: new Date().toISOString() },
};
const post = {
  id: ID(1),
  code: "ACP-KTT",
  positionId: ID(2),
  positionName: "Kepala Teknik Tambang",
  level: "MANAGER",
  departmentId: ID(3),
  departmentName: "Site Operasional",
  unitType: "DIVISION",
  companyId: ID(4),
  companyCode: "ACP",
  reportsToId: null,
  reportsToLabel: null,
  functionalReportsToId: null,
  functionalReportsToLabel: null,
  headcount: 3,
  holderCount: 1,
  sortOrder: 0,
  archived: false,
};
const position = {
  id: ID(2),
  name: "Kepala Teknik Tambang",
  archived: false,
  employeeCount: 1,
  departmentId: ID(3),
  departmentName: "Site Operasional",
  level: "MANAGER",
};
const unit = {
  id: ID(3),
  name: "Site Operasional",
  archived: false,
  employeeCount: 1,
  unitType: "DIVISION",
  parentId: null,
  parentName: null,
  companyId: ID(4),
  companyCode: "ACP",
  positionCount: 1,
};
const company = {
  id: ID(4),
  name: "PT Uji",
  code: "ACP",
  archived: false,
  employeeCount: 1,
  npwpNumber: null,
  address: null,
  totalEmployeeCount: 1,
};

type Call = { method: string; path: string; body: unknown };
function mockFetch(role: ReturnType<typeof me>) {
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
      if (path === "/me") return json(200, { data: role });
      if (path === "/health") return json(200, health);
      if (path === "/notifications")
        return json(200, { data: [], meta: { page: 1, pageSize: 20, total: 0, unreadCount: 0 } });
      if (method === "GET" && path === "/org-posts") return json(200, { data: [post] });
      if (method === "GET" && path === "/positions") return json(200, { data: [position] });
      if (method === "GET" && path === "/departments") return json(200, { data: [unit] });
      if (method === "GET" && path === "/companies") return json(200, { data: [company] });
      if (path === "/org-posts/sync-managers") return json(200, { data: { updated: 2 } });
      if (method === "POST") return json(201, { data: { id: ID(9) } });
      return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
    }),
  );
  return calls;
}

beforeEach(() => {
  authState.session = { access_token: "t", user: { id: "u" } };
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("Master Data › Pos jabatan (D-051)", () => {
  it("SA: tabel pos (PT, slot terisi/kosong), tambah pos → POST body, sinkron atasan", async () => {
    const calls = mockFetch(me("SUPER_ADMIN", true));
    renderAt("/master-data/pos-jabatan");
    const table = await screen.findByRole("table", { name: "Daftar pos jabatan" });
    expect(await within(table).findByText("Kepala Teknik Tambang")).toBeInTheDocument();
    expect(within(table).getByText("ACP-KTT")).toBeInTheDocument();
    expect(within(table).getByText("2 kosong")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Tambah pos/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Jabatan" }));
    await userEvent.click(await screen.findByRole("option", { name: /Kepala Teknik Tambang/ }));
    const slots = within(dialog).getByLabelText("Jumlah slot");
    await userEvent.clear(slots);
    await userEvent.type(slots, "2");
    await userEvent.type(within(dialog).getByLabelText("Kode (opsional)"), "acp-wktt");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST" && c.path === "/org-posts")?.body).toEqual({
        code: "ACP-WKTT",
        positionId: ID(2),
        reportsToId: null,
        functionalReportsToId: null,
        headcount: 2,
        sortOrder: 0,
      }),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: /Sinkronkan atasan/ }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.path === "/org-posts/sync-managers")).toBe(
        true,
      ),
    );
  });

  it("HR: hanya melihat (tanpa tombol tambah/sinkron/aksi)", async () => {
    mockFetch(me("HR_ADMIN"));
    renderAt("/master-data/pos-jabatan");
    const table = await screen.findByRole("table", { name: "Daftar pos jabatan" });
    expect(await within(table).findByText("Kepala Teknik Tambang")).toBeInTheDocument();
    expect(
      screen.getByText(/Hanya Super Admin yang dapat mengubah pos jabatan/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tambah pos/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Sinkronkan atasan/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Aksi untuk/ })).toBeNull();
  });
});
