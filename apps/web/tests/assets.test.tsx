import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/app/feature-flags";
import { formatPrice } from "@/features/assets/components/display";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// ARS-D1–D6 (Arsip gelombang 2a): Data Assets, Master Data › Aset & APD, Layanan Mandiri › Aset saya.

const holder = {
  employeeId: "e1",
  fullName: "Agus Pratama",
  employeeNumber: "ACP-2023-0007",
  companyId: "co-acp",
  isActive: true,
};
const assignment = {
  id: "as1",
  asset: {
    id: "a1",
    code: "ACP-LPT-0001",
    name: "Laptop kerja",
    category: { id: "c1", code: "LPT", name: "Laptop" },
  },
  employee: holder,
  assignedAt: "2026-10-01",
  dueBackAt: "2026-10-05",
  loanState: "OVERDUE",
  conditionOut: "GOOD",
  closedAt: null,
  outcome: null,
  conditionIn: null,
  handoverDocumentId: null,
  returnDocumentId: null,
  acknowledgedAt: null,
  note: null,
  closeNote: null,
};
const asset = (seePrice: boolean, canManage: boolean) => ({
  id: "a1",
  code: "ACP-LPT-0001",
  name: "Laptop kerja",
  brand: "Lenovo",
  model: "T14",
  serialNumber: "SN-1",
  category: { id: "c1", code: "LPT", name: "Laptop" },
  company: { id: "co-acp", code: "ACP", name: "PT Arthasia Cipta Pratama" },
  workLocation: null,
  condition: "GOOD",
  status: "ASSIGNED",
  purchaseDate: seePrice ? "2026-01-05" : null,
  purchasePrice: seePrice ? "12500000.00" : null,
  canSeePrice: seePrice,
  canManage,
  note: null,
  holder,
  assignment,
});
const grant = (permission: string) => ({ permission, expiresAt: null });
type Role = ReturnType<typeof me>;
type Call = { method: string; path: string; body: unknown };

// `me()` memberi grants: [] (never[]); fixture ber-grant dikirim apa adanya ke /me.
function mockFetch(
  role: Role | Record<string, unknown>,
  opts: { seePrice?: boolean; canManage?: boolean } = {},
) {
  const calls: Call[] = [];
  const seePrice = opts.seePrice ?? true;
  const canManage = opts.canManage ?? true;
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
      if (path === "/employees/summary")
        return json(200, {
          data: { active: { total: 1, byCategory: {}, uncategorized: 0 }, inactive: 0 },
        });
      if (path === "/asset-categories" && method === "GET")
        return json(200, {
          data: [{ id: "c1", code: "LPT", name: "Laptop", requiresSerial: false, isActive: true }],
        });
      if (path === "/ppe-types")
        return json(200, {
          data: [
            {
              id: "t1",
              code: "HLM",
              name: "Helm",
              replaceAfterMonths: null,
              mustReturn: true,
              isActive: true,
            },
          ],
        });
      if (path === "/assets" && method === "GET")
        return json(200, {
          data: [asset(seePrice, canManage)],
          meta: { page: 1, pageSize: 20, total: 1 },
        });
      if (path === "/assets" && method === "POST")
        return json(201, {
          data: {
            ...asset(seePrice, canManage),
            id: "a2",
            code: "ACP-LPT-0002",
            holder: null,
            assignment: null,
            status: "AVAILABLE",
          },
        });
      if (path === "/assets/a1")
        return json(200, { data: { ...asset(seePrice, canManage), history: [assignment] } });
      if (path === "/document-types") return json(200, { data: [] });
      if (path === "/self/assets")
        return json(200, {
          data: { employee: holder, assets: [assignment], ppe: [], canManage: false },
        });
      if (path === "/self/asset-assignments/as1/acknowledge")
        return json(200, { data: { ...assignment, acknowledgedAt: "2026-10-14T01:00:00.000Z" } });
      if (path === "/self/employee-data")
        return json(200, {
          data: {
            employeeId: "e1",
            fullName: "Agus Pratama",
            personal: { domicileAddress: "Jl. Lama 1", religion: "ISLAM", ktpNumber: null },
            emergency: { name: "Siti", relationship: "Istri", phone: "081200000001" },
            family: [],
            bank: { bankName: "BRI", accountNumber: "••••••2233", accountHolder: "Agus" },
            pendingSections: [],
          },
        });
      if (path === "/data-changes" || path === "/self/data-changes")
        return json(200, { data: [], meta: { page: 1, pageSize: 20, total: 0 } });
      if (path === "/employees/e1/documents") return json(200, { data: [] });
      return json(404, { error: { code: "NOT_FOUND", message: "Tidak ditemukan." } });
    }),
  );
  return calls;
}

beforeEach(() => {
  authState.session = { access_token: "tok", user: { id: "u1" } };
});
afterEach(() => vi.unstubAllGlobals());

describe("formatPrice (PROMPT §4: tanpa number JS)", () => {
  it("memformat string desimal ke Rupiah", () => {
    expect(formatPrice("12500000.00")).toBe("Rp 12.500.000");
    expect(formatPrice("999.5")).toBe("Rp 999,50");
    expect(formatPrice(null)).toBe("—");
  });
});

