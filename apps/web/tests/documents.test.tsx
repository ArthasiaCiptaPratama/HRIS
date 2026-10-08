import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/app/feature-flags";
import { authState, me, renderAt } from "./helpers";
import { supabaseMock } from "./supabase-mock";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// D-055 (Arsip gelombang 1b): Data File, tab Dokumen di detail karyawan, Master Data › Jenis dokumen.
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
const SIMPER_ID = "6b0f3a52-8c1e-4d3a-9f21-2a7c5e9d1b40";
const simperType = {
  id: SIMPER_ID,
  code: "SIMPER",
  name: "SIMPER",
  category: "COMPETENCY",
  hasExpiry: true,
  defaultValidityMonths: 12,
  reminderDays: [60, 30, 7],
  requiredScope: "NONE",
  requiredPositionIds: [],
  multiple: false,
  employeeCanUpload: false,
  sensitive: false,
  maxSizeMb: 5,
  allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png"],
  archived: false,
  documentCount: 2,
};
const docType = {
  id: SIMPER_ID,
  code: "SIMPER",
  name: "SIMPER",
  category: "COMPETENCY",
  sensitive: false,
  hasExpiry: true,
  multiple: false,
};
const doc = (id: string, version: number, isCurrent: boolean, replacesId: string | null) => ({
  id,
  documentType: docType,
  documentNumber: `SMP-${version}`,
  issuedAt: "2025-10-01",
  expiresAt: isCurrent ? "2026-10-25" : "2025-10-01",
  expiryState: isCurrent ? "EXPIRING" : "EXPIRED",
  daysLeft: isCurrent ? 20 : -369,
  version,
  isCurrent,
  replacesId,
  status: "VERIFIED",
  note: null,
  mimeType: "application/pdf",
  sizeBytes: 120_000,
  trainingId: null,
  historyId: null,
  uploadedAt: "2025-10-01T03:00:00.000Z",
});
const bankBook = {
  ...doc("d3", 1, true, null),
  documentType: {
    id: "7c1f3a52-8c1e-4d3a-9f21-2a7c5e9d1b41",
    code: "BANK_BOOK",
    name: "Buku tabungan / bukti rekening",
    category: "FINANCE",
    sensitive: true,
    hasExpiry: false,
    multiple: false,
  },
  documentNumber: null,
  expiresAt: null,
  expiryState: "NONE",
  daysLeft: null,
};
const detail = {
  id: "e1",
  employeeNumber: "ACP-2023-0007",
  fullName: "Agus Pratama",
  workEmail: null,
  phoneNumber: null,
  gender: "MALE",
  joinDate: "2023-08-01",
  endDate: null,
  isActive: true,
  exitReason: null,
  employmentStatus: { id: "s1", name: "PKWT", category: "PKWT" },
  company: { id: "co-acp", code: "ACP", name: "PT Arthasia Cipta Pratama" },
  position: { id: "p1", name: "Operator" },
  department: { id: "d1", name: "Produksi" },
  workLocation: null,
  grade: null,
  manager: null,
  photoUrl: null,
  emergencyPhone: null,
  emergencyContactName: null,
  emergencyContactRelationship: null,
  account: null,
  bankAccount: { bankName: "BRI", accountNumber: "1111222233", accountHolder: "Agus" },
  access: {
    manage: true,
    deactivate: true,
    personal: false,
    bank: true,
    print: false,
    photo: false,
  },
  educations: [],
  trainings: [],
  workExperiences: [],
  histories: [],
};

