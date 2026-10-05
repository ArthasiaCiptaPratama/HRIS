import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authState, me, mockApi, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// Penyeragaman halaman Administrasi & Akun Saya dengan gaya Personal Management (2026-09-30):
// PageHeader (h1 + breadcrumb), DataTable + TablePagination, EmptyState.
const health = {
  data: { status: "ok", checks: { database: "ok" }, time: new Date().toISOString() },
};
const meta = (total: number) => ({ page: 1, pageSize: 20, total });
const notifications = (items: unknown[]) => ({
  data: items,
  meta: { ...meta(items.length), unreadCount: items.length },
});
const account = {
  id: "acc-hr",
  email: "hr.uji@example.test",
  role: "HR_ADMIN",
  isActive: true,
  isPrimarySuperAdmin: false,
  employeeId: null,
  companyIds: [],
  lastLoginAt: null,
  createdAt: "2026-09-28T00:00:00.000Z",
};
const grant = {
  id: "g1",
  accountId: "acc-hr",
  permission: "employee.personal.read",
  expiresAt: null,
  reason: null,
  grantedBy: "acc-SUPER_ADMIN",
  revokedAt: null,
  revokedBy: null,
  isActive: true,
  createdAt: "2026-09-28T00:00:00.000Z",
};
const auditLog = {
  id: "a1",
  actorAccountId: "acc-SUPER_ADMIN",
  actorEmail: "super_admin@example.test",
  entityLabel: "hr.uji@example.test",
  action: "iam.grant.create",
  entityType: "permission_grant",
  entityId: "g1",
  before: null,
  after: { permission: "employee.personal.read" },
  reason: null,
  occurredAt: "2026-09-28T01:00:00.000Z",
};

function setup(routes: Record<string, [number, unknown]>, role = me("SUPER_ADMIN", true)) {
  return mockApi({
    "/me": [200, { data: role }],
    "/health": [200, health],
    "/notifications": [200, notifications([])],
    ...routes,
  });
}

/** Judul h1 + breadcrumb kelompok besar (PageHeader). */
async function expectHeader(title: string, group: string) {
  expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent(group);
}

beforeEach(() => {
  authState.session = { access_token: "t", user: { id: "u" } };
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("Administrasi", () => {
  it("Akun: header, tabel berisi akun, paginasi dengan pilihan baris; ganti baris → pageSize", async () => {
    const fetch = setup({ "/accounts": [200, { data: [account], meta: meta(1) }] });
    renderAt("/akun");
    await expectHeader("Akun", "Administrasi");
    const table = await screen.findByRole("table", { name: "Daftar akun" });
    expect(await within(table).findByText("hr.uji@example.test")).toBeInTheDocument();
    expect(within(table).getByText("HR Admin")).toBeInTheDocument();
    expect(screen.getByText("1–1 dari 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undang akun" })).toBeInTheDocument();

    const accountsUrls = () =>
      fetch.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("/accounts?"));
    expect(accountsUrls().some((url) => url.includes("pageSize=20"))).toBe(true);
    await userEvent.click(screen.getByRole("combobox", { name: "Baris per halaman" }));
    await userEvent.click(await screen.findByRole("option", { name: "50" }));
    await waitFor(() =>
      expect(accountsUrls().some((url) => url.includes("pageSize=50"))).toBe(true),
    );
  });

  it("Akun: daftar kosong → EmptyState", async () => {
    setup({ "/accounts": [200, { data: [], meta: meta(0) }] });
    renderAt("/akun");
    await expectHeader("Akun", "Administrasi");
    expect(await screen.findByText("Belum ada akun")).toBeInTheDocument();
  });

  it("Grant izin: header, tabel berisi izin & email penerima", async () => {
    setup({
      "/grants": [200, { data: [grant], meta: meta(1) }],
      "/accounts": [200, { data: [account], meta: meta(1) }],
    });
    renderAt("/grant");
    await expectHeader("Grant izin", "Administrasi");
    const table = await screen.findByRole("table", { name: "Daftar grant" });
    expect(await within(table).findByText("hr.uji@example.test")).toBeInTheDocument();
    expect(within(table).getByRole("button", { name: "Cabut" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter status grant" })).toBeInTheDocument();
  });

  it("Audit log: header, tabel berisi aksi; kosong → EmptyState", async () => {
    setup({ "/audit-logs": [200, { data: [auditLog], meta: meta(1) }] });
    renderAt("/audit");
    await expectHeader("Audit log", "Administrasi");
    const table = await screen.findByRole("table", { name: "Daftar audit log" });
    expect(await within(table).findByText("iam.grant.create")).toBeInTheDocument();
    // Terbaca: label aksi Indonesia + email aktor + label entitas (audit UI 2026-09-30).
    expect(await within(table).findByText("Beri grant izin")).toBeInTheDocument();
    expect(within(table).getByText("super_admin@example.test")).toBeInTheDocument();
    expect(within(table).getByText("hr.uji@example.test")).toBeInTheDocument();
  });

  it("Audit log kosong → EmptyState", async () => {
    setup({ "/audit-logs": [200, { data: [], meta: meta(0) }] });
    renderAt("/audit");
    expect(await screen.findByText("Belum ada entri audit")).toBeInTheDocument();
  });
});

describe("Akun Saya", () => {
  it("Profil: h1 + breadcrumb (sebelumnya tanpa h1)", async () => {
    setup({});
    renderAt("/profil");
    await expectHeader("Profil", "Akun Saya");
    expect(screen.getByText("Ganti password")).toBeInTheDocument();
  });

  it("Notifikasi: header, item, tandai semua; kosong → EmptyState", async () => {
    setup(
      {
        "/notifications": [
          200,
          notifications([
            {
              id: "n1",
              type: "grant.created",
              title: "Anda mendapat grant baru",
              body: null,
              link: null,
              readAt: null,
              createdAt: "2026-09-28T01:00:00.000Z",
            },
          ]),
        ],
      },
      me("EMPLOYEE"),
    );
    renderAt("/notifikasi");
    await expectHeader("Notifikasi", "Akun Saya");
    const list = await screen.findByRole("list", { name: "Daftar notifikasi" });
    expect(within(list).getByText("Anda mendapat grant baru")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tandai semua dibaca" })).toBeEnabled();
  });

  it("Notifikasi kosong → EmptyState", async () => {
    setup({}, me("EMPLOYEE"));
    renderAt("/notifikasi");
    expect(await screen.findByText("Belum ada notifikasi")).toBeInTheDocument();
  });
});
