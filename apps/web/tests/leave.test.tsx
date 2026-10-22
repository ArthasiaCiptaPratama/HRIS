import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/app/feature-flags";
import { addDays, todayIn } from "@/features/time-management/components/display";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// TM-D9 — cuti: sisa hangus 31 Desember, pengajuan ulang yang ditolak, hak cuti karyawan keluar.

type Role = Omit<ReturnType<typeof me>, "grants"> & {
  grants: { permission: string; expiresAt: string | null }[];
};
type Call = { method: string; path: string; search: string; body: unknown };

const annual = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "CT",
  name: "Cuti Tahunan",
  category: "ANNUAL",
  maxDaysPerRequest: null,
  documentRequiredAfterDays: null,
  description: null,
  documentLabel: null,
  isActive: true,
  sortOrder: 0,
};

const summary = (year: number, balance: number) => ({
  year,
  granted: 12,
  adjusted: 0,
  used: 12 - balance,
  held: 0,
  collective: 0,
  expired: 0,
  settled: 0,
  balance,
});

const rejected = {
  id: "22222222-2222-4222-8222-222222222222",
  employee: { id: "emp-1", fullName: "Agus Pratama", employeeNumber: "ACP-1" },
  type: { id: annual.id, code: "CT", name: "Cuti Tahunan", category: "ANNUAL" },
  startDate: "2026-10-12",
  endDate: "2026-10-13",
  workDates: ["2026-10-12", "2026-10-13"],
  days: 2,
  annualDays: 2,
  reason: "Acara keluarga di kampung",
  attachmentUrl: null,
  status: "REJECTED",
  createdAt: "2026-10-05T03:00:00.000Z",
  decidedAt: "2026-10-06T03:00:00.000Z",
  approval: null,
  canCancel: false,
  rejectionNote: "Kapal sedang sandar, tim kurang orang",
  resubmittedFrom: null,
  resubmitUntil: "2027-04-06",
  canResubmit: true,
};

const exitRow = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  employee: { id: `emp-${id}`, fullName: name, employeeNumber: `ACP-${id}` },
  companyId: "co-acp",
  exitDate: "2026-10-15",
  exitReason: "RESIGNATION",
  year: 2026,
  remainingDays: 4,
  debtDays: 0,
  pendingDays: 0,
  formula: "SIX_DAY",
  divisor: 25,
  status: "OPEN",
  note: null,
  decidedAt: null,
  dailyWage: null,
  payAmount: null,
  debtAmount: null,
  wageMissing: false,
  ...extra,
});

function mockFetch(
  role: Role,
  opts: { preview?: Record<string, unknown>; exits?: unknown[] } = {},
): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const path = url.pathname.replace("/api/v1", "");
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path, search: url.search, body });
      const json = (status: number, payload: unknown) =>
        new Response(JSON.stringify(payload), {
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
            departments: [],
            positions: [],
            employmentStatuses: [],
            grades: [],
            workLocations: [],
          },
        });
      if (path === "/leave/me")
        return json(200, {
          data: {
            year: 2026,
            balances: [summary(2025, 3), summary(2026, 8)],
            carryUntil: null,
            expiresOn: "2026-12-31",
            ledger: [],
            requests: [rejected],
          },
        });
      if (path === "/leave-types") return json(200, { data: [annual] });
      if (path === "/leave/preview")
        return json(200, {
          data: {
            dates: [body.startDate],
            days: 1,
            annualDays: 1,
            charges: [{ year: 2026, days: 1 }],
            balances: [{ year: 2026, balance: 7 }],
            documentRequired: false,
            conflicts: [],
            expiredYear: null,
            ...opts.preview,
          },
        });
      if (path === "/leave-requests" && method === "POST")
        return json(201, {
          data: {
            ...rejected,
            id: "33333333-3333-4333-8333-333333333333",
            status: "PENDING",
            startDate: body.startDate,
            endDate: body.endDate,
            rejectionNote: null,
            resubmittedFrom: { ...rejected, rejectionNote: rejected.rejectionNote },
            resubmitUntil: null,
            canResubmit: false,
          },
        });
      if (path === "/leave-requests")
        return json(200, {
          data: [
            {
              ...rejected,
              id: "44444444-4444-4444-8444-444444444444",
              status: "PENDING",
              startDate: "2026-11-02",
              endDate: "2026-11-03",
              rejectionNote: null,
              resubmittedFrom: {
                id: rejected.id,
                startDate: rejected.startDate,
                endDate: rejected.endDate,
                rejectionNote: rejected.rejectionNote,
              },
              resubmitUntil: null,
              canResubmit: false,
            },
          ],
        });
      if (path === "/leave-exit-settlements") return json(200, { data: opts.exits ?? [] });
      if (/^\/leave-exit-settlements\/[^/]+\/(paid|recalculate)$/.test(path)) {
        const id = path.split("/")[2];
        const row = (opts.exits as { id: string }[]).find((r) => r.id === id);
        return json(200, {
          data: { ...row, status: path.endsWith("/paid") ? "PAID" : "OPEN" },
        });
      }
      if (path === "/leave-balances") return json(200, { data: [] });
      return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
    }),
  );
  return calls;
}