type Call = { method: string; path: string; search: string; body: unknown };
function mockFetch(role: ReturnType<typeof me>, write = true) {
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
            departments: [{ id: "d1", name: "Produksi", parentId: null, unitType: "DEPARTMENT" }],
            positions: [{ id: "p1", name: "Operator", departmentId: "d1", level: null }],
            employmentStatuses: [],
            grades: [],
            workLocations: [],
          },
        });
      if (path === "/employees/summary")
        return json(200, {
          data: { active: { total: 1, byCategory: {}, uncategorized: 0 }, inactive: 0 },
        });
      if (path === "/document-types" && method === "GET") return json(200, { data: [simperType] });
      if (path === "/document-types") return json(201, { data: { id: "t-new" } });
      if (path === "/archive/documents")
        return json(200, {
          data: [{ ...doc("d2", 2, true, "d1"), employee: employeeRef }],
          meta: { page: 1, pageSize: 20, total: 1 },
        });
      if (path === "/employees/e1") return json(200, { data: detail });
      if (path === "/employees/e1/documents" && method === "GET")
        return json(200, {
          data: {
            documents: [doc("d2", 2, true, "d1"), doc("d1", 1, false, null), bankBook],
            access: { write, writeSensitive: false, writeBankBook: write },
          },
        });
      if (path === "/employees/e1/documents/upload-url")
        return json(200, {
          data: {
            bucket: "employee-documents",
            path: "employees/e1/documents/x.pdf",
            token: "tok",
            signedUrl: "https://storage.test/x",
            maxBytes: 5 * 1024 * 1024,
          },
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
describe.skipIf(!FEATURES.archive)("Arsip › Data File (D-055)", () => {
  it("tabel dokumen + lencana masa berlaku; filter Masa berlaku dikirim ke API", async () => {
    const calls = mockFetch(me("SUPER_ADMIN", true));
    renderAt("/personal/arsip/file");
    const table = await screen.findByRole("table", { name: "Daftar data file" });
    expect(await within(table).findByText("SIMPER")).toBeInTheDocument();
    expect(within(table).getByText("20 hari lagi")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Jenis dokumen" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("combobox", { name: "Masa berlaku" }));
    await userEvent.click(await screen.findByRole("option", { name: "Kedaluwarsa" }));
    await waitFor(() =>
      expect(
        calls.some((c) => c.path === "/archive/documents" && c.search.includes("expiry=EXPIRED")),
      ).toBe(true),
    );
  });
});

describe("Detail karyawan › tab Dokumen", () => {
  it("versi aktif + versi sebelumnya; unggah: kedaluwarsa wajib, terisi otomatis dari tanggal terbit", async () => {
    const calls = mockFetch(me("HR_ADMIN"));
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1&tab=documents");
    const panel = await screen.findByRole("tabpanel");
    expect(await within(panel).findByText("SIMPER")).toBeInTheDocument();
    expect(within(panel).getByText("Versi 2")).toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: /Versi sebelumnya \(1\)/ }),
    ).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole("button", { name: /Unggah dokumen/ }));
    const dialog = await screen.findByRole("dialog", { name: "Unggah dokumen" });
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Jenis dokumen" }));
    await userEvent.click(await screen.findByRole("option", { name: /SIMPER/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: /Unggah/ }));
    expect(await within(dialog).findByText("Pilih file dokumen.")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Tanggal kedaluwarsa wajib untuk jenis dokumen ini."),
    ).toBeInTheDocument();

    const file = new File(["%PDF"], "simper.pdf", { type: "application/pdf" });
    await userEvent.upload(within(dialog).getByLabelText("File"), file);
    await userEvent.type(within(dialog).getByLabelText(/Tanggal terbit/), "2026-01-31");
    expect(within(dialog).getByLabelText(/Berlaku sampai/)).toHaveValue("2027-01-31");
    await userEvent.type(within(dialog).getByLabelText(/Nomor dokumen/), "SMP-3");
    await userEvent.click(within(dialog).getByRole("button", { name: /Unggah/ }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.method === "POST" && c.path === "/employees/e1/documents")?.body,
      ).toMatchObject({
        documentTypeId: SIMPER_ID,
        documentNumber: "SMP-3",
        issuedAt: "2026-01-31",
        expiresAt: "2027-01-31",
        path: "employees/e1/documents/x.pdf",
      }),
    );
    expect(supabaseMock.storageUpload).toHaveBeenCalledWith(
      "employees/e1/documents/x.pdf",
      "tok",
      file,
      { contentType: "application/pdf" },
    );
  });

  it("MANAGER (tanpa hak tulis): tanpa tombol unggah & menu aksi", async () => {
    mockFetch(me("MANAGER", false, "e-mgr"), false);
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1&tab=documents");
    const panel = await screen.findByRole("tabpanel");
    expect(await within(panel).findByText("SIMPER")).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /Unggah dokumen/ })).toBeNull();
    expect(within(panel).queryByRole("button", { name: /Aksi untuk SIMPER/ })).toBeNull();
    expect(within(panel).getByRole("button", { name: /Lihat SIMPER/ })).toBeInTheDocument();
  });
});

