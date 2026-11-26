import { evaluateThlAttendance, THL_STATUS_LABELS, type ThlStatus } from "@hris/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmploymentContractDialog } from "@/features/employee/components/employment-contract-dialog";
import {
  EmployeeContractHistory,
  EmploymentContractSection,
} from "@/features/employee/components/employment-contract-section";
import type { EmployeeContracts, EmploymentContract } from "@/features/employee/contract-schemas";
import { ChangeCategoryForm } from "@/features/employee/pages/change-status-page";
import type { EmployeeDetail } from "@/features/employee/schemas";
import { authState } from "./supabase-mock";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

const contract: EmploymentContract = {
  id: "c1",
  kind: "PKWT",
  sequence: 1,
  startDate: "2026-01-01",
  endDate: "2027-12-31",
  previousContractId: null,
  pkwtFirstStartDate: null,
  status: "ACTIVE",
  note: "Kontrak uji",
};
const employee: EmployeeDetail = {
  id: "e1",
  employeeNumber: "UJI-1",
  fullName: "Karyawan Uji",
  workEmail: null,
  phoneNumber: null,
  gender: null,
  joinDate: "2020-01-01",
  endDate: null,
  contractStage: null,
  contractEndDate: null,
  isActive: true,
  exitReason: null,
  employmentStatus: { id: "s1", name: "PKWT", category: "PKWT" },
  company: { id: "co1", name: "Perusahaan Uji", code: "UJI" },
  position: { id: "p1", name: "Staf" },
  department: null,
  workLocation: null,
  grade: null,
  manager: null,
  managerHasActiveAccount: null,
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
  histories: [],
};
function data(overrides: Partial<EmployeeContracts> = {}): EmployeeContracts {
  return {
    contracts: [contract],
    tier: "PKWT",
    category: "PKWT",
    joinDate: "2020-01-01",
    pkwttStartDate: null,
    companyTenure: { years: 6, months: 10, days: 24 },
    pkwttTenure: null,
    access: { manage: true, missingGrant: false },
    ...overrides,
  };
}
const statuses = [
  { id: "s1", name: "PKWT", category: "PKWT" },
  { id: "s2", name: "Tetap", category: "PERMANENT" },
  { id: "s3", name: "Percobaan", category: "PROBATION" },
];
let response = data();
let posts: { path: string; body: unknown }[] = [];
let reads: string[] = [];
let postError = false;
beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date("2026-11-25T05:00:00Z"));
  authState.session = { access_token: "t", user: { id: "u" } };
  response = data();
  posts = [];
  reads = [];
  postError = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname.replace("/api/v1", "");
      let body: unknown;
      let status = 200;
      if (init?.method === "PUT") {
        posts.push({ path, body: JSON.parse(String(init.body)) });
        if (postError) {
          status = 403;
          body = { error: { code: "FORBIDDEN", message: "Izin upah dicabut.", requestId: "r" } };
        } else {
          response = {
            ...response,
            thl: response.thl
              ? { ...response.thl, dailyWage: { amount: 170000, effectiveFrom: "2026-11-25" } }
              : null,
          };
          body = { data: { thl: response.thl } };
        }
      } else if (init?.method === "POST") {
        posts.push({ path, body: JSON.parse(String(init.body)) });
        if (postError) {
          status = 403;
          body = { error: { code: "FORBIDDEN", message: "Izin kontrak dicabut.", requestId: "r" } };
        } else
          body = {
            data: path.endsWith("status-change")
              ? { ...employee, warnings: [] }
              : { contract, warnings: ["Peringatan dari server"] },
          };
      } else {
        reads.push(path);
        body = {
          data:
            path === "/master-data"
              ? {
                  companies: [],
                  departments: [],
                  positions: [],
                  employmentStatuses: statuses,
                  grades: [],
                  workLocations: [],
                }
              : response,
        };
      }
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function mount(content: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter>{content}</MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}
async function card(
  category = employee.employmentStatus.category,
  overrides: Partial<EmployeeContracts> = {},
  isActive = true,
) {
  response = data({ category, ...overrides });
  mount(
    <EmploymentContractSection
      employee={{
        ...employee,
        isActive,
        employmentStatus: { ...employee.employmentStatus, category },
      }}
    />,
  );
  if (category === "INTERNSHIP" || category === "OUTSOURCING" || category === "VENDOR") return;
  await screen.findByRole("region", { name: "Status kepegawaian" });
}

