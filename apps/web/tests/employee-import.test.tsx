import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSelectedCompany } from "@/features/employee/company-scope";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// D-042 (web): halaman Import Data Karyawan — unggah → pemetaan otomatis → pratinjau → simpan.
// Validasi & penulisan sesungguhnya diuji di api (tests/integration/employee/import.test.ts).
const ACP = { id: "co-acp", code: "ACP", name: "PT Arthasia Cipta Pratama" };
const CD2 = { id: "co-cd2", code: "CD2", name: "PT Contoh Dua (Dummy)" };
const STATUSES = [
  { id: "st-1", name: "Karyawan Tetap", category: "PERMANENT" },
  { id: "st-2", name: "PKWT", category: "PKWT" },
];

const CSV = [
  "NO;NIK KARYAWAN;NAMA;JABATAN;DEPARTEMEN",
  "1;ACP-9001;Ani Contoh;Staff Uji;Divisi Uji",
  "2;ACP-9002;Budi Contoh;Staff Uji;Divisi Uji",
].join("\n");

const preview = {
  counts: { total: 2, create: 1, update: 0, skip: 0, error: 1, blank: 0, attachments: 0 },
  rows: [
    {
      sourceRow: 2,
      action: "CREATE",
      employeeNumber: "ACP-9001",
      fullName: "Ani Contoh",
      companyCode: "ACP",
      newEmployee: true,
      employmentStatusId: "st-1" as string | null,
      changes: [],
      issues: [],
      attachments: 0,
    },
    {
      sourceRow: 3,
      action: "ERROR",
      employeeNumber: "ACP-9002",
      fullName: "Budi Contoh",
      companyCode: "ACP",
      newEmployee: false,
      employmentStatusId: null as string | null,
      changes: [],
      issues: [{ field: "workEmail", code: "EMAIL_TAKEN", severity: "ERROR" }],
      attachments: 0,
    },
  ],
  // D-064: nilai Departemen/Divisi → unit organisasi (departemen baru tampil di blok unit).
  units: [
    {
      key: "divisiuji",
      name: "Divisi Uji",
      columns: ["departmentName"],
      rows: 1,
      status: "NEW",
      unitId: null,
      sameAs: null,
      create: { unitType: "DEPARTMENT", parentUnitId: null, parentKey: null },
      suggestions: [],
    },
  ],
  masterData: {
    departments: ["Divisi Uji"],
    positions: [{ department: "Divisi Uji", name: "Staff Uji" }],
    grades: [],
    workLocations: [],
  },
  skippedFields: ["ktpNumber"],
  previewHash: "hash-1",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mockBackend({
  role = "HR_ADMIN" as "SUPER_ADMIN" | "HR_ADMIN" | "EMPLOYEE",
  companies = [ACP],
  commitStatus = [201],
  previewData = preview,
}: {
  role?: "SUPER_ADMIN" | "HR_ADMIN" | "EMPLOYEE";
  companies?: (typeof ACP)[];
  commitStatus?: number[];
  previewData?: typeof preview;
} = {}) {
  const requests: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      const path = url.pathname.replace("/api/v1", "");
      requests.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (path === "/me") return json(200, { data: me(role) });
      if (path === "/health")
        return json(200, { data: { status: "ok", checks: { database: "ok" }, time: "x" } });
      if (path === "/notifications")
        return json(200, { data: [], meta: { page: 1, pageSize: 5, total: 0, unreadCount: 0 } });
      if (path === "/master-data")
        return json(200, {
          data: {
            companies,
            departments: [
              { id: "d1", name: "Operasional", parentId: null, unitType: "DEPARTMENT" },
            ],
            positions: [],
            employmentStatuses: STATUSES,
            grades: [],
            workLocations: [],
          },
        });
      if (path.startsWith("/employee-imports/mappings/"))
        return method === "PUT"
          ? json(200, { data: { signature: "s", mapping: {}, updatedAt: "2026-09-30T00:00:00Z" } })
          : json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
      if (path === "/employee-imports/attachments/open") return json(200, { data: [] });
      if (path === "/employee-imports/preview") return json(200, { data: previewData });
      if (path === "/employee-imports" && method === "POST") {
        const status = commitStatus.shift() ?? 201;
        return status === 409
          ? json(409, { error: { code: "PREVIEW_STALE", message: "Data berubah", requestId: "r" } })
          : json(201, { data: { jobId: "job-1", counts: previewData.counts } });
      }
      return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
    }),
  );
  return requests;
}

