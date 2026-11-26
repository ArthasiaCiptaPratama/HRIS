import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/app/feature-flags";
import { safeBack } from "@/features/employee/pages/change-status-page";
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
  company: { id: "co-acp", code: "ACP", name: "PT Arthasia Cipta Pratama" },
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
  emergencyContactName: null,
  emergencyContactRelationship: null,
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
const contract = (overrides: Record<string, unknown> = {}) => ({
  id: "c1",
  kind: "PKWT",
  sequence: 1,
  startDate: "2026-01-01",
  endDate: "2027-12-31",
  previousContractId: null,
  pkwtFirstStartDate: null,
  status: "ACTIVE",
  note: null,
  ...overrides,
});
const contractsOf = (
  category: string,
  contracts: ReturnType<typeof contract>[] = [],
  access = { manage: true, missingGrant: false },
) => ({
  contracts,
  thl: null,
  tier: category === "PKWT" ? "PKWT" : category === "DAILY_WORKER" ? "THL" : "PKWTT",
  category,
  joinDate: "2026-01-01",
  pkwttStartDate: null,
  companyTenure: { years: 0, months: 10, days: 25 },
  pkwttTenure: null,
  access,
});

function mockBackend(
  employee: ReturnType<typeof detail>,
  contracts: ReturnType<typeof contractsOf> = contractsOf(
    employee.employmentStatus?.category ?? "PERMANENT",
  ),
) {
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const key = url.pathname.replace("/api/v1", "");
      if (init?.method === "POST") {
        posts.push({ path: key, body: JSON.parse(String(init.body)) });
        return json(
          200,
          key.includes("/contracts/") || key.endsWith("/promote") || key.includes("/probation/")
            ? { data: { contract: null, warnings: [] } }
            : { data: base },
        );
      }
      if (key === `/employees/${employee.id}/contracts`) return json(200, { data: contracts });
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
            companies: [],
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
  const actions = async () => {
    const panel = await screen.findByRole("region", { name: "Panel perubahan status" });
    const group = await within(panel).findByRole("radiogroup", { name: "Aksi" });
    return {
      panel,
      names: within(group)
        .getAllByRole("radio")
        .map((radio) => radio.querySelector("span.font-medium")?.textContent),
    };
  };
  const thl = { id: "s-thl", name: "THL", category: "DAILY_WORKER" };
  const pkwt = { id: "s-pkwt", name: "PKWT", category: "PKWT" };

  it("KTR-D14: THL → Ubah ke kategori lain tetap mengirim status-change tanpa kontrak", async () => {
    const posts = mockBackend(detail({ employmentStatus: thl }));
    renderAt("/personal/ubah-status?pegawai=e1&aksi=kategori");
    const { panel } = await actions();
    const choices = await within(panel).findByRole("radiogroup", { name: "Status baru" });
    await userEvent.click(within(choices).getByRole("radio", { name: /Karyawan Tetap/ }));
    await userEvent.type(within(panel).getByLabelText(/Catatan/), "SK pengangkatan 01");
    await userEvent.click(within(panel).getByRole("button", { name: "Simpan perubahan" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      path: "/employees/e1/status-change",
      body: { employmentStatusId: "s-tetap", note: "SK pengangkatan 01" },
    });
    expect(posts[0]?.body.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(posts[0]?.body).not.toHaveProperty("contract");
  });

  it("KTR-D14: hanya aksi yang sah untuk status sekarang yang ditawarkan", async () => {
    mockBackend(detail({ employmentStatus: thl }));
    const first = renderAt("/personal/ubah-status?pegawai=e1");
    expect((await actions()).names).toEqual([
      "Jadikan Karyawan Tetap",
      "Ubah ke kategori lain",
      "Nonaktifkan (keluar)",
    ]);
    first.unmount();
    // PKWT 3: tidak ada Perpanjang; PKWT/Percobaan tidak bisa "Ubah ke kategori lain" (KTR-D4).
    mockBackend(
      detail({ employmentStatus: pkwt }),
      contractsOf("PKWT", [contract({ sequence: 3, endDate: "2026-12-31" })]),
    );
    const second = renderAt("/personal/ubah-status?pegawai=e1&aksi=perpanjang");
    const pkwt3 = await actions();
    expect(pkwt3.names).toEqual([
      "Jadikan Karyawan Tetap",
      "Akhiri kontrak",
      "Nonaktifkan (keluar)",
    ]);
    // Aksi di URL yang tidak sah tidak membuka form.
    expect(within(pkwt3.panel).queryByRole("region", { name: /^Form / })).toBeNull();
    second.unmount();
    mockBackend(detail({ employmentStatus: STATUSES[0] }));
    renderAt("/personal/ubah-status?pegawai=e1");
    expect((await actions()).names).toEqual(["Ubah ke kategori lain", "Nonaktifkan (keluar)"]);
  });

  it("KTR-D14: deep link Perpanjang → POST extend, lalu kembali ke profil", async () => {
    const posts = mockBackend(
      detail({ employmentStatus: pkwt }),
      contractsOf("PKWT", [contract()]),
    );
    const back = "/personal/pegawai-aktif/semua?pegawai=e1";
    const { router } = renderAt(
      `/personal/ubah-status?pegawai=e1&aksi=perpanjang&kembali=${encodeURIComponent(back)}`,
    );
    const { panel } = await actions();
    const form = await within(panel).findByRole("region", { name: "Form Perpanjang ke PKWT 2" });
    expect(within(form).getByText(/PKWT 2 dan PKWT 3 maks 1 tahun/)).toBeVisible();
    expect(within(form).getByLabelText("Mulai kontrak")).toHaveValue("2028-01-01");
    expect(screen.getByRole("link", { name: /Kembali ke profil/ })).toHaveAttribute("href", back);
    await userEvent.click(within(form).getByRole("button", { name: "Perpanjang ke PKWT 2" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.path).toBe("/employees/e1/contracts/c1/extend");
    await waitFor(() =>
      expect(`${router.state.location.pathname}${router.state.location.search}`).toBe(back),
    );
  });

  it("KTR-D14: Percobaan → Tidak lulus butuh konfirmasi lalu POST probation/fail", async () => {
    const posts = mockBackend(
      detail(),
      contractsOf("PROBATION", [
        contract({
          kind: "PROBATION",
          sequence: null,
          startDate: "2026-09-01",
          endDate: "2026-11-30",
        }),
      ]),
    );
    renderAt("/personal/ubah-status?pegawai=e1&aksi=tidak-lulus");
    const { panel, names } = await actions();
    expect(names).toEqual(["Lulus → Permanen", "Tidak lulus", "Nonaktifkan (keluar)"]);
    const form = await within(panel).findByRole("region", { name: "Form Tidak lulus" });
    const submit = within(form).getByRole("button", { name: "Tidak lulus" });
    expect(submit).toBeDisabled();
    await userEvent.click(within(form).getByRole("checkbox"));
    await userEvent.click(submit);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.path).toBe("/employees/e1/probation/fail");
  });

  it("KTR-D14: HR tanpa grant Kelola kontrak → aksi kontrak tidak ditawarkan", async () => {
    mockBackend(
      detail({ employmentStatus: pkwt }),
      contractsOf("PKWT", [contract()], { manage: false, missingGrant: true }),
    );
    renderAt("/personal/ubah-status?pegawai=e1&aksi=perpanjang");
    const { panel, names } = await actions();
    expect(names).toEqual(["Nonaktifkan (keluar)"]);
    expect(within(panel).getByText(/butuh izin/)).toBeVisible();
    expect(within(panel).queryByRole("region", { name: /^Form / })).toBeNull();
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
  it("KTR-D4: karyawan Percobaan/PKWT nonaktif hanya bisa diaktifkan dengan status semula", async () => {
    mockBackend(detail({ isActive: false, exitReason: "RESIGNATION" as never }));
    renderAt("/personal/pengaktifan?pegawai=e1");
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/Status PKWT\/masa percobaan diubah lewat tab Kepegawaian/),
    ).toBeInTheDocument();
  });
  it("KTR-D4: karyawan Tetap nonaktif tanpa petunjuk kontrak", async () => {
    mockBackend(
      detail({
        isActive: false,
        exitReason: "RESIGNATION" as never,
        employmentStatus: STATUSES[0] as never,
      }),
    );
    renderAt("/personal/pengaktifan?pegawai=e1");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText(/tab Kepegawaian/)).not.toBeInTheDocument();
  });
});

describe("KTR-D14 kembali (open redirect)", () => {
  it("hanya jalur relatif di origin aplikasi", () => {
    expect(safeBack("/personal/pegawai-aktif/semua?pegawai=e1")).toBe(
      "/personal/pegawai-aktif/semua?pegawai=e1",
    );
    for (const bad of [
      "//evil.example",
      "/\\evil.example",
      "/.//evil.example",
      "/%2e//evil.example",
      "/akun",
      "https://evil.example",
      "evil",
      "",
      null,
    ])
      expect(safeBack(bad)).toBeNull();
  });
});