describe("Kepegawaian kontrak K1", () => {
  it("PKWT 1 aktif: periode, sisa hijau, masa tahap, total dan aksi", async () => {
    await card();
    expect(screen.getAllByText("PKWT 1")).toHaveLength(2);
    expect(screen.getByText(/Sisa kontrak:/)).toHaveClass("text-green-700");
    expect(screen.getByText(/Masa kerja tahap ini:/)).toBeVisible();
    expect(screen.getByRole("progressbar", { name: "Total masa PKWT" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Perpanjang ke PKWT 2" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Jadikan Karyawan Tetap" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Akhiri kontrak" })).toBeVisible();
  });
  it.each([
    ["2027-01-10", "text-amber-700"],
    ["2026-12-10", "text-red-700"],
  ])("PKWT 3 warna %s tanpa perpanjangan", async (endDate, color) => {
    await card("PKWT", { contracts: [{ ...contract, sequence: 3, endDate }] });
    expect(screen.getByText(/Sisa kontrak:/)).toHaveClass(color);
    expect(
      screen.getByText("Batas PKWT tercapai: jadikan Karyawan Tetap atau akhiri kontrak."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /PKWTT/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Perpanjang/ })).not.toBeInTheDocument();
  });
  it("kontrak lewat tetap menampilkan aksi", async () => {
    await card("PKWT", { contracts: [{ ...contract, endDate: "2026-11-20" }] });
    expect(screen.getByText("Sisa kontrak: Kontrak lewat 5 hari")).toHaveClass("text-red-700");
    expect(screen.getByRole("button", { name: /Perpanjang/ })).toBeEnabled();
  });
  it.each(["2026-12-20", "2026-11-20"])(
    "Masa Percobaan %s: lulus dan tidak lulus",
    async (endDate) => {
      await card("PROBATION", {
        contracts: [
          { ...contract, kind: "PROBATION", sequence: null, startDate: "2026-10-01", endDate },
        ],
      });
      expect(screen.getByRole("button", { name: "Lulus → Permanen" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Tidak lulus" })).toBeVisible();
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      if (endDate < "2026-11-25") expect(screen.getByText(/Masa percobaan lewat/)).toBeVisible();
      else expect(screen.getByText(/Sisa masa percobaan: 25 hari lagi/)).toBeVisible();
      expect(screen.queryByText(/Sisa kontrak/)).not.toBeInTheDocument();
    },
  );
  it("PKWTT dari PKWT: dua masa kerja dan kontrak lama", async () => {
    await card("PERMANENT", {
      contracts: [{ ...contract, status: "CONVERTED" }],
      pkwttStartDate: "2026-01-01",
      pkwttTenure: { years: 0, months: 10, days: 24 },
    });
    expect(screen.getByText("Karyawan Tetap · PKWTT")).toBeVisible();
    expect(screen.getByText("Masa kerja di perusahaan")).toBeVisible();
    expect(screen.getByText("Masa kerja PKWTT")).toBeVisible();
    expect(screen.getByText(/6 th 10 bln/)).toBeVisible();
    expect(screen.getByText(/0 th 10 bln/)).toBeVisible();
    expect(screen.getByText("Dijadikan Karyawan Tetap")).toBeVisible();
  });
  it.each(["PKWT", "PROBATION"] as const)("data lama %s: tahap belum diisi", async (category) => {
    await card(category, { contracts: [] });
    expect(screen.getByText("Tahap belum diisi")).toBeVisible();
    expect(screen.getByRole("button", { name: "Isi tahap kontrak" })).toBeVisible();
    expect(
      screen.getByText(
        category === "PKWT"
          ? "PKWT · Tahap belum diisi"
          : "Karyawan Percobaan · PKWTT – Masa Percobaan",
      ),
    ).toBeVisible();
  });
  it("THL: pengangkatan tanpa tahap", async () => {
    await card("DAILY_WORKER", { contracts: [] });
    expect(screen.getByText("Harian Lepas (THL)")).toBeVisible();
    expect(screen.getByRole("button", { name: "Jadikan Karyawan Tetap" })).toBeVisible();
    expect(screen.queryByText("Tahap belum diisi")).not.toBeInTheDocument();
  });
  it.each(["INTERNSHIP", "OUTSOURCING", "VENDOR"] as const)(
    "%s tanpa kartu kontrak",
    async (category) => {
      await card(category);
      expect(screen.queryByRole("region", { name: "Status kepegawaian" })).not.toBeInTheDocument();
      expect(reads).not.toContain("/employees/e1/contracts");
    },
  );
  it.each(["MANAGER", "EMPLOYEE", "HR_ADMIN tanpa grant"])(
    "%s: tanpa tombol aksi",
    async (role) => {
      await card("PKWT", { access: { manage: false, missingGrant: role.startsWith("HR_ADMIN") } });
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(Boolean(screen.queryByText(/Aksi kontrak butuh izin/))).toBe(
        role.startsWith("HR_ADMIN"),
      );
    },
  );
  it("karyawan nonaktif tidak diberi aksi walau akses tersisa", async () => {
    await card("PKWT", {}, false);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("Riwayat menampilkan tabel lengkap termasuk tahap ditutup", async () => {
    response = data({
      contracts: [
        { ...contract, status: "EXTENDED" },
        { ...contract, id: "c2", sequence: 2 },
      ],
    });
    mount(<EmployeeContractHistory employeeId="e1" />);
    const table = await screen.findByRole("region", { name: "Riwayat kontrak" });
    expect(within(table).getByText("Diperpanjang")).toBeVisible();
    expect(within(table).getByText("PKWT 2")).toBeVisible();
  });
});

describe("Dialog kontrak", () => {
  function dialog(
    action: "extend" | "create" | "correct" | "promote" | "fail" | "end" = "extend",
    overrides: Partial<EmployeeContracts> = {},
  ) {
    return mount(
      <EmploymentContractDialog
        employeeId="e1"
        action={action}
        data={data(overrides)}
        active={contract}
        firstStart="2026-01-01"
        onClose={vi.fn()}
      />,
    );
  }
  it("perpanjang: bawaan H+1, durasi >1 tahun diblokir, jeda warning tetap bisa simpan", async () => {
    const { client } = dialog();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    expect(screen.getByLabelText("Mulai kontrak")).toHaveValue("2028-01-01");
    expect(screen.getByLabelText("Akhir kontrak")).toHaveValue("2028-12-31");
    fireEvent.change(screen.getByLabelText("Akhir kontrak"), { target: { value: "2029-01-01" } });
    expect(screen.getByText("PKWT 2/3 maksimal 1 tahun.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Mulai kontrak"), { target: { value: "2028-01-02" } });
    expect(screen.getByText(/Ada jeda antar-tahap/)).toHaveClass("text-amber-700");
    expect(screen.getByRole("button", { name: "Simpan" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      path: "/employees/e1/contracts/c1/extend",
      body: { startDate: "2028-01-02", endDate: "2029-01-01" },
    });
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith("Peringatan dari server"));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["employees"] });
  });
  it("KTR-D12 koreksi: isi tanggal aktif, Akhir tidak dihitung ulang, alasan wajib, batas tetap dicek", async () => {
    dialog("correct");
    expect(screen.getByRole("heading", { name: "Koreksi data kontrak" })).toBeVisible();
    expect(screen.getByLabelText("Tahap")).toBeDisabled();
    expect(screen.getByLabelText("Mulai kontrak")).toHaveValue("2026-01-01");
    expect(screen.getByLabelText("Akhir kontrak")).toHaveValue("2027-12-31");
    fireEvent.change(screen.getByLabelText("Mulai kontrak"), { target: { value: "2026-02-01" } });
    // Koreksi data: Akhir tidak ikut dihitung ulang.
    expect(screen.getByLabelText("Akhir kontrak")).toHaveValue("2027-12-31");
    // Alasan kosong → Simpan mati.
    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Alasan koreksi (wajib)"), {
      target: { value: "Salah input" },
    });
    expect(screen.getByRole("button", { name: "Simpan" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Akhir kontrak"), { target: { value: "2028-02-01" } });
    expect(screen.getByText("PKWT 1 maksimal 2 tahun.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Akhir kontrak"), { target: { value: "2028-01-31" } });
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      path: "/employees/e1/contracts/c1/correct",
      body: { startDate: "2026-02-01", endDate: "2028-01-31", note: "Salah input" },
    });
  });
  it("KTR-D12: tombol Koreksi data kontrak hanya untuk yang berhak & ada kontrak aktif", async () => {
    await card("PKWT", { contracts: [contract] });
    expect(screen.getByRole("button", { name: "Koreksi data kontrak" })).toBeVisible();
  });
  it("tanggal mulai dikosongkan: tidak crash dan simpan mati", () => {
    dialog();
    fireEvent.change(screen.getByLabelText("Mulai kontrak"), { target: { value: "" } });
    expect(screen.getByText("Tanggal kontrak tidak valid.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
  });
  it("isi percobaan: bawaan tiga bulan dan durasi lebih panjang ditolak", () => {
    dialog("create", { category: "PROBATION", joinDate: "2026-10-01" });
    expect(screen.getByLabelText("Akhir kontrak")).toHaveValue("2026-12-31");
    fireEvent.change(screen.getByLabelText("Akhir kontrak"), { target: { value: "2027-01-01" } });
    expect(screen.getByText("Masa percobaan maksimal 3 bulan.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
  });
  it("403 tetap membuka dialog dan menampilkan pesan API", async () => {
    postError = true;
    dialog("promote");
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Izin kontrak dicabut."));
    expect(screen.getByRole("dialog")).toBeVisible();
  });
  it("isi tahap lama: PKWT 3 membutuhkan mulai PKWT 1 dan batas empat tahun", () => {
    dialog("create");
    fireEvent.change(screen.getByLabelText("Tahap"), { target: { value: "3" } });
    expect(screen.getByLabelText("Mulai PKWT 1")).toBeRequired();
    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Mulai PKWT 1"), { target: { value: "2015-01-01" } });
    expect(screen.getByText(/Total masa PKWT maksimal/)).toBeVisible();
  });
  it("isi PKWT 2 lama mengirim awal PKWT 1", async () => {
    dialog("create", { joinDate: "2024-01-01" });
    fireEvent.change(screen.getByLabelText("Tahap"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Mulai kontrak"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Mulai PKWT 1"), { target: { value: "2024-01-01" } });
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      path: "/employees/e1/contracts",
      body: {
        kind: "PKWT",
        sequence: 2,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        firstPkwtStartDate: "2024-01-01",
      },
    });
  });
  it.each(["end", "fail"] as const)(
    "%s: konfirmasi nonaktif wajib dan rute tepat",
    async (action) => {
      dialog(action, { category: action === "fail" ? "PROBATION" : "PKWT" });
      expect(screen.getByText(/akun login ikut nonaktif/)).toBeVisible();
      expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
      await userEvent.click(screen.getByRole("checkbox"));
      await userEvent.click(screen.getByRole("button", { name: "Simpan" }));
      await waitFor(() => expect(posts).toHaveLength(1));
      expect(posts[0]?.path).toBe(
        action === "fail" ? "/employees/e1/probation/fail" : "/employees/e1/contracts/c1/end",
      );
    },
  );
  it("promote mengirim tanggal efektif", async () => {
    dialog("promote");
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      path: "/employees/e1/promote",
      body: { effectiveDate: "2026-11-25" },
    });
  });
});

describe("Ubah Status dengan kontrak", () => {
  it.each(["PKWT", "PROBATION"] as const)(
    "asal %s ditolak dan ditautkan ke detail",
    async (category) => {
      mount(
        <ChangeCategoryForm
          employee={{ ...employee, employmentStatus: { ...employee.employmentStatus, category } }}
          onDone={vi.fn()}
        />,
      );
      await screen.findByText("Gunakan tab Kepegawaian di detail karyawan");
      await userEvent.click(await screen.findByRole("radio", { name: /Karyawan Tetap/ }));
      expect(screen.getByRole("button", { name: "Simpan perubahan" })).toBeDisabled();
      expect(screen.getByRole("link", { name: "Buka detail karyawan" })).toHaveAttribute(
        "href",
        "/personal/pegawai-aktif/semua?pegawai=e1&tab=work",
      );
      expect(posts).toHaveLength(0);
    },
  );
  it.each(["PKWT", "Karyawan Percobaan"])(
    "tujuan %s menampilkan kontrak dan mengirim periodenya",
    async (name) => {
      mount(
        <ChangeCategoryForm
          employee={{
            ...employee,
            employmentStatus: { id: "s2", name: "Permanen", category: "PERMANENT" },
          }}
          onDone={vi.fn()}
        />,
      );
      await userEvent.click(await screen.findByRole("radio", { name }));
      expect(screen.getByLabelText("Mulai kontrak")).toBeVisible();
      if (name === "PKWT") {
        fireEvent.change(screen.getByLabelText("Akhir kontrak"), {
          target: { value: "2030-01-01" },
        });
        expect(screen.getByRole("button", { name: "Simpan perubahan" })).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Akhir kontrak"), {
          target: { value: "2027-01-01" },
        });
      }
      await userEvent.click(screen.getByRole("button", { name: "Simpan perubahan" }));
      await waitFor(() => expect(posts).toHaveLength(1));
      expect(posts[0]?.body).toMatchObject({ contract: { startDate: "2026-11-25" } });
      expect(posts[0]?.path).toBe("/employees/e1/status-change");
    },
  );
});

function thl(status: ThlStatus = "REQUIRED", wage = true) {
  const counts =
    status === "REQUIRED" ? [22, 22, 22] : status === "APPROACHING" ? [14, 21, 22] : [10, 10, 10];
  return {
    evaluation: evaluateThlAttendance(
      ["2026-08", "2026-09", "2026-10"].map((month, i) => ({
        month,
        presentDays: counts[i] ?? 0,
        pendingDays: i === 2 ? 2 : 0,
      })),
      new Date("2026-11-25T05:00:00Z"),
    ),
    dailyWage: { amount: 150000, effectiveFrom: "2026-08-01" },
    wageHistory: [{ id: "w1", amount: 150000, effectiveFrom: "2026-08-01", note: "Penetapan" }],
    access: { wage },
  };
}
describe("K4 THL", () => {
  it.each(["NONE", "APPROACHING", "REQUIRED"] as const)(
    "kartu %s: tiga bulan penuh dan bulan berjalan",
    async (status) => {
      await card("DAILY_WORKER", { contracts: [], tier: "THL", thl: thl(status) });
      expect(screen.getByText(THL_STATUS_LABELS[status])).toBeVisible();
      for (const month of ["Agu 2026", "Sep 2026", "Okt 2026"])
        expect(screen.getByText(month)).toBeVisible();
      expect(screen.getByText("2 menunggu persetujuan")).toBeVisible();
      expect(screen.getByText(/Bulan berjalan.*Nov 2026/)).toBeVisible();
      expect(screen.getByText("Rp 150.000")).toBeVisible();
      if (status === "REQUIRED") {
        expect(screen.getByText(/PP 35\/2021 Ps. 10/)).toBeVisible();
        expect(screen.getByRole("button", { name: "Jadikan Karyawan Tetap" })).toHaveAttribute(
          "data-variant",
          "destructive",
        );
      }
    },
  );
  it("tanpa akses wage tidak menampilkan baris, tombol, atau riwayat upah", async () => {
    await card("DAILY_WORKER", { contracts: [], tier: "THL", thl: thl("APPROACHING", false) });
    expect(screen.queryByText(/Upah harian/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rp /)).not.toBeInTheDocument();
    expect(screen.queryByText(/tersembunyi/i)).not.toBeInTheDocument();
    expect(screen.getByText("Mendekati batas")).toBeVisible();
  });
  it("dialog memvalidasi, PUT upah, lalu menyegarkan kartu", async () => {
    await card("DAILY_WORKER", { contracts: [], tier: "THL", thl: thl() });
    await userEvent.click(screen.getByRole("button", { name: "Ubah upah harian" }));
    const dialog = screen.getByRole("dialog");
    const save = within(dialog).getByRole("button", { name: "Simpan upah harian" });
    expect(save).toBeDisabled();
    expect(screen.getByLabelText("Tanggal berlaku")).toHaveValue("2026-11-25");
    fireEvent.change(screen.getByLabelText("Upah harian (Rp)"), { target: { value: "-1" } });
    await userEvent.type(screen.getByLabelText("Alasan perubahan (wajib)"), "Penyesuaian");
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Upah harian (Rp)"), { target: { value: "170000" } });
    await userEvent.click(save);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(posts).toEqual([
      {
        path: "/employees/e1/daily-wage",
        body: { amount: 170000, effectiveFrom: "2026-11-25", note: "Penyesuaian" },
      },
    ]);
    expect(await screen.findByText("Rp 170.000")).toBeVisible();
    expect(reads.filter((path) => path.endsWith("/contracts")).length).toBeGreaterThan(1);
  });
  it("error API tetap terlihat di dialog", async () => {
    await card("DAILY_WORKER", { contracts: [], tier: "THL", thl: thl() });
    postError = true;
    await userEvent.click(screen.getByRole("button", { name: "Ubah upah harian" }));
    await userEvent.type(screen.getByLabelText("Alasan perubahan (wajib)"), "Uji izin");
    await userEvent.click(screen.getByRole("button", { name: "Simpan upah harian" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Izin upah dicabut.");
    expect(screen.getByRole("dialog")).toBeVisible();
  });
});