const employee = (): Role => me("EMPLOYEE", false, "emp-1");
const withCost = (role: Role): Role => ({
  ...role,
  grants: [{ permission: "labor.cost.read", expiresAt: null }],
});

beforeEach(() => {
  authState.session = { access_token: "tok", user: { id: "u1" } };
});
afterEach(() => vi.unstubAllGlobals());

describe.skipIf(!FEATURES.timeManagement)("Time Management › Cuti (TM-D9)", () => {
  it("saldo hangus 31 Des; sisa tahun lalu tidak tampil bila carryUntil null", async () => {
    mockFetch(employee());
    renderAt("/time/cuti");
    expect(await screen.findByText("Saldo cuti 2026")).toBeInTheDocument();
    expect(screen.getByText(/Hangus 31 Des 2026/)).toBeInTheDocument();
    expect(screen.queryByText("Sisa 2025")).not.toBeInTheDocument();
  });

  it("pengajuan ditolak menampilkan alasan; Ajukan ulang mengisi form & mengirim resubmitOfId", async () => {
    const user = userEvent.setup();
    const calls = mockFetch(employee());
    renderAt("/time/cuti");
    expect(
      await screen.findByText(/Alasan penolakan: Kapal sedang sandar, tim kurang orang/),
    ).toBeInTheDocument();
    expect(screen.getByText(/s\.d\. 06 Apr 2027/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ajukan ulang" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Ajukan ulang pengajuan yang ditolak")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Alasan")).toHaveValue("Acara keluarga di kampung");
    const tomorrow = addDays(todayIn(), 1);
    const start = within(dialog).getByLabelText("Mulai");
    expect(start).toHaveValue(tomorrow);
    expect(start).toHaveAttribute("min", tomorrow);

    const send = within(dialog).getByRole("button", { name: "Kirim" });
    await waitFor(() => expect(send).toBeEnabled());
    await user.click(send);
    await waitFor(() =>
      expect(
        calls.find((c) => c.path === "/leave-requests" && c.method === "POST")?.body,
      ).toMatchObject({
        leaveTypeId: annual.id,
        startDate: tomorrow,
        endDate: tomorrow,
        reason: "Acara keluarga di kampung",
        resubmitOfId: rejected.id,
      }),
    );
  });

  it("pratinjau dengan saldo hangus menampilkan pesan & tombol Kirim nonaktif", async () => {
    const user = userEvent.setup();
    mockFetch(employee(), { preview: { expiredYear: 2025 } });
    renderAt("/time/cuti");
    await screen.findByText("Saldo cuti 2026");
    await user.click(screen.getByRole("button", { name: /Ajukan$/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /Cuti Tahunan/ }));
    await user.type(within(dialog).getByLabelText("Alasan"), "Liburan keluarga");
    expect(await within(dialog).findByText(/Saldo cuti 2025 sudah hangus/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Kirim" })).toBeDisabled();
  });
});

describe.skipIf(!FEATURES.timeManagement)("Time Management › Persetujuan Cuti (TM-D9)", () => {
  it("pengajuan ulang diberi badge & alasan penolakan sebelumnya", async () => {
    const user = userEvent.setup();
    mockFetch(me("HR_ADMIN"));
    renderAt("/time/persetujuan-cuti");
    const row = (await screen.findByText("Agus Pratama")).closest("tr") as HTMLElement;
    expect(within(row).getByText("Pengajuan ulang")).toBeInTheDocument();
    expect(
      within(row).getByText(/Sebelumnya ditolak: Kapal sedang sandar, tim kurang orang/),
    ).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Detail" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Pengajuan ulang")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Sebelumnya ditolak: Kapal sedang sandar, tim kurang orang/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/Pengajuan ulang dari/)).toBeInTheDocument();
  });
});

