import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/app/feature-flags";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// Menu b–e (2026-09-30): alur tulis Ubah Status, Nonaktifkan, Aktifkan kembali
// harus mengirim body yang benar ke API (D-035). Akses & aturan bisnis dites di api (employees.test.ts).

const STATUSES = [
  { id: "s-tetap", name: "Karyawan Tetap", category: "PERMANENT" },
  { id: "s-coba", name: "Karyawan Percobaan", category: "PROBATION" },
];

const base = {
  id: "e1",
  employeeNumber: "ACP-2026-0022",
  fullName: "Nadia Putri",
  workEmail: null,
  phoneNumber: null,
  gender: "FEMALE",
  joinDate: "2026-08-17",
  endDate: null,
  isActive: true,
  exitReason: null,
  employmentStatus: STATUSES[1],
  position: { id: "p1", name: "HR Staff" },
  department: { id: "d1", name: "Human Resources & GA" },
  workLocation: null,
  grade: null,
  manager: null,
  photoUrl: null,
};
const detail = (overrides: Partial<typeof base> = {}) => ({
  ...base,
  ...overrides,
  emergencyPhone: null,
  account: null,
  access: {
    manage: true,
    deactivate: true,
    personal: false,
    bank: false,
    print: true,
    photo: true,
  },
  educations: [],
  trainings: [],
  histories: [],
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Backend palsu: GET dilayani dari fixture, POST dicatat (method, path, body). */
function mockBackend(employee: ReturnType<typeof detail>) {
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const key = url.pathname.replace("/api/v1", "");
      if (init?.method === "POST") {
        posts.push({ path: key, body: JSON.parse(String(init.body)) });
        return json(200, { data: base });
      }
      if (key === "/me") return json(200, { data: me("HR_ADMIN") });
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
                PROBATION: 1,
                PKWT: 0,
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
            employmentStatuses: STATUSES,
            grades: [],
            workLocations: [],
          },
        });
      if (key === "/employees")
        return json(200, { data: [], meta: { page: 1, pageSize: 20, total: 0 } });
      if (key === `/employees/${employee.id}`) return json(200, { data: employee });
      return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
    }),
  );
  return posts;
}

beforeEach(() => {
  authState.session = { access_token: "t", user: { id: "u" } };
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("Ubah Status Karyawan (menu b)", () => {
  it("Percobaan → Karyawan Tetap: POST /status-change dengan status & tanggal efektif", async () => {
    const posts = mockBackend(detail());
    renderAt("/personal/ubah-status?pegawai=e1");
    const panel = await screen.findByRole("region", { name: "Panel perubahan status" });
    const choices = await within(panel).findByRole("radiogroup", { name: "Status baru" });
    // Status saat ini tidak bisa dipilih.
    expect(
      await within(choices).findByRole("radio", { name: /Karyawan Percobaan/ }),
    ).toBeDisabled();
    const user = userEvent.setup();
    await user.click(within(choices).getByRole("radio", { name: /Karyawan Tetap/ }));
    await user.type(within(panel).getByLabelText(/Catatan/), "SK pengangkatan 01");
    await user.click(within(panel).getByRole("button", { name: "Simpan perubahan" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.path).toBe("/employees/e1/status-change");
    expect(posts[0]?.body).toMatchObject({
      employmentStatusId: "s-tetap",
      note: "SK pengangkatan 01",
    });
    expect(posts[0]?.body.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("Nonaktifkan: tombol aktif hanya setelah alasan + konfirmasi; POST /deactivate", async () => {
    const posts = mockBackend(detail());
    renderAt("/personal/ubah-status?pegawai=e1&aksi=nonaktif");
    const panel = await screen.findByRole("region", { name: "Panel perubahan status" });
    const submit = await within(panel).findByRole("button", { name: /Nonaktifkan karyawan/ });
    expect(submit).toBeDisabled();
    const user = userEvent.setup();
    await user.click(
      within(within(panel).getByRole("radiogroup", { name: "Alasan keluar" })).getByRole("radio", {
        name: /Mengundurkan diri/,
      }),
    );
    expect(submit).toBeDisabled();
    await user.click(within(panel).getByRole("checkbox", { name: /Saya yakin menonaktifkan/ }));
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.path).toBe("/employees/e1/deactivate");
    expect(posts[0]?.body).toMatchObject({ exitReason: "RESIGNATION" });
  });
});

// Halaman Pengaktifan hanya dites saat menunya aktif (FEATURES.activation).
describe.skipIf(!FEATURES.activation)("Pengaktifan Karyawan (menu c)", () => {
  it("?pegawai=<nonaktif> membuka dialog; Aktifkan kembali → POST /reactivate", async () => {
    const posts = mockBackend(
      detail({
        isActive: false,
        exitReason: "RESIGNATION" as never,
        endDate: "2026-09-01" as never,
      }),
    );
    renderAt("/personal/pengaktifan?pegawai=e1");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/tidak/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(dialog).getByRole("button", { name: /Aktifkan kembali/ }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.path).toBe("/employees/e1/reactivate");
    expect(posts[0]?.body.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Status tidak diubah bila tidak dipilih yang berbeda.
    expect(posts[0]?.body).not.toHaveProperty("employmentStatusId");
  });
});
