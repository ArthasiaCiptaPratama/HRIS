import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/app/feature-flags";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// D-054 (Arsip gelombang 1a): menu Arsip (tabel lintas karyawan) + kelola item di detail karyawan.
const employeeRef = {
  id: "e1",
  fullName: "Agus Pratama",
  employeeNumber: "ACP-2023-0007",
  isActive: true,
  company: { id: "co-acp", code: "ACP" },
  department: { id: "d1", name: "Human Resources & GA" },
  position: { id: "p1", name: "GA Staff" },
  photoUrl: null,
};
const trainingRow = (cost: boolean) => ({
  id: "t1",
  employee: employeeRef,
  trainingField: "Ahli K3 Umum",
  organizer: "Lembaga Uji",
  type: "EXTERNAL",
  startDate: "2025-03-01",
  endDate: "2025-03-05",
  hours: 40,
  trainingYear: 2025,
  duration: null,
  ...(cost ? { cost: 2500000 } : {}),
});
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
  position: { id: "p1", name: "GA Staff" },
  department: { id: "d1", name: "Human Resources & GA" },
  workLocation: null,
  grade: null,
  manager: null,
  photoUrl: null,
  emergencyPhone: null,
  emergencyContactName: null,
  emergencyContactRelationship: null,
  account: null,
  access: {
    manage: true,
    deactivate: true,
    personal: false,
    bank: false,
    print: false,
    photo: false,
  },
  educations: [],
  trainings: [],
  workExperiences: [],
  histories: [
    {
      id: "h1",
      changeType: "HIRED",
      effectiveDate: "2023-08-01",
      fromStatus: null,
      toStatus: { id: "s1", name: "PKWT" },
      fromPosition: null,
      toPosition: { id: "p1", name: "GA Staff" },
      fromCompany: null,
      toCompany: null,
      exitReason: null,
      note: null,
      source: "SYSTEM",
      movementType: null,
      decreeNumber: null,
      toPositionName: null,
      toDepartmentName: null,
      changedBy: null,
      createdAt: "2023-08-01T03:00:00.000Z",
    },
  ],
};

type Call = { method: string; path: string; search: string; body: unknown };
function mockFetch(role: ReturnType<typeof me>, cost = true) {
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
            departments: [
              { id: "d1", name: "Human Resources & GA", parentId: null, unitType: "DEPARTMENT" },
            ],
            positions: [{ id: "p1", name: "GA Staff", departmentId: "d1", level: null }],
            employmentStatuses: [],
            grades: [],
            workLocations: [],
          },
        });
      if (path === "/employees/summary")
        return json(200, {
          data: {
            active: { total: 1, byCategory: {}, uncategorized: 0 },
            inactive: 0,
          },
        });
      if (path === "/archive/trainings")
        return json(200, { data: [trainingRow(cost)], meta: { page: 1, pageSize: 20, total: 1 } });
      if (path === "/archive/trainings/export")
        return json(200, {
          data: {
            fileName: "arsip-trainings-semua-pt-2026-10-08.xlsx",
            rows: 1,
            contentBase64: "UEs=",
          },
        });
      if (path === "/employees/e1") return json(200, { data: detail });
      if (method === "POST") return json(201, { data: { id: "new-1" } });
      if (method === "PATCH") return json(200, { data: { id: "h1" } });
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
describe.skipIf(!FEATURES.archive)("Arsip › Data Pelatihan (D-054)", () => {
  it("SA: tabel + kolom Biaya (Rupiah), filter Jenis; klik baris → detail di tab Pendidikan", async () => {
    const calls = mockFetch(me("SUPER_ADMIN", true));
    renderAt("/personal/arsip/pelatihan");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Data Pelatihan" }),
    ).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "Daftar data pelatihan" });
    expect(await within(table).findByText("Ahli K3 Umum")).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Biaya" })).toBeInTheDocument();
    expect(within(table).getByText(/Rp 2\.500\.000/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Jenis" })).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/archive/trainings")?.search).toContain(
      "employees=active",
    );
    await userEvent.click(within(table).getByText("Ahli K3 Umum"));
    const tab = await screen.findByRole("tab", { name: /Pendidikan/ });
    expect(tab).toHaveAttribute("aria-selected", "true");
  });

  it("D-058: Ekspor Excel mengirim filter tabel (tanpa halaman) lalu mengunduh file", async () => {
    const calls = mockFetch(me("SUPER_ADMIN", true));
    const createObjectURL = vi.fn(() => "blob:x");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderAt("/personal/arsip/pelatihan");
    await screen.findByRole("table", { name: "Daftar data pelatihan" });
    await userEvent.click(screen.getByRole("button", { name: /Ekspor Excel/ }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    const request = calls.find((c) => c.path === "/archive/trainings/export");
    expect(request?.search).toContain("employees=active");
    expect(request?.search).not.toContain("page");
    expect(createObjectURL).toHaveBeenCalled();
    click.mockRestore();
  });

  it("MANAGER: tanpa kolom Biaya", async () => {
    mockFetch(me("MANAGER", false, "e-mgr"), false);
    renderAt("/personal/arsip/pelatihan");
    const table = await screen.findByRole("table", { name: "Daftar data pelatihan" });
    await within(table).findByText("Ahli K3 Umum");
    expect(within(table).queryByRole("columnheader", { name: "Biaya" })).toBeNull();
    // D-058: ekspor hanya SA/HR.
    expect(screen.queryByRole("button", { name: /Ekspor Excel/ })).toBeNull();
  });

  it("menu Arsip yang belum dikerjakan (Aset) tetap Maintenance", async () => {
    mockFetch(me("SUPER_ADMIN", true));
    renderAt("/personal/arsip/aset");
    expect(await screen.findByRole("heading", { name: /sedang disiapkan/ })).toBeInTheDocument();
  });
});

