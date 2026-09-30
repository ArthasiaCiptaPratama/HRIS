import { readFileSync } from "node:fs";
import path from "node:path";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authState, me, renderAt, supabaseMock } from "./helpers";

// Canvas tidak ada di jsdom: kompres foto diganti blob tetap (geometri diuji di employee-print.test).
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
const TEMPLATE = readFileSync(
  path.join(import.meta.dirname, "..", "public", "template", "Template-excel.xlsx"),
);

let photoUrl: string | null = null;
const detail = (access: Record<string, boolean>) => ({
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
  position: { id: "p1", name: "GA Staff" },
  department: { id: "d1", name: "Human Resources & GA" },
  workLocation: null,
  grade: null,
  manager: null,
  photoUrl,
  emergencyPhone: null,
  emergencyContactName: null,
  emergencyContactRelationship: null,
  account: null,
  access: {
    manage: false,
    deactivate: false,
    personal: false,
    bank: false,
    print: false,
    photo: false,
    ...access,
  },
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
      exitReason: null,
      note: null,
      changedBy: null,
      createdAt: "2023-08-01T03:00:00.000Z",
    },
  ],
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** fetch palsu yang membedakan query (?view=...) dan melayani file template. */
function mockBackend(role: Parameters<typeof me>[0], access: Record<string, boolean>) {
  const calls: string[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = String(input);
    calls.push(`${init?.method ?? "GET"} ${raw}`);
    if (raw.endsWith("/template/Template-excel.xlsx")) {
      return new Response(TEMPLATE, { status: 200 });
    }
    const url = new URL(raw);
    const key = url.pathname.replace("/api/v1", "");
    if (key === "/me") return json(200, { data: me(role, false, "e-self") });
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
          departments: [],
          positions: [],
          employmentStatuses: [],
          grades: [],
          workLocations: [],
        },
      });
    if (key === "/employees")
      return json(200, { data: [], meta: { page: 1, pageSize: 20, total: 0 } });
    if (key === "/employees/e1") return json(200, { data: detail(access) });
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
  authState.session = { access_token: "t", user: { id: "u" } };
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("panel detail pegawai", () => {
  it("layar penuh; avatar & nama di tengah atas; riwayat menampilkan pengubah (nama, role, lokasi)", async () => {
    mockBackend("HR_ADMIN", { manage: true, deactivate: true, print: true });
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("heading", { name: "Agus Pratama" })).toBeVisible();
    expect(dialog.className).toContain("sm:max-w-none");
    expect(dialog.querySelector("header")?.className).toContain("items-center");

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

  it("HR: Print data → ambil ?view=print lalu unduh .xlsx bernama karyawan", async () => {
    const calls = mockBackend("HR_ADMIN", { manage: true, deactivate: true, print: true });
    const createObjectURL = vi.fn((_blob: Blob) => "blob:xlsx");
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

    await waitFor(() =>
      expect(clicked).toEqual(["Data Karyawan - ACP-2023-0007 - Agus Pratama.xlsx"]),
    );
    expect(calls.some((c) => c.endsWith("/employees/e1?view=print"))).toBe(true);
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(blob.size).toBeGreaterThan(10_000);
    await waitFor(() =>
      expect(success).toHaveBeenCalledWith(
        "Data Agus Pratama diunduh (.xlsx).",
        expect.objectContaining({ description: expect.stringContaining("dikosongkan") }),
      ),
    );
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

  it("tanpa hak ubah foto (MANAGER): tidak ada tombol kamera", async () => {
    mockBackend("MANAGER", {});
    renderAt("/personal/pegawai-aktif/semua?pegawai=e1");
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("heading", { name: "Agus Pratama" });
    expect(within(dialog).queryByRole("button", { name: /foto profil/ })).not.toBeInTheDocument();
  });
});
