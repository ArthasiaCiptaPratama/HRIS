import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authState, me, renderAt, supabaseMock } from "./helpers";

// Canvas tidak ada di jsdom: kompres foto diganti blob tetap.
vi.mock("@/lib/image", async (original) => ({
  ...(await original<typeof import("@/lib/image")>()),
  prepareProfilePhoto: vi.fn(async () => ({
    blob: new Blob(["webp"], { type: "image/webp" }),
    contentType: "image/webp",
  })),
}));

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// Panel detail pegawai: layar penuh, avatar di tengah, riwayat "diubah oleh", tombol Print data.

let photoUrl: string | null = null;
let accountOverride: { role: string; isActive: boolean } | null = null;
// EMP-D6: homebase (POH) — hanya diisi test homebase; respons POST riwayat bisa diganti (mis. 409).
const HB1 = "00000000-0000-4000-8000-0000000000b1";
const HB2 = "00000000-0000-4000-8000-0000000000b2";
let homebaseData: Record<string, unknown> = {};
let homebasePost: { status: number; body: unknown } | null = null;
// PATCH /employees/e1 menyimpan No. HP → GET berikutnya mengembalikan objek baru (seperti server).
let savedPhone: string | null = null;
const detail = (access: Record<string, boolean>, full = false) => ({
  id: "e1",
  employeeNumber: "ACP-2023-0007",
  fullName: "Agus Pratama",
  workEmail: null,
  phoneNumber: savedPhone ?? "081200000007",
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
  photoUrl,
  ...homebaseData,
  emergencyPhone: null,
  emergencyContactName: null,
  emergencyContactRelationship: null,
  account: accountOverride,
  access: {
    manage: false,
    deactivate: false,
    personal: false,
    bank: false,
    print: false,
    photo: false,
    ...access,
  },
  // Seperti API: data sensitif hanya di view=full (panel memakai view=work).
  ...(access.personal && full
    ? {
        personal: {
          ktpNumber: "3200000000000001",
          npwpNumber: null,
          kkNumber: null,
          birthPlace: "Bandung",
          birthDate: "1990-01-02",
          ktpAddress: null,
          domicileAddress: "Jl. Lama 1",
          maritalStatus: "MARRIED",
          religion: "ISLAM",
          bpjsEmploymentNumber: null,
          bpjsHealthNumber: null,
          ptkpStatus: "K1",
          originCity: null,
          drivingLicenseTypes: ["C"],
          drivingLicenseNumbers: { C: "SIM-C-1" },
        },
        familyMembers: [
          {
            id: "f1",
            name: "Siti",
            relationship: "SPOUSE",
            address: null,
            birthDate: null,
            phoneNumber: "081200009999",
            education: "S1",
          },
        ],
      }
    : {}),
  educations: [],
  trainings: [],
  histories: [
    {
      id: "h2",
      changeType: "STATUS_CHANGED",
      effectiveDate: "2026-09-15",
      fromStatus: { id: "s0", name: "Magang" },
      toStatus: { id: "s1", name: "PKWT" },
      fromPosition: null,
      toPosition: null,
      fromCompany: null,
      toCompany: null,
      exitReason: null,
      note: null,
      changedBy: { name: "Siti Rahmawati", role: "HR_ADMIN", workLocation: "Kantor Pusat Jakarta" },
      createdAt: "2026-09-15T03:00:00.000Z",
    },
    {
      id: "h1",
      changeType: "HIRED",
      effectiveDate: "2023-08-01",
      fromStatus: null,
      toStatus: { id: "s0", name: "Magang" },
      fromPosition: null,
      toPosition: { id: "p1", name: "GA Staff" },
      fromCompany: null,
      toCompany: null,
      exitReason: null,
      note: null,
      changedBy: null,
      createdAt: "2023-08-01T03:00:00.000Z",
    },
  ],
});

// EMP-D5: perubahan data per field (satu kelompok = satu simpan).
const fieldChanges = [
  {
    id: "c1",
    groupId: "g1",
    occurredAt: "2026-11-12T03:00:00.000Z",
    source: "HR_FORM",
    section: "WORK",
    field: "position",
    oldValue: "GA Staff",
    newValue: "GA Supervisor",
    valueHidden: false,
    refId: null,
    changedBy: { name: "Budi Santoso", role: "SUPER_ADMIN", workLocation: null },
  },
  {
    id: "c2",
    groupId: "g2",
    occurredAt: "2026-11-11T03:00:00.000Z",
    source: "HR_PROFILE",
    section: "PERSONAL",
    field: "ktpNumber",
    oldValue: null,
    newValue: null,
    valueHidden: true,
    refId: null,
    changedBy: null,
  },
];