describe.skipIf(!FEATURES.archive)("Detail karyawan: kelola item Arsip (SA/HR)", () => {
  it("tambah pendidikan → POST /employees/e1/educations dengan body tervalidasi", async () => {
    const calls = mockFetch(me("SUPER_ADMIN", true));
    renderAt("/personal/arsip/pelatihan?pegawai=e1&tab=education");
    const region = await screen.findByRole("tabpanel");
    const educationTitle = await within(region).findByText("Pendidikan");
    const section = educationTitle.closest("section") as HTMLElement;
    await userEvent.click(within(section).getByRole("button", { name: /Tambah/ }));
    const dialog = await screen.findByRole("dialog", { name: "Tambah pendidikan" });
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Jenjang" }));
    await userEvent.click(await screen.findByRole("option", { name: "S1" }));
    await userEvent.type(
      within(dialog).getByLabelText("Nama sekolah / kampus"),
      "Universitas Contoh",
    );
    await userEvent.type(within(dialog).getByLabelText(/Tahun lulus/), "2020");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.method === "POST" && c.path === "/employees/e1/educations")?.body,
      ).toEqual({
        level: "S1",
        schoolName: "Universitas Contoh",
        major: null,
        graduationYear: 2020,
      }),
    );
  });

  it("riwayat: tambah riwayat jabatan lama (teks) & lengkapi no. SK riwayat otomatis", async () => {
    const calls = mockFetch(me("HR_ADMIN"));
    renderAt("/personal/arsip/pelatihan?pegawai=e1&tab=history");
    await userEvent.click(
      await screen.findByRole("button", { name: /Tambah riwayat jabatan lama/ }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Tambah riwayat jabatan lama" });
    await userEvent.type(within(dialog).getByLabelText("Tanggal efektif"), "2019-07-01");
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Jenis perpindahan" }));
    await userEvent.click(await screen.findByRole("option", { name: "Promosi" }));
    await userEvent.type(within(dialog).getByLabelText(/Atau nama jabatan lama/), "Foreman Lama");
    await userEvent.type(within(dialog).getByLabelText(/No. SK/), "SK/07/2019");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.method === "POST" && c.path === "/employees/e1/position-histories")
          ?.body,
      ).toMatchObject({
        effectiveDate: "2019-07-01",
        movementType: "PROMOTION",
        toPositionName: "Foreman Lama",
        decreeNumber: "SK/07/2019",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /riwayat/ })).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Aksi untuk Mulai bekerja" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Ubah" }));
    const meta = await screen.findByRole("dialog", { name: "Lengkapi keterangan riwayat" });
    expect(within(meta).queryByLabelText("Tanggal efektif")).toBeNull();
    await userEvent.type(within(meta).getByLabelText(/No. SK/), "SK/08/2023");
    await userEvent.click(within(meta).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.method === "PATCH" && c.path === "/employees/e1/position-histories/h1")
          ?.body,
      ).toEqual({ movementType: null, decreeNumber: "SK/08/2023", note: null }),
    );
    // Riwayat otomatis tidak bisa dihapus (menu tanpa Hapus).
    await userEvent.click(screen.getByRole("button", { name: "Aksi untuk Mulai bekerja" }));
    expect(await screen.findByRole("menuitem", { name: "Ubah" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Hapus" })).toBeNull();
  });
});