describe("Detail karyawan › tab Rekening: buku tabungan", () => {
  it("HR ber-grant rekening: rekening + buku tabungan (lihat, ganti versi)", async () => {
    mockFetch(me("HR_ADMIN"));
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1&tab=bank");
    const panel = await screen.findByRole("tabpanel");
    expect(await within(panel).findByText("1111222233")).toBeInTheDocument();
    const book = await within(panel).findByRole("region", { name: "Buku tabungan" });
    expect(within(book).getByRole("button", { name: /Lihat Buku tabungan/ })).toBeInTheDocument();
    await userEvent.click(within(book).getByRole("button", { name: /Aksi untuk Buku tabungan/ }));
    expect(await screen.findByRole("menuitem", { name: /Unggah versi baru/ })).toBeInTheDocument();
  });

  it("tanpa hak tulis: buku tabungan hanya bisa dilihat", async () => {
    mockFetch(me("MANAGER", false, "e-mgr"), false);
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1&tab=bank");
    const book = await screen.findByRole("region", { name: "Buku tabungan" });
    expect(
      await within(book).findByRole("button", { name: /Lihat Buku tabungan/ }),
    ).toBeInTheDocument();
    expect(within(book).queryByRole("button", { name: /Aksi untuk/ })).toBeNull();
  });
});

describe.skipIf(!FEATURES.archive)("Master Data › Jenis dokumen", () => {
  it("SA menambah jenis: kode huruf besar, pengingat diurutkan", async () => {
    const calls = mockFetch(me("SUPER_ADMIN", true));
    renderAt("/master-data/jenis-dokumen");
    const table = await screen.findByRole("table", { name: "Daftar jenis dokumen" });
    expect(await within(table).findByText("12 bulan")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Tambah jenis/ }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah jenis dokumen" });
    await userEvent.type(within(dialog).getByLabelText("Kode"), "sio_kemnaker");
    await userEvent.type(within(dialog).getByLabelText("Nama"), "SIO Kemnaker");
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Kategori" }));
    await userEvent.click(await screen.findByRole("option", { name: "Kompetensi & sertifikat" }));
    await userEvent.click(within(dialog).getByLabelText(/Punya masa berlaku/));
    await userEvent.clear(within(dialog).getByLabelText(/Pengingat/));
    await userEvent.type(within(dialog).getByLabelText(/Pengingat/), "7, 90");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.method === "POST" && c.path === "/document-types")?.body,
      ).toMatchObject({
        code: "SIO_KEMNAKER",
        name: "SIO Kemnaker",
        category: "COMPETENCY",
        hasExpiry: true,
        reminderDays: [7, 90],
      }),
    );
  });

  it("HR hanya melihat (tanpa tombol tambah)", async () => {
    mockFetch(me("HR_ADMIN"));
    renderAt("/master-data/jenis-dokumen");
    await screen.findByRole("table", { name: "Daftar jenis dokumen" });
    expect(screen.queryByRole("button", { name: /Tambah jenis/ })).toBeNull();
    expect(screen.getByText(/Hanya Super Admin/)).toBeInTheDocument();
  });
});
