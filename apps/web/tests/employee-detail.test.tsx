import { screen, waitFor, within } from "@testing-library/react";
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
const detail = (access: Record<string, boolean>, full = false) => ({
  id: "e1",
  employeeNumber: "ACP-2023-0007",
  fullName: "Agus Pratama",
  workEmail: null,
  phoneNumber: "081200000007",
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
        },
      });
    if (key === "/employees")
      return json(200, { data: [], meta: { page: 1, pageSize: 20, total: 0 } });
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
    expect(within(history).getByText("Kantor Pusat Jakarta")).toBeInTheDocument();
    expect(within(history).getByText(/sistem \(data awal\/impor\)/)).toBeInTheDocument();
  });

  it("tombol Kembali (panah kiri) di kiri atas menutup panel; tanpa tombol X", async () => {
    mockBackend("HR_ADMIN", { manage: true, print: true });
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { name: "Agus Pratama" });
    expect(within(dialog).queryByRole("button", { name: "Tutup" })).not.toBeInTheDocument();
    const back = within(dialog).getByRole("button", { name: "Kembali" });
    expect(back.className).toContain("left-3");
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