// EMP-D6: baris EMP-D5 tambahan per test; `pagedChanges` = dua halaman (pageSize 1) untuk uji "Muat lebih banyak".
let extraChanges: Record<string, unknown>[] = [];
let pagedChanges = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** fetch palsu yang membedakan query (?view=...). */
const sentBodies: Record<string, unknown> = {};

function mockBackend(
  role: Parameters<typeof me>[0],
  access: Record<string, boolean>,
  grants: string[] = [],
) {
  const calls: string[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = String(input);
    calls.push(`${init?.method ?? "GET"} ${raw}`);
    const url = new URL(raw);
    const key = url.pathname.replace("/api/v1", "");
    if (init?.body && typeof init.body === "string")
      sentBodies[`${init.method} ${key}`] = JSON.parse(init.body);
    if (key === "/me")
      return json(200, {
        data: {
          ...me(role, false, "e-self"),
          grants: grants.map((permission) => ({ permission, expiresAt: null })),
        },
      });
    if (key === "/employees/e1" && init?.method === "PATCH") {
      savedPhone = (JSON.parse(String(init.body)) as { phoneNumber: string | null }).phoneNumber;
      return json(200, { data: detail(access) });
    }
    if (key === "/employees/e1/profile" && init?.method === "PATCH")
      return json(200, { data: detail(access, true) });
    if (key === "/health")
      return json(200, { data: { status: "ok", checks: { database: "ok" }, time: "x" } });
    if (key === "/notifications")
      return json(200, { data: [], meta: { page: 1, pageSize: 5, total: 0, unreadCount: 0 } });
    if (key === "/employees/summary")
      return json(200, {
        data: {
          active: {
            total: 1,
            byCategory: {
              PERMANENT: 0,
              PROBATION: 0,
              PKWT: 1,
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
    if (key === "/master-data")
      return json(200, {
        data: {
          companies: [],
          departments: [],
          positions: [],
          employmentStatuses: [],
          grades: [],
          workLocations: [],
          homebases: [
            { id: HB1, name: "Palangka Raya", city: "Palangka Raya", province: "Kalteng" },
            { id: HB2, name: "Sampit", city: "Kotawaringin Timur", province: "Kalteng" },
          ],
        },
      });
    if (key === "/employees/e1/homebases" && init?.method === "POST") {
      const response = homebasePost ?? { status: 201, body: { data: null } };
      return json(response.status, response.body);
    }
    if (key === "/employees")
      return json(200, { data: [], meta: { page: 1, pageSize: 20, total: 0 } });
    if (key === "/employees/e1/field-changes") {
      const all = [...fieldChanges, ...extraChanges];
      if (pagedChanges) {
        const page = Number(url.searchParams.get("page") ?? 1);
        return json(200, {
          data: all.slice(page - 1, page),
          meta: { page, pageSize: 1, total: all.length, totalPages: all.length },
        });
      }
      return json(200, {
        data: all,
        meta: { page: 1, pageSize: 50, total: all.length, totalPages: 1 },
      });
    }
    if (key === "/employees/e1")
      return json(200, { data: detail(access, url.searchParams.get("view") === "full") });
    if (key === "/employees/e1/print")
      return json(200, {
        data: {
          fileName: "ACP-2023-0007-Agus-Pratama-data-karyawan.pdf",
          contentType: "application/pdf",
          contentBase64: btoa("%PDF-1.7"),
          photo: "none",
        },
      });
    if (key === "/employees/e1/photo/upload-url")
      return json(200, {
        data: {
          bucket: "employee-photos",
          path: "employees/e1/p.webp",
          token: "tok",
          signedUrl: "https://storage.test/u",
          maxBytes: 2097152,
        },
      });
    if (key === "/employees/e1/photo") {
      photoUrl = init?.method === "DELETE" ? null : "https://storage.test/sign/p.webp";
      return json(200, { data: { photoUrl } });
    }
    return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

beforeEach(() => {
  photoUrl = null;
  accountOverride = null;
  homebaseData = {};
  homebasePost = null;
  savedPhone = null;
  extraChanges = [];
  pagedChanges = false;
  delete sentBodies["POST /employees/e1/homebases"];
  delete sentBodies["PATCH /employees/e1"];
  authState.session = { access_token: "t", user: { id: "u" } };
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("panel detail pegawai", () => {
  it("layar penuh; header template profil (pas foto + Label : nilai, tombol sejajar info); riwayat menampilkan pengubah", async () => {
    mockBackend("HR_ADMIN", { manage: true, deactivate: true, print: true });
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("heading", { name: "Agus Pratama" })).toBeVisible();
    expect(dialog.className).toContain("sm:max-w-none");
    const header = dialog.querySelector("header") as HTMLElement;
    for (const label of [
      "Nama Karyawan",
      "Nomor Induk Pegawai",
      "Jabatan",
      "Divisi",
      "Departemen",
      "Level",
      "Tanggal Masuk",
      "Masa Kerja",
      "Status Karyawan",
      "Akses Aplikasi",
    ]) {
      expect(within(header).getByText(label)).toBeInTheDocument();
    }
    // Tombol aksi berada di kolom info (sejajar blok data), bukan di bawah foto.
    const edit = within(header).getByRole("button", { name: /Ubah data/ });
    expect(edit.closest("div.flex-1")).toContainElement(within(header).getByText("Nama Karyawan"));

    await userEvent.click(within(dialog).getByRole("tab", { name: /Riwayat/ }));
    const history = within(dialog).getByRole("tabpanel");
    expect(within(history).getByText("Siti Rahmawati")).toBeInTheDocument();
    expect(within(history).getByText("HR Admin")).toBeInTheDocument();
    // Lokasi kerja pengubah di tooltip nama (meta satu baris).
    expect(within(history).getAllByTitle("Kantor Pusat Jakarta").length).toBeGreaterThan(0);
    expect(within(history).getAllByText(/sistem \(data awal\/impor\)/).length).toBeGreaterThan(0);

    // EMP-D5: timeline gabungan per bulan — diff "label  lama → baru" + nilai tersembunyi tanpa nilai.
    const dd = (text: string) => within(history).queryByText(text, { selector: "dd *" });
    const position = (await within(history).findByText("GA Supervisor", { selector: "dd *" }))
      .parentElement as HTMLElement;
    expect(position).toHaveTextContent(/^GA Staff.*GA Supervisor$/);
    expect(position.previousElementSibling).toHaveTextContent("Jabatan");
    expect(within(history).getByText("NIK KTP")).toBeInTheDocument();
    expect(within(history).getByText("nilai disembunyikan")).toBeInTheDocument();
    // Filter segmented ber-jumlah: Data pribadi hanya bagian pribadi; Kepegawaian hanya peristiwa kepegawaian.
    const filters = within(history).getByRole("group", { name: "Filter riwayat" });
    expect(within(filters).getByRole("button", { name: /^Semua\s*\d+/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(within(filters).getByRole("button", { name: /^Data pribadi/ }));
    expect(dd("GA Supervisor")).not.toBeInTheDocument();
    expect(within(history).getByText("NIK KTP")).toBeInTheDocument();
    await userEvent.click(within(filters).getByRole("button", { name: /^Rekening/ }));
    expect(within(history).getByText("Belum ada perubahan rekening.")).toBeInTheDocument();
    await userEvent.click(within(filters).getByRole("button", { name: /^Kepegawaian/ }));
    expect(within(history).queryByText("NIK KTP")).not.toBeInTheDocument();
    expect(dd("PKWT")?.parentElement).toHaveTextContent(/^Magang.*PKWT$/);
  });

  it("tombol Kembali (panah kiri) di kiri atas, ikut tergulir (bukan di bar tab), menutup panel; tanpa tombol X", async () => {
    mockBackend("HR_ADMIN", { manage: true, print: true });
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { name: "Agus Pratama" });
    expect(within(dialog).queryByRole("button", { name: "Tutup" })).not.toBeInTheDocument();
    // Hanya satu tombol Kembali, di kiri atas (posisi asli, berlabel) di dalam area gulir: ikut tergulir
    // bersama banner sehingga tidak menimpa bar tab yang menempel (permintaan pemilik 2026-11-13).
    const back = within(dialog).getByRole("button", { name: "Kembali" });
    expect(back).toHaveTextContent("Kembali");
    expect(back.className).toContain("absolute");
    const scroller = back.parentElement as HTMLElement;
    expect(scroller.className).toContain("overflow-y-auto");
    expect(scroller.className).toContain("relative");
    const bar = within(dialog).getByRole("tablist").parentElement as HTMLElement;
    expect(bar.className).toContain("sticky");
    expect(bar).not.toContainElement(back);
    // Teks & panah hitam tebal supaya mudah terlihat (bukan abu-abu).
    expect(back.className).toContain("text-foreground");
    expect(back.className).toContain("font-semibold");
    expect(back.className).not.toContain("text-muted-foreground");
    expect(back.querySelector("svg.lucide-arrow-left")).not.toBeNull();
    await userEvent.click(back);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("HR: Print data → unduh PDF Formulir Data Karyawan dari /employees/:id/print", async () => {
    const calls = mockBackend("HR_ADMIN", { manage: true, deactivate: true, print: true });
    const createObjectURL = vi.fn((_blob: Blob) => "blob:pdf");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const success = vi.spyOn(toast, "success");
    const clicked: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.download);
    });

    renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(await within(dialog).findByRole("button", { name: /Print data/ }));

    await waitFor(() => expect(clicked).toEqual(["ACP-2023-0007-Agus-Pratama-data-karyawan.pdf"]));
    expect(calls.some((c) => c.endsWith("/employees/e1/print"))).toBe(true);
    expect(calls.some((c) => c.includes("view=print"))).toBe(false);
    expect(createObjectURL.mock.calls[0]?.[0]?.type).toBe("application/pdf");
    await waitFor(() =>
      expect(success).toHaveBeenCalledWith(
        "ACP-2023-0007-Agus-Pratama-data-karyawan.pdf diunduh.",
        expect.objectContaining({ description: expect.stringContaining("dikosongkan") }),
      ),
    );
    // Formulir Aplikasi Word dihapus (2026-10-19): hanya satu tombol cetak.
    expect(
      within(dialog).queryByRole("button", { name: /Formulir Aplikasi/ }),
    ).not.toBeInTheDocument();
    click.mockRestore();
  });

  it("HR Kepegawaian (IAM-D1): hanya tab Kepegawaian & Riwayat; tanpa Ubah data / Print", async () => {
    mockBackend("HR_PERSONNEL", {});
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { name: "Agus Pratama" });
    expect(within(dialog).getByRole("tab", { name: /Kepegawaian/ })).toBeInTheDocument();
    expect(within(dialog).getByRole("tab", { name: /Riwayat/ })).toBeInTheDocument();
    for (const name of [/Pribadi/, /Keluarga/, /Pendidikan/, /Dokumen/, /Rekening/, /Aset/]) {
      expect(within(dialog).queryByRole("tab", { name })).not.toBeInTheDocument();
    }
    expect(within(dialog).queryByRole("button", { name: /Print data/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Ubah data/ })).not.toBeInTheDocument();
  });

  it("MANAGER (tanpa hak print): tombol Print data & Ubah data tidak tampil", async () => {
    mockBackend("MANAGER", {});
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { name: "Agus Pratama" });
    expect(within(dialog).queryByRole("button", { name: /Print data/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Ubah data/ })).not.toBeInTheDocument();
  });
});

describe("form ubah karyawan & master data terarsip (D-049)", () => {
  it("jabatan/departemen yang sudah diarsipkan tetap tampil sebagai nilai terpilih", async () => {
    // Mock /master-data tidak memuat departemen & jabatan karyawan ini (= sudah diarsipkan).
    mockBackend("HR_ADMIN", { manage: true });
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const detailDialog = await screen.findByRole("dialog");
    await userEvent.click(await within(detailDialog).findByRole("button", { name: /Ubah data/ }));
    // Radix Select merender nilai terpilih + <option> tersembunyi → bisa lebih dari satu.
    expect((await screen.findAllByText("GA Staff (diarsipkan)")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Human Resources & GA (diarsipkan)").length).toBeGreaterThan(0);
  });
});

describe("Ubah data bertab: pribadi, keluarga, rekening (EMP-D4)", () => {
  it("HR ber-grant: ubah tempat lahir → hanya PATCH /profile bagian pribadi; keluarga & SIM tetap utuh", async () => {
    const calls = mockBackend("HR_ADMIN", { manage: true, personal: true }, [
      "employee.personal.read",
      "employee.personal.write",
    ]);
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const sheet = await screen.findByRole("dialog");
    await userEvent.click(await within(sheet).findByRole("button", { name: /Ubah data/ }));
    const form = await screen.findByRole("dialog", { name: "Ubah data karyawan" });
    await userEvent.click(within(form).getByRole("tab", { name: /Pribadi & alamat/ }));
    const place = within(form).getByLabelText(/Tempat lahir/);
    expect(place).toHaveValue("Bandung");
    await userEvent.clear(place);
    await userEvent.type(place, "Garut");
    // Rekening terkunci (tanpa grant bank).
    await userEvent.click(within(form).getByRole("tab", { name: /Rekening/ }));
    expect(within(form).getByText(/employee\.bank\.read\/write/)).toBeInTheDocument();
    await userEvent.click(within(form).getByRole("button", { name: "Simpan perubahan" }));
    await waitFor(() =>
      expect(calls).toContain("PATCH http://api.test/api/v1/employees/e1/profile"),
    );
    expect(calls).not.toContain("PATCH http://api.test/api/v1/employees/e1");
    const body = sentBodies["PATCH /employees/e1/profile"] as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["personal"]);
    expect(body.personal).toMatchObject({
      birthPlace: "Garut",
      ktpNumber: "3200000000000001",
      ptkpStatus: "K1",
      drivingLicenses: [{ type: "C", number: "SIM-C-1" }],
    });
  });

  it("HR tanpa grant: tab Pribadi & Keluarga terkunci, form tidak tampil", async () => {
    mockBackend("HR_ADMIN", { manage: true });
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const sheet = await screen.findByRole("dialog");
    await userEvent.click(await within(sheet).findByRole("button", { name: /Ubah data/ }));
    const form = await screen.findByRole("dialog", { name: "Ubah data karyawan" });
    await userEvent.click(within(form).getByRole("tab", { name: /Keluarga/ }));
    expect(within(form).getByText(/employee\.personal\.read\/write/)).toBeInTheDocument();
    expect(within(form).queryByLabelText(/Nama \/ Name/)).not.toBeInTheDocument();
  });
});

describe("foto profil di panel detail (D-037)", () => {
  it("HR: unggah foto → minta URL, unggah ke Storage dengan token, konfirmasi; foto tampil", async () => {
    const calls = mockBackend("HR_ADMIN", { manage: true, print: true, photo: true });
    const success = vi.spyOn(toast, "success");
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Unggah foto profil" }),
    );
    await userEvent.click(await screen.findByRole("menuitem", { name: /Unggah foto/ }));
    const file = new File(["x"], "foto.jpg", { type: "image/jpeg" });
    await userEvent.upload(within(dialog).getByLabelText("Pilih file foto profil"), file);

    await waitFor(() =>
      expect(success).toHaveBeenCalledWith("Foto profil diperbarui.", expect.anything()),
    );
    expect(calls).toContain("POST http://api.test/api/v1/employees/e1/photo/upload-url");
    expect(calls).toContain("POST http://api.test/api/v1/employees/e1/photo");
    expect(supabaseMock.storage.from).toHaveBeenCalledWith("employee-photos");
    expect(supabaseMock.storageUpload).toHaveBeenCalledWith(
      "employees/e1/p.webp",
      "tok",
      expect.any(Blob),
      { contentType: "image/webp" },
    );
    // Setelah invalidasi, detail dimuat ulang dengan foto.
    await waitFor(() =>
      expect(dialog.querySelector('img[src="https://storage.test/sign/p.webp"]')).not.toBeNull(),
    );
  });

  it("hapus foto lewat konfirmasi → DELETE; avatar kembali ke inisial", async () => {
    photoUrl = "https://storage.test/sign/lama.webp";
    const calls = mockBackend("HR_ADMIN", { manage: true, photo: true });
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Ganti atau hapus foto profil" }),
    );
    await userEvent.click(await screen.findByRole("menuitem", { name: /Hapus foto/ }));
    const confirm = await screen.findByRole("dialog", { name: "Hapus foto profil?" });
    await userEvent.click(within(confirm).getByRole("button", { name: /Hapus foto/ }));
    await waitFor(() =>
      expect(calls).toContain("DELETE http://api.test/api/v1/employees/e1/photo"),
    );
    await waitFor(() => expect(dialog.querySelector("img")).toBeNull());
  });

  it("status karyawan (masih bekerja) & akses aplikasi (bisa login) terpisah (2026-10-15)", async () => {
    mockBackend("HR_ADMIN", { manage: true });
    const view = renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const dialog = await screen.findByRole("dialog");
    const header = (await within(dialog).findByText("Status Karyawan")).closest(
      "header",
    ) as HTMLElement;
    const row = (label: string) => within(header).getByText(label).parentElement as HTMLElement;
    expect(row("Status Karyawan")).toHaveTextContent(/PKWT\s*\|\s*Masih bekerja/);
    // Dua keadaan saja: belum punya akun = tidak bisa login (sebab di tooltip).
    expect(within(row("Akses Aplikasi")).getByText("Tidak bisa login")).toBeInTheDocument();
    expect(within(row("Akses Aplikasi")).getByTitle("Belum punya akun login")).toBeInTheDocument();
    view.unmount();
    accountOverride = { role: "EMPLOYEE", isActive: false };
    mockBackend("HR_ADMIN", { manage: true });
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const again = await screen.findByRole("dialog");
    const status = (await within(again).findByText("Akses Aplikasi")).parentElement as HTMLElement;
    expect(within(status).getByText("Tidak bisa login")).toBeInTheDocument();
    expect(within(status).getByTitle("Akun login dinonaktifkan")).toBeInTheDocument();
    // Peran akun tidak ditampilkan di baris ini (ada di tab Kepegawaian › Akun login).
    expect(within(status).queryByText("Karyawan")).toBeNull();
  });

  it("klik foto membuka pop-up foto besar; tombol kamera tidak membuka pop-up; tanpa foto tidak bisa diklik", async () => {
    photoUrl = "https://storage.test/sign/besar.webp";
    mockBackend("HR_ADMIN", { manage: true, photo: true });
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Ganti atau hapus foto profil" }),
    );
    expect(await screen.findByRole("menuitem", { name: /Ganti foto/ })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Foto profil Agus Pratama" })).toBeNull();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Perbesar foto Agus Pratama" }),
    );
    const zoom = (await screen.findByRole("img", { name: "Foto profil Agus Pratama" })).closest(
      "[role=dialog]",
    ) as HTMLElement;
    expect(within(zoom).getByRole("img", { name: "Foto profil Agus Pratama" })).toHaveAttribute(
      "src",
      "https://storage.test/sign/besar.webp",
    );
    expect(within(zoom).getByText("ACP-2023-0007")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("img", { name: "Foto profil Agus Pratama" })).toBeNull(),
    );
    // Panel detail tetap terbuka (Esc hanya menutup pop-up foto).
    expect(within(dialog).getByText("Status Karyawan")).toBeInTheDocument();
  });

  it("tanpa foto: area foto bukan tombol perbesar", async () => {
    mockBackend("HR_ADMIN", { manage: true, photo: true });
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { name: "Agus Pratama" });
    expect(within(dialog).queryByRole("button", { name: /Perbesar foto/ })).toBeNull();
  });

  it("tanpa hak ubah foto (MANAGER): tidak ada tombol kamera", async () => {
    mockBackend("MANAGER", {});
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { name: "Agus Pratama" });
    expect(within(dialog).queryByRole("button", { name: /foto profil/ })).not.toBeInTheDocument();
  });
});