describe.skipIf(!FEATURES.timeManagement)("Time Management › Saldo Cuti › Karyawan keluar", () => {
  it("HR tanpa grant Biaya: kolom rupiah tersembunyi; Tandai diproses memanggil endpoint paid", async () => {
    const user = userEvent.setup();
    const calls = mockFetch(me("HR_ADMIN"), {
      exits: [
        exitRow("1", "Budi Santoso"),
        exitRow("2", "Citra Lestari", {
          status: "PAID",
          debtDays: 2,
          remainingDays: 0,
          formula: "FIVE_DAY",
          divisor: 21,
        }),
      ],
    });
    renderAt("/time/saldo-cuti");
    await user.click(await screen.findByRole("tab", { name: "Karyawan keluar" }));
    const budi = (await screen.findByText("Budi Santoso")).closest("tr") as HTMLElement;
    expect(within(budi).getByText("Mengundurkan diri")).toBeInTheDocument();
    expect(within(budi).getByText("÷25")).toBeInTheDocument();
    expect(within(budi).getByText("Belum diproses payroll")).toBeInTheDocument();
    const citra = screen.getByText("Citra Lestari").closest("tr") as HTMLElement;
    expect(within(citra).getByText("÷21")).toBeInTheDocument();
    expect(within(citra).queryByRole("button", { name: /Tandai diproses/ })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Rupiah" })).not.toBeInTheDocument();

    await user.click(within(budi).getByRole("button", { name: /Tandai diproses/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Catatan (opsional)"), "Payroll Oktober");
    await user.click(within(dialog).getByRole("button", { name: "Tandai diproses" }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === "/leave-exit-settlements/1/paid")?.body).toEqual({
        note: "Payroll Oktober",
      }),
    );
  });

  it("HR ber-grant Biaya melihat upah harian & rupiah; upah kosong diberi tanda", async () => {
    const user = userEvent.setup();
    const calls = mockFetch(withCost(me("HR_ADMIN")), {
      exits: [
        exitRow("1", "Budi Santoso", { dailyWage: 288_000, payAmount: 1_152_000 }),
        exitRow("2", "Citra Lestari", { wageMissing: true }),
      ],
    });
    renderAt("/time/saldo-cuti");
    await user.click(await screen.findByRole("tab", { name: "Karyawan keluar" }));
    const budi = (await screen.findByText("Budi Santoso")).closest("tr") as HTMLElement;
    expect(screen.getByRole("columnheader", { name: "Rupiah" })).toBeInTheDocument();
    expect(within(budi).getByText(/288\.000/)).toBeInTheDocument();
    expect(within(budi).getByText(/1\.152\.000/)).toBeInTheDocument();
    const citra = screen.getByText("Citra Lestari").closest("tr") as HTMLElement;
    expect(within(citra).getByText("upah grade belum diisi")).toBeInTheDocument();

    await user.click(within(citra).getByRole("button", { name: /Hitung ulang/ }));
    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.method === "POST" && c.path === "/leave-exit-settlements/2/recalculate",
        ),
      ).toBe(true),
    );
  });
});
