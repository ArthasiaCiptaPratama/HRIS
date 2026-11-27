import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// IAM-D2 (2026-11-26): grant banyak akun × banyak izin + "Cabut terpilih".
const meta = (total: number) => ({ page: 1, pageSize: 20, total });
const acc = (id: string, email: string, role: "HR_ADMIN" | "MANAGER") => ({
  id,
  email,
  role,
  isActive: true,
  isPrimarySuperAdmin: false,
  employeeId: null,
  companyIds: [],
  lastLoginAt: null,
  createdAt: "2026-09-28T00:00:00.000Z",
});
const hr = acc("acc-hr", "hr.uji@example.test", "HR_ADMIN");
const mgr = acc("acc-mgr", "mgr.uji@example.test", "MANAGER");
const grant = (id: string, accountId: string, permission: string) => ({
  id,
  accountId,
  permission,
  expiresAt: null,
  reason: null,
  grantedBy: "acc-SUPER_ADMIN",
  revokedAt: null,
  revokedBy: null,
  isActive: true,
  createdAt: "2026-09-28T00:00:00.000Z",
});
const batchItems = [
  { accountId: "acc-hr", permission: "contract.manage", status: "created", grantId: "n1" },
  {
    accountId: "acc-mgr",
    permission: "contract.manage",
    status: "skipped_not_grantable",
    grantId: null,
  },
];

type Call = { path: string; query: URLSearchParams; method: string; body: unknown };
function stubApi() {
  const calls: Call[] = [];
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/api/v1", "");
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ path, query: url.searchParams, method, body });
    switch (path) {
      case "/me":
        return json(200, { data: me("SUPER_ADMIN", true) });
      case "/health":
        return json(200, { data: { status: "ok", checks: { database: "ok" }, time: "x" } });
      case "/notifications":
        return json(200, { data: [], meta: { ...meta(0), unreadCount: 0 } });
      case "/master-data":
        return json(200, { data: { companies: [] } });
      case "/accounts": {
        const rows = url.searchParams.get("role") === "MANAGER" ? [mgr] : [hr];
        return json(200, { data: rows, meta: meta(1) });
      }
      case "/grants":
        return json(200, {
          data: [
            grant("g1", "acc-hr", "employee.bank.read"),
            grant("g2", "acc-mgr", "asset.manage"),
          ],
          meta: meta(2),
        });
      case "/grants/batch": {
        const dry = (body as { dryRun?: boolean }).dryRun === true;
        return json(200, {
          data: {
            batchId: dry ? null : "00000000-0000-4000-8000-000000000001",
            items: batchItems,
            created: 1,
            skipped: 1,
          },
        });
      }
      case "/grants/revoke-batch":
        return json(200, {
          data: {
            batchId: "00000000-0000-4000-8000-000000000002",
            items: [
              {
                id: "g1",
                accountId: "acc-hr",
                permission: "employee.bank.read",
                status: "revoked",
              },
              { id: "g2", accountId: "acc-mgr", permission: "asset.manage", status: "revoked" },
            ],
            revoked: 2,
            skipped: 0,
          },
        });
      default:
        return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
    }
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

beforeEach(() => {
  authState.session = { access_token: "t", user: { id: "u" } };
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("Grant izin — banyak sekaligus (IAM-D2)", () => {
  it("dialog: pilih akun × izin → pratinjau dryRun dari server → simpan → hasil per baris", async () => {
    const calls = stubApi();
    renderAt("/grant");
    await userEvent.click(await screen.findByRole("button", { name: /Beri grant/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Pilih minimal satu akun dan satu izin.")).toBeInTheDocument();

    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /hr\.uji/ }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /mgr\.uji/ }));
    const contract = within(dialog).getByRole("checkbox", { name: /^Kelola kontrak/ });
    await userEvent.click(contract);
    // Peringatan per izin: contract.manage tidak untuk Manager.
    expect(contract.closest("label")).toHaveTextContent("Tidak untuk Manager — dilewati");

    expect(await within(dialog).findByText(/2 akun × 1 izin = 2 kombinasi/)).toBeInTheDocument();
    expect(within(dialog).getByText("1 dibuat")).toBeInTheDocument();
    expect(within(dialog).getByText("1 dilewati · tidak sesuai role")).toBeInTheDocument();
    const preview = calls.find((c) => c.path === "/grants/batch");
    expect(preview?.body).toMatchObject({
      accountIds: ["acc-hr", "acc-mgr"],
      permissions: ["contract.manage"],
      dryRun: true,
    });

    await userEvent.click(within(dialog).getByRole("button", { name: "Beri 1 grant" }));
    const result = await within(dialog).findByRole("table", { name: "Hasil per kombinasi" });
    expect(within(result).getByText("Dibuat")).toBeInTheDocument();
    expect(within(result).getByText("Dilewati · tidak sesuai role")).toBeInTheDocument();
    const saves = calls.filter(
      (c) => c.path === "/grants/batch" && !(c.body as { dryRun?: boolean }).dryRun,
    );
    expect(saves).toHaveLength(1);
  });

  it("daftar: centang semua → Cabut terpilih → konfirmasi + alasan → revoke-batch", async () => {
    const calls = stubApi();
    renderAt("/grant");
    const table = await screen.findByRole("table", { name: "Daftar grant" });
    await within(table).findByText("hr.uji@example.test");
    expect(screen.queryByRole("button", { name: /Cabut terpilih/ })).not.toBeInTheDocument();

    await userEvent.click(
      within(table).getByRole("checkbox", { name: "Pilih semua grant aktif di halaman ini" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Cabut terpilih (2)" }));
    const dialog = await screen.findByRole("dialog", { name: "Cabut 2 grant?" });
    expect(
      within(dialog).getByText(/hr\.uji@example\.test · Lihat nomor rekening/),
    ).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/Alasan/), "selesai audit");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cabut 2 grant" }));

    await waitFor(() =>
      expect(calls.find((c) => c.path === "/grants/revoke-batch")?.body).toEqual({
        ids: ["g1", "g2"],
        reason: "selesai audit",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Cabut terpilih/ })).not.toBeInTheDocument(),
    );
  });

  it("filter akun & izin dikirim sebagai accountIds/permissions", async () => {
    const calls = stubApi();
    renderAt("/grant");
    await screen.findByRole("table", { name: "Daftar grant" });
    await userEvent.click(screen.getByRole("combobox", { name: "Filter izin" }));
    await userEvent.click(await screen.findByRole("option", { name: "Lihat nomor rekening" }));
    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.path === "/grants" && c.query.get("permissions") === "employee.bank.read",
        ),
      ).toBe(true),
    );
  });
});
