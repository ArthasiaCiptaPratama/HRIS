import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/app/feature-flags";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// D-057, ARS-D7–D13 (Arsip gelombang 2b): Riwayat Peringatan, Jenis Pelanggaran, Layanan Mandiri › SP.

const employee = {
  employeeId: "e1",
  fullName: "Agus Pratama",
  employeeNumber: "ACP-2023-0007",
  companyId: "co-acp",
  isActive: true,
};
const can = {
  edit: false,
  issue: false,
  revoke: false,
  attachScan: false,
  deliver: false,
  acknowledge: false,
};
const letter = (over: Record<string, unknown> = {}) => ({
  id: "sp1",
  employee,
  companyId: "co-acp",
  companyName: "PT Arthasia Cipta Pratama",
  level: "SP1",
  violationType: { id: "v1", code: "MANGKIR", name: "Mangkir", linksAttendance: true },
  incidentDate: "2026-10-10",
  description: "Tidak hadir tanpa keterangan 2 hari.",
  status: "ISSUED",
  state: "ACTIVE",
  suggestedLevel: null,
  escalationReason: null,
  number: "001/SP1/HRD-ACP/X/2026",
  issuedAt: "2026-10-15",
  effectiveUntil: "2027-04-15",
  manager: { employeeId: "m1", fullName: "Budi Atasan" },
  deliveredAt: null,
  acknowledgedAt: null,
  scanDocumentId: null,
  revokedAt: null,
  revokeReason: null,
  alphaDays: [],
  can,
  ...over,
});
const grant = (permission: string) => ({ permission, expiresAt: null });
type Call = { method: string; path: string; body: unknown };

function mockFetch(
  role: ReturnType<typeof me> | Record<string, unknown>,
  opts: { list?: unknown[]; self?: unknown[]; detail?: Record<string, unknown> } = {},
) {
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
      if (path === "/violation-types" && method === "GET")
        return json(200, {
          data: [
            { id: "v1", code: "MANGKIR", name: "Mangkir", linksAttendance: true, isActive: true },
            { id: "v2", code: "TELAT", name: "Terlambat", linksAttendance: false, isActive: true },
          ],
        });
      if (path === "/discipline-settings") return json(200, { data: { validityMonths: 6 } });
      if (path === "/warning-letters" && method === "GET")
        return json(200, {
          data: opts.list ?? [letter()],
          meta: { page: 1, pageSize: 20, total: (opts.list ?? [letter()]).length },
        });
      if (path === "/warning-letters/sp1" && method === "GET")
        return json(200, { data: { ...letter(), alphaEvidence: [], ...opts.detail } });
      if (path === "/warning-letters/sp1/deliver")
        return json(200, {
          data: { ...letter({ deliveredAt: "2026-10-15T02:00:00.000Z" }), alphaEvidence: [] },
        });
      if (path === "/self/warning-letters") return json(200, { data: opts.self ?? [] });
      if (path === "/self/warning-letters/sp1/acknowledge")
        return json(200, {
          data: { ...letter({ acknowledgedAt: "2026-10-15T03:00:00.000Z" }), alphaEvidence: [] },
        });
      if (path === "/document-types") return json(200, { data: [] });
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
      if (path === "/self/assets")
        return json(200, { data: { employee, assets: [], ppe: [], canManage: false } });
      return json(404, { error: { code: "NOT_FOUND", message: "Tidak ditemukan." } });
    }),
  );
  return calls;
}

beforeEach(() => {
  authState.session = { access_token: "tok", user: { id: "u1" } };
});
afterEach(() => vi.unstubAllGlobals());

