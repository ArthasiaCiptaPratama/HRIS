import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/app/feature-flags";
import { authState, me, renderAt } from "./helpers";
import { supabaseMock } from "./supabase-mock";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// D-054 / OD-6 (Arsip gelombang 1c): Layanan Mandiri (data diri + pengajuan), antrean HR, Arsip Bank.
const employeeRef = {
  id: "e1",
  fullName: "Agus Pratama",
  employeeNumber: "ACP-2023-0007",
  isActive: true,
  company: { id: "co-acp", code: "ACP" },
  department: { id: "d1", name: "Produksi" },
  position: { id: "p1", name: "Operator" },
  photoUrl: null,
};
const myData = {
  employeeId: "e1",
  fullName: "Agus Pratama",
  personal: { domicileAddress: "Jl. Lama 1", religion: "ISLAM", ktpNumber: null },
  emergency: { name: "Siti", relationship: "Istri", phone: "081200000001" },
  family: [{ name: "Siti", relationship: "SPOUSE", birthDate: null, phoneNumber: null }],
  bank: { bankName: "BRI", accountNumber: "••••••2233", accountHolder: "Agus" },
  pendingSections: ["PERSONAL"],
};
const queueRow = (canReview: boolean, section = "BANK") => ({
  id: canReview ? "r1" : "r2",
  section,
  status: "PENDING",
  documentType: null,
  fields: ["accountNumber"],
  reviewNote: null,
  reviewedAt: null,
  createdAt: "2026-10-05T03:00:00.000Z",
  employee: employeeRef,
  canReview,
});
const detail = {
  ...queueRow(true),
  proposed: { bankName: "BNI", accountNumber: "9999888877", accountHolder: "Agus" },
  current: { bankName: "BRI", accountNumber: "1111222233", accountHolder: "Agus" },
  document: {
    id: "doc1",
    name: "Buku tabungan / bukti rekening",
    mimeType: "application/pdf",
    sizeBytes: 2000,
    url: "https://storage.test/x",
  },
  access: { review: true, cancel: false },
};
const withGrants = (base: ReturnType<typeof me>, permissions: string[]) => ({
  ...base,
  grants: permissions.map((permission) => ({ permission, expiresAt: null })),
});