describe("Homebase / POH di detail (EMP-D6)", () => {
  const withHomebase = () => {
    homebaseData = {
      homebase: { id: HB1, name: "Palangka Raya" },
      homebases: [
        {
          id: "00000000-0000-4000-8000-0000000000e2",
          homebase: { id: HB1, name: "Palangka Raya", city: "Palangka Raya", province: "Kalteng" },
          effectiveFrom: "2025-01-01",
          decreeNumber: "SK/HB/01",
          note: "Pindah domisili rekrut",
          changedBy: { name: "Siti Rahmawati", role: "HR_ADMIN", workLocation: "Kantor Pusat" },
          createdAt: "2025-01-02T03:00:00.000Z",
        },
        {
          id: "00000000-0000-4000-8000-0000000000e1",
          homebase: { id: HB2, name: "Sampit", city: null, province: null },
          effectiveFrom: "2023-08-01",
          decreeNumber: null,
          note: null,
          changedBy: null,
          createdAt: "2023-08-01T03:00:00.000Z",
        },
      ],
    };
  };

  /** Buka Ubah data → pilih homebase lain (Sampit) di tab Kepegawaian. */
  const pickHomebaseInForm = async () => {
    const sheet = await screen.findByRole("dialog");
    await userEvent.click(await within(sheet).findByRole("button", { name: /Ubah data/ }));
    const form = await screen.findByRole("dialog", { name: "Ubah data karyawan" });
    expect(within(form).queryByLabelText("Homebase berlaku mulai")).not.toBeInTheDocument();
    await userEvent.click(within(form).getByRole("combobox", { name: /Homebase \(POH\)/ }));
    await userEvent.click(await screen.findByRole("option", { name: /Sampit/ }));
    return form;
  };

  /** Buka tab Riwayat → panel + grup filter. */
  const openHistory = async (sheet: HTMLElement) => {
    await userEvent.click(await within(sheet).findByRole("tab", { name: /Riwayat/ }));
    const panel = within(sheet).getByRole("tabpanel");
    return { panel, filters: within(panel).getByRole("group", { name: "Filter riwayat" }) };
  };

  it("tab Kepegawaian hanya homebase sekarang; riwayat homebase = entri timeline + segmen Homebase", async () => {
    withHomebase();
    mockBackend("HR_ADMIN", { manage: true });
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const sheet = await screen.findByRole("dialog");
    const field = (await within(sheet).findByText("Homebase (POH)")).closest("div") as HTMLElement;
    expect(field).toHaveTextContent("Palangka Raya");
    expect(within(sheet).queryByRole("button", { name: /Ubah homebase/ })).not.toBeInTheDocument();

    const { panel, filters } = await openHistory(sheet);
    // Tanpa kartu terpisah; entri homebase ikut timeline "Semua".
    expect(
      within(panel).queryByRole("region", { name: "Riwayat homebase" }),
    ).not.toBeInTheDocument();
    expect(await within(panel).findAllByText("Homebase diubah")).toHaveLength(2);
    await userEvent.click(within(filters).getByRole("button", { name: /^Homebase\s*2$/ }));
    expect(within(panel).getAllByText("Homebase diubah")).toHaveLength(2);
    expect(within(panel).queryByText("GA Supervisor")).not.toBeInTheDocument();
    expect(within(panel).getByText("Sekarang")).toBeInTheDocument();
    expect(within(panel).getByText("No. SK SK/HB/01")).toBeInTheDocument();
    expect(within(panel).getByText("Berlaku mulai 01 Jan 2025")).toBeInTheDocument();
    expect(within(panel).getByText("Pindah domisili rekrut")).toBeInTheDocument();
    expect(within(panel).getByText("Siti Rahmawati")).toBeInTheDocument();
    // Diff entri terbaru: Sampit → Palangka Raya.
    const latest = within(panel).getByText("Palangka Raya", { selector: "dd *" })
      .parentElement as HTMLElement;
    expect(latest).toHaveTextContent(/^Sampit.*Palangka Raya$/);
    expect(within(panel).getAllByRole("button", { name: /Aksi untuk homebase/ })).toHaveLength(2);
    // Data kerja tidak lagi memuat homebase.
    await userEvent.click(within(filters).getByRole("button", { name: /^Data kerja/ }));
    expect(within(panel).queryByText("Homebase diubah")).not.toBeInTheDocument();
  });

  it("tanpa duplikat: baris EMP-D5 homebase untuk entri yang ada disembunyikan; jejak hapus tetap tampil", async () => {
    withHomebase();
    extraChanges = [
      {
        id: "c3",
        groupId: "g3",
        occurredAt: "2025-01-02T03:00:00.000Z",
        source: "HR_FORM",
        section: "WORK",
        field: "homebase",
        oldValue: "Sampit (berlaku 01 Agu 2023)",
        newValue: "Palangka Raya (berlaku 01 Jan 2025)",
        valueHidden: false,
        refId: "00000000-0000-4000-8000-0000000000e2",
        changedBy: null,
      },
      {
        id: "c4",
        groupId: "g4",
        occurredAt: "2026-11-10T03:00:00.000Z",
        source: "HR_FORM",
        section: "WORK",
        field: "homebase",
        oldValue: "Katingan (berlaku 01 Mar 2026)",
        newValue: "Palangka Raya (berlaku 01 Jan 2025)",
        valueHidden: false,
        refId: "00000000-0000-4000-8000-0000000000e9",
        changedBy: null,
      },
    ];
    mockBackend("HR_ADMIN", { manage: true });
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const { panel, filters } = await openHistory(await screen.findByRole("dialog"));
    await userEvent.click(await within(filters).findByRole("button", { name: /^Homebase\s*3$/ }));
    expect(within(panel).getAllByText("Homebase diubah")).toHaveLength(2);
    expect(within(panel).getByText("Riwayat homebase dihapus")).toBeInTheDocument();
    expect(within(panel).getByText("Katingan (berlaku 01 Mar 2026)")).toBeInTheDocument();
    expect(within(panel).queryByText("Sampit (berlaku 01 Agu 2023)")).not.toBeInTheDocument();
    expect(within(filters).getByRole("button", { name: /^Data kerja\s*1$/ })).toBeInTheDocument();
  });

  it("Muat lebih banyak: entri homebase & kepegawaian lama baru tampil setelah halamannya dimuat", async () => {
    withHomebase();
    pagedChanges = true;
    mockBackend("HR_ADMIN", { manage: true });
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const { panel } = await openHistory(await screen.findByRole("dialog"));
    // Halaman 1 hanya baris 12 Nov 2026 → entri yang dicatat lebih awal belum ditampilkan.
    expect(
      await within(panel).findByText("GA Supervisor", { selector: "dd *" }),
    ).toBeInTheDocument();
    expect(within(panel).queryByText("Homebase diubah")).not.toBeInTheDocument();
    expect(within(panel).queryByText("Ubah status kepegawaian")).not.toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "Muat lebih banyak" }));
    expect(await within(panel).findAllByText("Homebase diubah")).toHaveLength(2);
    // Urutan menurut waktu dicatat: NIK (11 Nov 2026) sebelum homebase (Jan 2025).
    const order = within(panel)
      .getAllByText(/^(Data pribadi diubah|Homebase diubah)$/)
      .map((el) => el.textContent?.trim());
    expect(order).toEqual(["Data pribadi diubah", "Homebase diubahSekarang", "Homebase diubah"]);
  });

  it("Ubah data: ganti homebase → isian berlaku mulai + No. SK; POST riwayat, tanpa PATCH data kerja", async () => {
    withHomebase();
    homebasePost = {
      status: 201,
      body: {
        data: {
          id: "00000000-0000-4000-8000-0000000000e3",
          homebase: { id: HB2, name: "Sampit", city: null, province: null },
          effectiveFrom: "2026-10-01",
          decreeNumber: "SK/HB/02",
          note: null,
          changedBy: null,
          createdAt: "2026-10-01T03:00:00.000Z",
        },
      },
    };
    const calls = mockBackend("HR_ADMIN", { manage: true });
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const form = await pickHomebaseInForm();
    fireEvent.change(within(form).getByLabelText("Homebase berlaku mulai"), {
      target: { value: "2026-10-01" },
    });
    await userEvent.type(within(form).getByLabelText(/No\. SK homebase/), "SK/HB/02");
    await userEvent.click(within(form).getByRole("button", { name: "Simpan perubahan" }));
    await waitFor(() =>
      expect(sentBodies["POST /employees/e1/homebases"]).toEqual({
        homebaseId: HB2,
        effectiveFrom: "2026-10-01",
        decreeNumber: "SK/HB/02",
        note: null,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Ubah data karyawan" })).not.toBeInTheDocument(),
    );
    expect(calls).not.toContain("PATCH http://api.test/api/v1/employees/e1");
  });

  it("Ubah data: berlaku mulai masa depan ditolak di form tanpa memanggil API", async () => {
    withHomebase();
    mockBackend("HR_ADMIN", { manage: true });
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const form = await pickHomebaseInForm();
    fireEvent.change(within(form).getByLabelText("Homebase berlaku mulai"), {
      target: { value: "2999-01-01" },
    });
    await userEvent.click(within(form).getByRole("button", { name: "Simpan perubahan" }));
    expect(
      await within(form).findByText("Tanggal berlaku tidak boleh di masa depan."),
    ).toBeInTheDocument();
    expect(sentBodies["POST /employees/e1/homebases"]).toBeUndefined();
  });

  it("data lain tersimpan tapi homebase gagal (409): pesan jelas, refetch tidak me-reset isian", async () => {
    withHomebase();
    homebasePost = {
      status: 409,
      body: {
        error: {
          code: "CONFLICT",
          message: "Sudah ada homebase yang berlaku pada tanggal ini.",
          requestId: "r",
        },
      },
    };
    const calls = mockBackend("HR_ADMIN", { manage: true });
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const form = await pickHomebaseInForm();
    fireEvent.change(within(form).getByLabelText("Homebase berlaku mulai"), {
      target: { value: "2025-01-01" },
    });
    const phone = within(form).getByLabelText(/No\. HP/);
    await userEvent.clear(phone);
    await userEvent.type(phone, "081299999999");
    const detailGets = () =>
      calls.filter((c) => c.startsWith("GET http://api.test/api/v1/employees/e1?")).length;
    const before = detailGets();
    await userEvent.click(within(form).getByRole("button", { name: "Simpan perubahan" }));
    expect(
      await within(form).findByText(
        /Data lain sudah tersimpan, tetapi homebase gagal disimpan: Sudah ada homebase/,
      ),
    ).toBeInTheDocument();
    expect(sentBodies["PATCH /employees/e1"]).toMatchObject({ phoneNumber: "081299999999" });
    // PATCH sukses → detail dimuat ulang; dialog tetap terbuka dan isian tidak di-reset (temuan 2026-11-13).
    await waitFor(() => expect(detailGets()).toBeGreaterThan(before));
    expect(screen.getByRole("dialog", { name: "Ubah data karyawan" })).toBeInTheDocument();
    expect(within(form).getByLabelText(/No\. HP/)).toHaveValue("081299999999");
    expect(within(form).getByLabelText("Homebase berlaku mulai")).toHaveValue("2025-01-01");
  });

  it("non-pengelola (MANAGER): homebase terlihat, entri riwayat homebase tanpa aksi", async () => {
    withHomebase();
    mockBackend("MANAGER", {});
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const sheet = await screen.findByRole("dialog");
    await within(sheet).findByText("Homebase (POH)");
    expect(within(sheet).queryByRole("button", { name: /Ubah data/ })).not.toBeInTheDocument();
    const { panel } = await openHistory(sheet);
    expect(await within(panel).findAllByText("Homebase diubah")).toHaveLength(2);
    expect(
      within(sheet).queryByRole("button", { name: /Aksi untuk homebase/ }),
    ).not.toBeInTheDocument();
  });
});