describe.skipIf(!FEATURES.discipline)("Arsip › Riwayat Peringatan (ARS-D13)", () => {
  it("HR ber-grant write: daftar SP + tombol Buat SP; HR read: tanpa Buat SP", async () => {
    mockFetch({ ...me("HR_ADMIN"), grants: [grant("employee.discipline.write")] });
    const view = renderAt("/personal/arsip/peringatan");
    expect(await screen.findByRole("heading", { name: "Riwayat Peringatan" })).toBeInTheDocument();
    expect(await screen.findByText("Agus Pratama")).toBeInTheDocument();
    expect(screen.getByText("001/SP1/HRD-ACP/X/2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Buat SP/ })).toBeInTheDocument();
    view.unmount();
    mockFetch({ ...me("HR_ADMIN"), grants: [grant("employee.discipline.read")] });
    renderAt("/personal/arsip/peringatan");
    expect(await screen.findByText("Agus Pratama")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Buat SP/ })).not.toBeInTheDocument();
  });

  it("HR tanpa grant SP & EMPLOYEE: akses ditolak", async () => {
    mockFetch(me("HR_ADMIN"));
    const view = renderAt("/personal/arsip/peringatan");
    expect(await screen.findByRole("heading", { name: /Akses ditolak/ })).toBeInTheDocument();
    view.unmount();
    mockFetch(me("EMPLOYEE", false, "e1"));
    renderAt("/personal/arsip/peringatan");
    expect(await screen.findByRole("heading", { name: /Akses ditolak/ })).toBeInTheDocument();
  });

  it('MANAGER: detail SP tim → "Sudah disampaikan"', async () => {
    const calls = mockFetch(me("MANAGER", false, "m1"), {
      detail: { can: { ...can, deliver: true } },
    });
    renderAt("/personal/arsip/peringatan?sp=sp1");
    const sheet = await screen.findByRole("dialog");
    expect(
      await within(sheet).findByText("Tidak hadir tanpa keterangan 2 hari."),
    ).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: /Cabut/ })).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: /Sudah disampaikan/ }));
    await waitFor(() =>
      expect(
        calls.some((c) => c.method === "POST" && c.path === "/warning-letters/sp1/deliver"),
      ).toBe(true),
    );
  });

  it("draft: tombol Terbitkan, Ubah, Hapus untuk penulis; SP3 menampilkan catatan PHK saat berlaku", async () => {
    mockFetch(me("SUPER_ADMIN", true), {
      detail: {
        status: "DRAFT",
        state: "DRAFT",
        number: null,
        issuedAt: null,
        effectiveUntil: null,
        can: { ...can, edit: true, issue: true },
      },
    });
    const view = renderAt("/personal/arsip/peringatan?sp=sp1");
    const sheet = await screen.findByRole("dialog");
    expect(await within(sheet).findByRole("button", { name: /Terbitkan/ })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: /Ubah draft/ })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: /Pratinjau PDF/ })).toBeInTheDocument();
    view.unmount();
    mockFetch(me("SUPER_ADMIN", true), {
      detail: { level: "SP3", can: { ...can, revoke: true } },
    });
    renderAt("/personal/arsip/peringatan?sp=sp1");
    const sp3 = await screen.findByRole("dialog");
    expect(await within(sp3).findByText(/pertimbangkan proses PHK/)).toBeInTheDocument();
    expect(within(sp3).getByRole("button", { name: /Cabut/ })).toBeInTheDocument();
  });
});

describe.skipIf(!FEATURES.discipline || !FEATURES.selfService)(
  "Layanan Mandiri › Surat peringatan (ARS-D9)",
  () => {
    it('karyawan menekan "Sudah menerima"; tab terbuka dari tautan ?tab=sp', async () => {
      const calls = mockFetch(me("EMPLOYEE", false, "e1"), {
        self: [letter({ can: { ...can, acknowledge: true } })],
      });
      renderAt("/ess?tab=sp");
      expect(await screen.findByText("Mangkir")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: /Sudah menerima/ }));
      await waitFor(() =>
        expect(
          calls.some(
            (c) => c.method === "POST" && c.path === "/self/warning-letters/sp1/acknowledge",
          ),
        ).toBe(true),
      );
    });
  },
);

describe.skipIf(!FEATURES.discipline)("Master Data › Jenis Pelanggaran (ARS-D8/D12)", () => {
  it("SA: bisa tambah & ubah masa berlaku; HR ber-grant write: tambah tanpa ubah masa berlaku", async () => {
    mockFetch(me("SUPER_ADMIN", true));
    const view = renderAt("/master-data/jenis-pelanggaran");
    expect(await screen.findByText("Mangkir")).toBeInTheDocument();
    expect(screen.getByText("Bisa ditautkan")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tambah jenis/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simpan" })).toBeInTheDocument();
    view.unmount();
    mockFetch({ ...me("HR_ADMIN"), grants: [grant("employee.discipline.write")] });
    renderAt("/master-data/jenis-pelanggaran");
    expect(await screen.findByText("Mangkir")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tambah jenis/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Simpan" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Masa berlaku SP/)).toBeDisabled();
  });
});