type Call = { method: string; path: string; search: string; body: unknown };
function mockFetch(role: unknown) {
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
            companies: [{ id: "co-acp", code: "ACP", name: "PT ACP" }],
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
      if (path === "/document-types") return json(200, { data: [] });
      if (path === "/self/employee-data") return json(200, { data: myData });
      if (path === "/self/data-changes")
        return json(200, {
          data: [
            {
              ...queueRow(true, "PERSONAL"),
              fields: ["domicileAddress"],
              employee: undefined,
              canReview: undefined,
            },
          ],
        });
      if (path === "/employees/e1/documents")
        return json(200, {
          data: { documents: [], access: { write: false, writeSensitive: false } },
        });
      if (path === "/self/documents/upload-url")
        return json(200, {
          data: {
            bucket: "employee-documents",
            path: "employees/e1/documents/b.pdf",
            token: "tok",
            signedUrl: "x",
            maxBytes: 5 * 1024 * 1024,
          },
        });
      if (path === "/data-changes" && method === "GET")
        return json(200, {
          data: [queueRow(true), queueRow(false, "PERSONAL")],
          meta: { page: 1, pageSize: 20, total: 2 },
        });
      if (path === "/data-changes/r1") return json(200, { data: detail });
      if (path === "/archive/bank-accounts")
        return json(200, {
          data: [
            {
              id: "e1",
              employee: employeeRef,
              bankName: "BRI",
              accountNumber: "1111222233",
              accountHolder: "Agus",
            },
          ],
          meta: { page: 1, pageSize: 20, total: 1 },
        });
      if (method === "POST") return json(201, { data: { id: "new-1" } });
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

// D-043 rilis bertahap: suite fitur yang disembunyikan saklar FEATURES dilewati di jalur rilis.
describe.skipIf(!FEATURES.selfService)("Layanan Mandiri › data saya (OD-6)", () => {
  it("rekening tersamar; bagian menunggu tanpa tombol; ajukan kontak darurat", async () => {
    const calls = mockFetch(me("EMPLOYEE", false, "e1"));
    renderAt("/ess");
    expect(await screen.findByText("••••••2233")).toBeInTheDocument();
    const personal = screen
      .getByRole("heading", { name: /Data pribadi/ })
      .closest("section") as HTMLElement;
    expect(within(personal).getByText("Menunggu persetujuan")).toBeInTheDocument();
    expect(within(personal).queryByRole("button", { name: /Ajukan perubahan/ })).toBeNull();

    const emergency = screen
      .getByRole("heading", { name: /Kontak darurat/ })
      .closest("section") as HTMLElement;
    await userEvent.click(within(emergency).getByRole("button", { name: /Ajukan perubahan/ }));
    const dialog = await screen.findByRole("dialog", { name: /kontak darurat/i });
    const name = within(dialog).getByLabelText("Nama kontak darurat");
    await userEvent.clear(name);
    await userEvent.type(name, "Budi");
    await userEvent.click(within(dialog).getByRole("button", { name: /Kirim pengajuan/ }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST" && c.path === "/data-changes")?.body).toEqual({
        section: "EMERGENCY",
        data: { name: "Budi", relationship: "Istri", phone: "081200000001" },
      }),
    );
  });

  it("rekening: buku tabungan wajib; diunggah lalu path ikut pengajuan", async () => {
    const calls = mockFetch(me("EMPLOYEE", false, "e1"));
    renderAt("/ess");
    await screen.findByText("••••••2233");
    const bank = screen
      .getByRole("heading", { name: /Rekening bank/ })
      .closest("section") as HTMLElement;
    await userEvent.click(within(bank).getByRole("button", { name: /Ajukan perubahan/ }));
    const dialog = await screen.findByRole("dialog", { name: /rekening bank/i });
    await userEvent.type(within(dialog).getByLabelText("Nomor rekening"), "9999888877");
    await userEvent.click(within(dialog).getByRole("button", { name: /Kirim pengajuan/ }));
    expect(await within(dialog).findByText("Lampirkan buku tabungan.")).toBeInTheDocument();
    const file = new File(["%PDF"], "buku.pdf", { type: "application/pdf" });
    await userEvent.upload(within(dialog).getByLabelText(/Buku tabungan/), file);
    await userEvent.click(within(dialog).getByRole("button", { name: /Kirim pengajuan/ }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.method === "POST" && c.path === "/data-changes")?.body,
      ).toMatchObject({
        section: "BANK",
        data: {
          bankName: "BRI",
          accountNumber: "9999888877",
          bankBookPath: "employees/e1/documents/b.pdf",
        },
      }),
    );
    expect(supabaseMock.storageUpload).toHaveBeenCalled();
  });

  it("riwayat pengajuan: batalkan yang menunggu", async () => {
    const calls = mockFetch(me("EMPLOYEE", false, "e1"));
    renderAt("/ess");
    await screen.findByText("••••••2233");
    await userEvent.click(screen.getByRole("tab", { name: /Riwayat pengajuan/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Batalkan" }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.path === "/data-changes/r1/cancel")).toBe(
        true,
      ),
    );
  });
});

describe.skipIf(!FEATURES.selfService)("Administrasi › Pengajuan Perubahan Data", () => {
  it("HR ber-grant: baris tanpa grant bagian 'Butuh izin'; periksa → perbandingan; tolak wajib alasan; setujui", async () => {
    const calls = mockFetch(
      withGrants(me("HR_ADMIN"), [
        "employee.changes.review",
        "employee.bank.read",
        "employee.bank.write",
      ]),
    );
    renderAt("/pengajuan-data");
    const table = await screen.findByRole("table", { name: "Daftar pengajuan perubahan data" });
    expect(await within(table).findByText("Butuh izin")).toBeInTheDocument();
    await userEvent.click(within(table).getByRole("button", { name: "Periksa" }));
    const dialog = await screen.findByRole("dialog", { name: /Rekening bank · Agus Pratama/ });
    const compare = await within(dialog).findByRole("table", { name: "Perbandingan data" });
    expect(within(compare).getByText("1111222233")).toBeInTheDocument();
    expect(within(compare).getByText("9999888877")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /Lihat/ })).toHaveAttribute(
      "href",
      "https://storage.test/x",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: /Tolak/ }));
    expect(await within(dialog).findByText("Tulis alasan penolakan.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: /Setujui/ }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.method === "POST" && c.path === "/data-changes/r1/decision")?.body,
      ).toEqual({
        decision: "APPROVE",
        note: null,
      }),
    );
  });

  it("HR tanpa grant review: menu & halaman ditolak", async () => {
    mockFetch(me("HR_ADMIN"));
    renderAt("/pengajuan-data");
    expect(await screen.findByRole("heading", { name: "Akses ditolak" })).toBeInTheDocument();
  });
});

describe.skipIf(!FEATURES.archive)("Arsip › Data Bank", () => {
  it("SA: nomor rekening penuh", async () => {
    mockFetch(me("SUPER_ADMIN", true));
    renderAt("/personal/arsip/bank");
    const table = await screen.findByRole("table", { name: "Daftar data bank" });
    expect(await within(table).findByText("1111222233")).toBeInTheDocument();
  });
});