describe.skipIf(!FEATURES.assets)("Arsip › Data Assets (ARS-D3)", () => {
  it("SA: daftar aset + tombol Tambah aset + tab Belum kembali", async () => {
    mockFetch(me("SUPER_ADMIN", true));
    renderAt("/personal/arsip/aset");
    expect(await screen.findByRole("heading", { name: "Data Assets" })).toBeInTheDocument();
    expect(await screen.findByText("Laptop kerja")).toBeInTheDocument();
    expect(
      screen.getByText("Terlambat kembali", { selector: "[data-slot='badge'], span" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tambah aset/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Belum kembali/ })).toBeInTheDocument();
  });

  it("HR tanpa grant asset.manage: lihat saja (tanpa Tambah aset); dengan grant: bisa tambah", async () => {
    mockFetch(me("HR_ADMIN"), { seePrice: false, canManage: false });
    const view = renderAt("/personal/arsip/aset");
    expect(await screen.findByText("Laptop kerja")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tambah aset/ })).not.toBeInTheDocument();
    view.unmount();
    mockFetch({ ...me("HR_ADMIN"), grants: [grant("asset.manage")] });
    renderAt("/personal/arsip/aset");
    expect(await screen.findByRole("button", { name: /Tambah aset/ })).toBeInTheDocument();
  });

  it("MANAGER: daftar tim tanpa Tambah aset & tanpa tab Belum kembali; EMPLOYEE: akses ditolak", async () => {
    mockFetch(me("MANAGER", false, "m1"), { seePrice: false, canManage: false });
    const view = renderAt("/personal/arsip/aset");
    expect(await screen.findByText("Laptop kerja")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tambah aset/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Belum kembali/ })).not.toBeInTheDocument();
    view.unmount();
    mockFetch(me("EMPLOYEE", false, "e1"));
    renderAt("/personal/arsip/aset");
    expect(await screen.findByRole("heading", { name: /Akses ditolak/ })).toBeInTheDocument();
  });

  it("detail aset: harga hanya untuk pengelola (ARS-D4)", async () => {
    mockFetch(me("SUPER_ADMIN", true));
    const view = renderAt("/personal/arsip/aset?asset=a1");
    const sheet = await screen.findByRole("dialog");
    expect(await within(sheet).findByText("Rp 12.500.000")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: /Terima pengembalian/ })).toBeInTheDocument();
    view.unmount();
    mockFetch(me("HR_ADMIN"), { seePrice: false, canManage: false });
    renderAt("/personal/arsip/aset?asset=a1");
    const plain = await screen.findByRole("dialog");
    expect(await within(plain).findByText("Lenovo · T14")).toBeInTheDocument();
    expect(within(plain).queryByText("Harga beli")).not.toBeInTheDocument();
    expect(
      within(plain).queryByRole("button", { name: /Terima pengembalian/ }),
    ).not.toBeInTheDocument();
  });

  it("tambah aset: kode kosong dikirim (otomatis di server), harga string desimal", async () => {
    const calls = mockFetch(me("SUPER_ADMIN", true));
    renderAt("/personal/arsip/aset");
    await userEvent.click(await screen.findByRole("button", { name: /Tambah aset/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("combobox", { name: /Kategori/ }));
    await userEvent.click(await screen.findByRole("option", { name: /Laptop \(LPT\)/ }));
    await userEvent.type(within(dialog).getByLabelText("Nama aset"), "Laptop baru");
    await userEvent.type(within(dialog).getByLabelText(/Harga beli/), "15000000,50");
    await userEvent.click(within(dialog).getByRole("button", { name: "Tambah aset" }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.path === "/assets")).toBe(true),
    );
    const body = calls.find((c) => c.method === "POST" && c.path === "/assets")?.body as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      code: "",
      categoryId: "c1",
      companyId: "co-acp",
      name: "Laptop baru",
      purchasePrice: "15000000.50",
    });
  });
});

describe.skipIf(!FEATURES.assets || !FEATURES.selfService)(
  "Layanan Mandiri › Aset saya (ARS-D2)",
  () => {
    it('karyawan mengonfirmasi "Sudah saya terima"', async () => {
      const calls = mockFetch(me("EMPLOYEE", false, "e1"));
      renderAt("/ess");
      await userEvent.click(await screen.findByRole("tab", { name: /Aset saya/ }));
      await userEvent.click(await screen.findByRole("button", { name: /Sudah saya terima/ }));
      await waitFor(() =>
        expect(
          calls.some(
            (c) => c.method === "POST" && c.path === "/self/asset-assignments/as1/acknowledge",
          ),
        ).toBe(true),
      );
    });
  },
);

describe.skipIf(!FEATURES.assets)("Master Data › Aset & APD", () => {
  it("HR tanpa grant: lihat kategori tanpa tombol tambah; SA: bisa tambah", async () => {
    mockFetch(me("HR_ADMIN"));
    const view = renderAt("/master-data/aset");
    expect(await screen.findByText("Laptop")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tambah kategori/ })).not.toBeInTheDocument();
    view.unmount();
    mockFetch(me("SUPER_ADMIN", true));
    renderAt("/master-data/aset?tab=apd");
    expect(await screen.findByText("Helm")).toBeInTheDocument();
    expect(screen.getByText("Wajib kembali")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tambah jenis APD/ })).toBeInTheDocument();
  });
});