const csvFile = (name = "karyawan.csv", content = CSV) =>
  new File([content], name, { type: "text/csv" });

beforeEach(() => {
  authState.session = { access_token: "t", user: { id: "u" } };
  setSelectedCompany(null);
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("Import Data Karyawan", () => {
  it("D-060: tanpa perubahan data tetapi ada lampiran Drive → tetap bisa disimpan", async () => {
    const onlyAttachments = {
      ...preview,
      counts: { ...preview.counts, create: 0, error: 0, skip: 2, attachments: 3 },
      rows: preview.rows.map((r) => ({ ...r, action: "SKIP", issues: [], attachments: 1 })),
    };
    mockBackend({ previewData: onlyAttachments });
    const user = userEvent.setup();
    renderAt("/personal/import");
    await user.upload(await screen.findByLabelText("Pilih file import"), csvFile());
    await user.click(await screen.findByRole("button", { name: "Lanjut" }));
    expect(await screen.findByText(/3 lampiran Google Drive/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simpan 3 lampiran" })).toBeEnabled();
  });

  it("HR: unggah CSV → kolom dikenali otomatis → pratinjau → simpan; PT tunggal terisi otomatis", async () => {
    const requests = mockBackend();
    const user = userEvent.setup();
    renderAt("/personal/import?dari=pkwt");

    await user.upload(await screen.findByLabelText("Pilih file import"), csvFile());

    // Pemetaan: kolom NO diabaikan, NIK KARYAWAN → nomor induk, NAMA → nama lengkap.
    expect(await screen.findByRole("table", { name: "Pemetaan kolom" })).toBeInTheDocument();
    expect(screen.getByText(/Header baris 1 · 2 baris data/)).toBeInTheDocument();
    expect(screen.queryByText(/Petakan kolom/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Lanjut" }));
    expect(await screen.findByText("Akan dibuat")).toBeInTheDocument();
    // Pratinjau dibuka dengan "Semua" (bukan hanya Error) supaya pilihan per baris terlihat.
    expect(screen.getByRole("button", { name: /^Semua/ })).toHaveAttribute("aria-pressed", "true");

    const previewReq = requests.find((r) => r.path === "/employee-imports/preview");
    const body = previewReq?.body as {
      mode: string;
      companyId?: string;
      rows: { sourceRow: number; raw: Record<string, unknown> }[];
    };
    expect(body.mode).toBe("UPSERT");
    expect(body.companyId).toBe(ACP.id);
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0]).toEqual({
      sourceRow: 2,
      raw: {
        employeeNumber: "ACP-9001",
        fullName: "Ani Contoh",
        positionName: "Staff Uji",
        departmentName: "Divisi Uji",
      },
    });
    // Profil pemetaan disimpan untuk file berformat sama.
    expect(
      requests.some((r) => r.method === "PUT" && r.path.startsWith("/employee-imports/mappings/")),
    ).toBe(true);

    // Tidak ada pilihan wajib → langkah Lengkapi data dilewati, langsung Pratinjau. Ringkasan
    // pengaturan, kolom sensitif dilewati, masalah per baris dengan letak kolom.
    expect(screen.queryByText("Lengkapi data", { selector: "h2" })).not.toBeInTheDocument();
    expect(screen.getByText(/1 nilai unit \(1 unit baru\)/)).toBeInTheDocument();
    expect(screen.getByText("Kolom sensitif dilewati")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Unduh baris bermasalah \(1\)/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Simpan 1 karyawan" }));
    expect(await screen.findByText("Import selesai")).toBeInTheDocument();
    const commitReq = requests.find((r) => r.path === "/employee-imports" && r.method === "POST");
    expect(commitReq?.body).toMatchObject({ previewHash: "hash-1" });
    expect(screen.getByRole("link", { name: /Lihat Data Karyawan Aktif/ })).toHaveAttribute(
      "href",
      "/personal/pegawai-aktif/pkwt",
    );
  });

  it("commit 409 (data berubah sejak pratinjau) → pratinjau diulang, lalu simpan lagi berhasil", async () => {
    const requests = mockBackend({ commitStatus: [409, 201] });
    const user = userEvent.setup();
    renderAt("/personal/import");
    await user.upload(await screen.findByLabelText("Pilih file import"), csvFile());
    await user.click(await screen.findByRole("button", { name: "Lanjut" }));
    await user.click(await screen.findByRole("button", { name: "Simpan 1 karyawan" }));
    await waitFor(() =>
      expect(requests.filter((r) => r.path === "/employee-imports/preview")).toHaveLength(2),
    );
    await user.click(await screen.findByRole("button", { name: "Simpan 1 karyawan" }));
    expect(await screen.findByText("Import selesai")).toBeInTheDocument();
  });

  it("pemetaan: daftar field baru dipasang saat dibuka, bisa dicari, dan pilihan manual tercatat", async () => {
    mockBackend();
    const user = userEvent.setup();
    renderAt("/personal/import");
    await user.upload(await screen.findByLabelText("Pilih file import"), csvFile());
    await screen.findByRole("table", { name: "Pemetaan kolom" });
    // Tertutup: tidak ada pilihan field di DOM (penyebab lag pada file ratusan kolom).
    expect(screen.queryAllByRole("option")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Field untuk kolom A" }));
    await user.type(screen.getByRole("textbox", { name: "Cari pilihan" }), "nama panggilan");
    await user.click(screen.getByRole("option", { name: /Nama panggilan/ }));
    expect(screen.getByRole("button", { name: "Field untuk kolom A" })).toHaveTextContent(
      "Nama panggilan",
    );
    expect(screen.getByText("Dipilih manual")).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("D-062/D-064: pilihan wajib → langkah Lengkapi data; lanjut terkunci; status bawaan & saran unit dikirim", async () => {
    const pending = {
      ...preview,
      counts: { ...preview.counts, create: 0, error: 2 },
      rows: preview.rows.map((r) => ({
        ...r,
        action: "ERROR",
        newEmployee: true,
        employmentStatusId: null,
        issues: [{ field: "employmentStatusText", code: "CATEGORY_REQUIRED", severity: "ERROR" }],
      })),
      units: [
        {
          key: "hrga",
          name: "HRGA",
          columns: ["departmentName"],
          rows: 2,
          status: "NEEDS_REVIEW",
          unitId: null,
          sameAs: null,
          create: null,
          suggestions: [{ unitId: "dept-hr", key: null, name: "HR & GA", reason: "CONTAINS" }],
        },
      ],
    };
    const requests = mockBackend({ previewData: pending as unknown as typeof preview });
    const user = userEvent.setup();
    renderAt("/personal/import");
    await user.upload(await screen.findByLabelText("Pilih file import"), csvFile());
    await user.click(await screen.findByRole("button", { name: "Lanjut" }));

    expect(await screen.findByText("Lengkapi data", { selector: "h2" })).toBeInTheDocument();
    expect(screen.getByText(/2 karyawan baru belum punya status/)).toBeInTheDocument();
    expect(screen.getByText(/1 nilai belum jelas unitnya/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Lanjut ke pratinjau/ })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Pakai saran untuk 1 nilai/ }));
    await waitFor(() => {
      const last = requests.filter((r) => r.path === "/employee-imports/preview").at(-1);
      expect(last?.body).toMatchObject({ unitMapping: { hrga: { unitId: "dept-hr" } } });
    });

    await user.click(screen.getByRole("combobox", { name: "Status kepegawaian bawaan" }));
    await user.click(await screen.findByRole("option", { name: "PKWT" }));
    await waitFor(() => {
      const last = requests.filter((r) => r.path === "/employee-imports/preview").at(-1);
      expect(last?.body).toMatchObject({ defaultEmploymentStatusId: "st-2" });
    });
  });

  it("D-062: status per baris di Pratinjau", async () => {
    const noStatus = {
      ...preview,
      rows: preview.rows.map((r) => ({ ...r, newEmployee: true, employmentStatusId: null })),
    };
    const requests = mockBackend({ previewData: noStatus });
    const user = userEvent.setup();
    renderAt("/personal/import");
    await user.upload(await screen.findByLabelText("Pilih file import"), csvFile());
    await user.click(await screen.findByRole("button", { name: "Lanjut" }));
    await user.click(await screen.findByRole("button", { name: "Status kepegawaian baris 3" }));
    await user.click(screen.getByRole("option", { name: "PKWT" }));
    await waitFor(() => {
      const last = requests.filter((r) => r.path === "/employee-imports/preview").at(-1);
      expect(last?.body).toMatchObject({ employmentStatusOverrides: { "3": "st-2" } });
    });
  });

  it("panduan '?' menjelaskan urutan & menandai langkah yang sedang dibuka", async () => {
    mockBackend();
    const user = userEvent.setup();
    renderAt("/personal/import");
    await user.click(await screen.findByRole("button", { name: "Panduan import" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Panduan import data karyawan")).toBeInTheDocument();
    expect(within(dialog).getByText(/Lengkapi data/, { selector: "p" })).toBeInTheDocument();
    const current = within(dialog)
      .getAllByRole("listitem")
      .find((li) => li.getAttribute("aria-current") === "step");
    expect(current).toHaveTextContent(/Unggah file/);
  });

  it("file .xls ditolak dengan pesan jelas; tidak ada request ke server", async () => {
    const requests = mockBackend();
    const user = userEvent.setup({ applyAccept: false });
    renderAt("/personal/import");
    await user.upload(await screen.findByLabelText("Pilih file import"), csvFile("lama.xls"));
    expect(await screen.findByText(/\.xls \(Excel 97–2003\) belum didukung/)).toBeInTheDocument();
    // Isi file tidak dikirim (cek lampiran tertunda D-060 bukan kiriman file).
    expect(
      requests.some(
        (r) =>
          r.path.startsWith("/employee-imports") && r.path !== "/employee-imports/attachments/open",
      ),
    ).toBe(false);
  });

  it("tanpa kolom NIP maupun NIK KTP: tombol lanjut nonaktif + peringatan (D-063)", async () => {
    mockBackend();
    const user = userEvent.setup();
    renderAt("/personal/import");
    await user.upload(
      await screen.findByLabelText("Pilih file import"),
      csvFile("x.csv", "NAMA;JABATAN\nAni Contoh;Staff\nBudi Contoh;Staff"),
    );
    expect(await screen.findByText(/Petakan kolom/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lanjut" })).toBeDisabled();
  });

  it("SA dengan 2 PT: PT tidak dipilih di langkah Unggah, tetapi di Lengkapi data (per baris di Pratinjau)", async () => {
    const noCompany = {
      ...preview,
      rows: preview.rows.map((r) => ({
        ...r,
        action: "ERROR",
        companyCode: null,
        issues: [{ field: "companyCode", code: "COMPANY_REQUIRED", severity: "ERROR" }],
      })),
    };
    const requests = mockBackend({
      role: "SUPER_ADMIN",
      companies: [ACP, CD2],
      previewData: noCompany as unknown as typeof preview,
    });
    const user = userEvent.setup();
    renderAt("/personal/import");
    await screen.findByLabelText("Pilih file import");
    expect(screen.queryByText("Perusahaan bawaan")).not.toBeInTheDocument();
    await user.upload(screen.getByLabelText("Pilih file import"), csvFile());
    await user.click(await screen.findByRole("button", { name: "Lanjut" }));
    expect(await screen.findByText(/2 karyawan belum punya PT/)).toBeInTheDocument();
    expect(screen.getByText("1 bagian lagi perlu diselesaikan")).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "Perusahaan bawaan" }));
    await user.click(await screen.findByRole("option", { name: /CD2/ }));
    await waitFor(() => {
      const last = requests.filter((r) => r.path === "/employee-imports/preview").at(-1);
      expect(last?.body).toMatchObject({ companyId: CD2.id });
    });
  });

  it("Data Karyawan Aktif menampilkan tombol Import untuk HR; EMPLOYEE tidak bisa membuka halaman import", async () => {
    mockBackend();
    const view = renderAt("/personal/pegawai-aktif/semua");
    expect(await screen.findByRole("link", { name: "Import" })).toHaveAttribute(
      "href",
      "/personal/import?dari=semua",
    );
    view.unmount();

    mockBackend({ role: "EMPLOYEE" });
    renderAt("/personal/import");
    await waitFor(() => expect(screen.queryByText("Import Data Karyawan")).not.toBeInTheDocument());
    expect(screen.queryByLabelText("Pilih file import")).not.toBeInTheDocument();
  });
});
