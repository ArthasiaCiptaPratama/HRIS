import { screen, waitFor } from "@testing-library/react";
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

const CSV = [
  "NO;NIK KARYAWAN;NAMA;JABATAN;DEPARTEMEN",
  "1;ACP-9001;Ani Contoh;Staff Uji;Divisi Uji",
  "2;ACP-9002;Budi Contoh;Staff Uji;Divisi Uji",
].join("\n");

const preview = {
  counts: { total: 2, create: 1, update: 0, skip: 0, error: 1, blank: 0 },
  rows: [
    {
      sourceRow: 2,
      action: "CREATE",
      employeeNumber: "ACP-9001",
      fullName: "Ani Contoh",
      companyCode: "ACP",
      changes: [],
      issues: [],
    },
    {
      sourceRow: 3,
      action: "ERROR",
      employeeNumber: "ACP-9002",
      fullName: "Budi Contoh",
      companyCode: "ACP",
      changes: [],
      issues: [{ field: "workEmail", code: "EMAIL_TAKEN", severity: "ERROR" }],
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
}: {
  role?: "SUPER_ADMIN" | "HR_ADMIN" | "EMPLOYEE";
  companies?: (typeof ACP)[];
  commitStatus?: number[];
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
            departments: [{ id: "d1", name: "Operasional", parentId: null }],
            positions: [],
            employmentStatuses: [],
            grades: [],
            workLocations: [],
          },
        });
      if (path.startsWith("/employee-imports/mappings/"))
        return method === "PUT"
          ? json(200, { data: { signature: "s", mapping: {}, updatedAt: "2026-09-30T00:00:00Z" } })
          : json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
      if (path === "/employee-imports/preview") return json(200, { data: preview });
      if (path === "/employee-imports" && method === "POST") {
        const status = commitStatus.shift() ?? 201;
        return status === 409
          ? json(409, { error: { code: "PREVIEW_STALE", message: "Data berubah", requestId: "r" } })
          : json(201, { data: { jobId: "job-1", counts: preview.counts } });
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
  it("HR: unggah CSV → kolom dikenali otomatis → pratinjau → simpan; PT tunggal terisi otomatis", async () => {
    const requests = mockBackend();
    const user = userEvent.setup();
    renderAt("/personal/import?dari=pkwt");

    await user.upload(await screen.findByLabelText("Pilih file import"), csvFile());

    // Pemetaan: kolom NO diabaikan, NIK KARYAWAN → nomor induk, NAMA → nama lengkap.
    expect(await screen.findByRole("table", { name: "Pemetaan kolom" })).toBeInTheDocument();
    expect(screen.getByText(/Header baris 1 · 2 baris data/)).toBeInTheDocument();
    expect(screen.queryByText(/wajib dipetakan/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Lanjut ke pratinjau/ }));
    expect(await screen.findByText("Akan dibuat")).toBeInTheDocument();

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

    // Pratinjau: master data baru, kolom sensitif dilewati, masalah per baris dengan letak kolom.
    expect(screen.getByText(/Master data baru \(2\)/)).toBeInTheDocument();
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
    await user.click(await screen.findByRole("button", { name: /Lanjut ke pratinjau/ }));
    await user.click(await screen.findByRole("button", { name: "Simpan 1 karyawan" }));
    await waitFor(() =>
      expect(requests.filter((r) => r.path === "/employee-imports/preview")).toHaveLength(2),
    );
    await user.click(await screen.findByRole("button", { name: "Simpan 1 karyawan" }));
    expect(await screen.findByText("Import selesai")).toBeInTheDocument();
  });

  it("file .xls ditolak dengan pesan jelas; tidak ada request ke server", async () => {
    const requests = mockBackend();
    const user = userEvent.setup({ applyAccept: false });
    renderAt("/personal/import");
    await user.upload(await screen.findByLabelText("Pilih file import"), csvFile("lama.xls"));
    expect(await screen.findByText(/\.xls \(Excel 97–2003\) belum didukung/)).toBeInTheDocument();
    expect(requests.some((r) => r.path.startsWith("/employee-imports"))).toBe(false);
  });

  it("tanpa kolom nomor induk: tombol lanjut nonaktif + peringatan", async () => {
    mockBackend();
    const user = userEvent.setup();
    renderAt("/personal/import");
    await user.upload(
      await screen.findByLabelText("Pilih file import"),
      csvFile("x.csv", "NAMA;JABATAN\nAni Contoh;Staff\nBudi Contoh;Staff"),
    );
    expect(await screen.findByText(/wajib dipetakan/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Lanjut ke pratinjau/ })).toBeDisabled();
  });

  it("SA dengan 2 PT memilih perusahaan bawaan", async () => {
    mockBackend({ role: "SUPER_ADMIN", companies: [ACP, CD2] });
    renderAt("/personal/import");
    expect(await screen.findByText("Perusahaan bawaan")).toBeInTheDocument();
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
