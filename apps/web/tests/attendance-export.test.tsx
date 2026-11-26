import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/app/feature-flags";
import type { Me } from "@/features/auth/schemas";
import { setSelectedCompany } from "@/features/employee/company-scope";
import { tmAccess } from "@/features/time-management/access";
import { downloadBytes } from "@/lib/xlsx-write";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/xlsx-write", () => ({ downloadBytes: vi.fn() }));

// TM-D31: tombol & dialog Export Excel / Flash di Data Absen Harian.

const COMPANY = "11111111-1111-4111-8111-111111111111";
const CREW_A = "22222222-2222-4222-8222-222222222222";
const CREW_B = "33333333-3333-4333-8333-333333333333";
const crew = (id: string, name: string) => ({
  id,
  companyId: COMPANY,
  workLocation: null,
  name,
  pattern: { id: "p", name: "Pola", steps: ["PAGI"] },
  cycleStartDate: "2026-01-01",
  members: [],
});

const PEOPLE = [
  {
    id: "44444444-4444-4444-8444-444444444444",
    fullName: "Andi Uji",
    employeeNumber: "N-1",
    position: "Operator",
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    fullName: "Budi Uji",
    employeeNumber: "N-2",
    position: null,
  },
];

function backend(
  role: Me,
  options: { status?: number; message?: string } = {},
): { posts: Record<string, unknown>[] } {
  const posts: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname.replace("/api/v1", "");
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (path === "/me") return json({ data: role });
      if (path === "/health")
        return json({ data: { status: "ok", checks: { database: "ok" }, time: "x" } });
      if (path === "/notifications")
        return json({ data: [], meta: { page: 1, pageSize: 5, total: 0, unreadCount: 0 } });
      if (path === "/master-data")
        return json({
          data: {
            companies: [{ id: COMPANY, code: "ACP", name: "PT Uji" }],
            departments: [],
            positions: [],
            employmentStatuses: [],
            grades: [],
            workLocations: [],
            homebases: [],
          },
        });
      if (path === "/crews")
        return json({ data: [crew(CREW_A, "Crew A"), crew(CREW_B, "Crew B")] });
      if (path === "/attendance/days") return json({ data: [] });
      if (path === "/attendance/people")
        return json({
          data: PEOPLE.map((p) => ({
            ...p,
            company: null,
            crew: null,
            division: null,
            isActive: true,
            firstWorkDate: "2026-01-01",
            lastWorkDate: "2026-11-24",
            lastPunchAt: null,
            todayStatus: null,
            photoUrl: null,
          })),
          meta: { page: 1, pageSize: 24, total: PEOPLE.length },
        });
      if (path === "/attendance/days/export") {
        posts.push(JSON.parse(String(init?.body)));
        if (options.status)
          return json(
            {
              error: {
                code: options.status === 403 ? "FORBIDDEN" : "BUSINESS_RULE_VIOLATION",
                message: options.message ?? "",
                requestId: "r",
              },
            },
            options.status,
          );
        return json({ data: { fileName: "absensi-server.xlsx", rows: 3, contentBase64: "UEs=" } });
      }
      return json({ data: [] });
    }),
  );
  return { posts };
}

// Rentang halaman = 10–24 Nov 2026 (hari ini dibekukan 24 Nov 2026). Tanggal dipilih lewat kalender.
const clickDay = (label: string) =>
  userEvent.click(screen.getByRole("button", { name: new RegExp(`^\\w+, ${label}( |,|$)`) }));
const monthsBack = async (n: number) => {
  for (let i = 0; i < n; i++)
    await userEvent.click(screen.getByRole("button", { name: "Bulan sebelumnya" }));
};
const monthsForward = async (n: number) => {
  for (let i = 0; i < n; i++)
    await userEvent.click(screen.getByRole("button", { name: "Bulan berikutnya" }));
};
/** Buka "Dari", ke bulan lampau `back` bulan, pilih tanggal awal lalu tanggal akhir (popover menutup). */
async function pickRange(back: number, fromDay: string, toDay: string) {
  await userEvent.click(screen.getByLabelText("Dari"));
  await monthsBack(back);
  await clickDay(fromDay);
  await clickDay(toDay);
}

// Dialog dimuat lazy oleh halaman; panaskan modulnya (transform react-day-picker) di luar waktu tunggu tes.
beforeAll(async () => {
  await import("@/features/time-management/components/attendance-export-dialog");
}, 60000);

beforeEach(() => {
  authState.session = { access_token: "tok", user: { id: "u1" } };
  setSelectedCompany(COMPANY);
  vi.mocked(downloadBytes).mockClear();
  vi.mocked(toast.success).mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-24T05:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
  setSelectedCompany(null);
});

describe("tmAccess.exportDays", () => {
  it("SA, HR, MANAGER ber-karyawan boleh; EMPLOYEE & MANAGER tanpa karyawan tidak", () => {
    expect(tmAccess.exportDays(me("SUPER_ADMIN"))).toBe(true);
    expect(tmAccess.exportDays(me("HR_ADMIN"))).toBe(true);
    expect(tmAccess.exportDays(me("MANAGER", false, "m1"))).toBe(true);
    expect(tmAccess.exportDays(me("MANAGER"))).toBe(false);
    expect(tmAccess.exportDays(me("EMPLOYEE", false, "e1"))).toBe(false);
  });
});

describe.skipIf(!FEATURES.timeManagement)(
  "Data Absen Harian › Export Excel & Flash (TM-D31)",
  () => {
    it.each([
      ["SUPER_ADMIN", me("SUPER_ADMIN")],
      ["HR_ADMIN", me("HR_ADMIN")],
      ["MANAGER", me("MANAGER", false, "m1")],
    ] as const)(
      "%s melihat kedua tombol",
      async (_name, account) => {
        backend(account);
        renderAt("/time/absen-harian");
        // Kasus pertama memuat rute secara lazy (dingin): beri waktu lebih lama dari bawaan 5 dtk.
        expect(
          await screen.findByRole("button", { name: /Export Excel/ }, { timeout: 20000 }),
        ).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Flash/ })).toBeInTheDocument();
      },
      30000,
    );

    it("EMPLOYEE tidak melihat tombol", async () => {
      backend(me("EMPLOYEE", false, "e1"));
      renderAt("/time/absen-harian");
      await screen.findByRole("heading", { name: /Absen/ }).catch(() => null);
      await waitFor(() => expect(screen.queryByRole("button", { name: /Flash/ })).toBeNull());
      expect(screen.queryByRole("button", { name: /Export Excel/ })).toBeNull();
    });

    it("rentang > 92 hari tidak bisa dipilih: tanggal di luar batas nonaktif, tak ada permintaan", async () => {
      const { posts } = backend(me("SUPER_ADMIN"));
      renderAt("/time/absen-harian");
      await userEvent.click(await screen.findByRole("button", { name: /Export Excel/ }));
      const dialog = await screen.findByRole("dialog");
      await userEvent.click(screen.getByLabelText("Dari"));
      await monthsBack(3);
      await clickDay("1 Agustus 2026");
      await monthsForward(2);
      // 1 Agu + 91 hari = 31 Okt (92 hari, boleh); 1 Nov = 93 hari (nonaktif).
      expect(screen.getByRole("button", { name: /^Sabtu, 31 Oktober 2026/ })).toBeEnabled();
      expect(screen.getByRole("button", { name: /^Minggu, 1 November 2026/ })).toBeDisabled();
      expect(within(dialog).getByText(/dipilih 1 hari/)).toBeInTheDocument();
      expect(posts).toHaveLength(0);
    });

    it("crew terpilih dikirim sebagai crewIds + includeNoCrew + companyId; unduh memakai nama berkas server", async () => {
      const { posts } = backend(me("SUPER_ADMIN"));
      renderAt("/time/absen-harian");
      await userEvent.click(await screen.findByRole("button", { name: /Export Excel/ }));
      const dialog = await screen.findByRole("dialog");
      await pickRange(8, "1 Maret 2026", "31 Maret 2026");
      await userEvent.click(within(dialog).getByRole("radio", { name: "Pilih crew tertentu" }));
      expect(
        within(dialog).getByRole("checkbox", { name: "Sertakan karyawan tanpa crew" }),
      ).not.toBeChecked();
      await userEvent.click(await within(dialog).findByRole("checkbox", { name: "Crew B" }));
      await userEvent.click(within(dialog).getByRole("button", { name: "Unduh Excel" }));
      await waitFor(() =>
        expect(posts).toEqual([
          {
            kind: "DETAIL",
            from: "2026-03-01",
            to: "2026-03-31",
            companyId: COMPANY,
            crewIds: [CREW_B],
            includeNoCrew: false,
          },
        ]),
      );
      expect(downloadBytes).toHaveBeenCalledWith(
        new Uint8Array([80, 75]),
        "absensi-server.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("Semua crew: tanpa crewIds, includeNoCrew true; tanpa PT terpilih crew tertentu dinonaktifkan", async () => {
      setSelectedCompany(null);
      const { posts } = backend(me("SUPER_ADMIN"));
      renderAt("/time/absen-harian");
      await userEvent.click(await screen.findByRole("button", { name: /Export Excel/ }));
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByRole("radio", { name: "Pilih crew tertentu" })).toBeDisabled();
      expect(within(dialog).getByText(/Pilih PT di bilah atas/)).toBeInTheDocument();
      await userEvent.click(within(dialog).getByRole("button", { name: "Unduh Excel" }));
      await waitFor(() => expect(posts).toHaveLength(1));
      expect(posts[0]).toMatchObject({ kind: "DETAIL", includeNoCrew: true });
      expect(posts[0]).not.toHaveProperty("crewIds");
      expect(posts[0]).not.toHaveProperty("companyId");
    });

    it("Flash hanya mengirim kind, from, to, companyId", async () => {
      const { posts } = backend(me("HR_ADMIN"));
      renderAt("/time/absen-harian");
      await userEvent.click(await screen.findByRole("button", { name: /Flash/ }));
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).queryByText("Crew")).toBeNull();
      await pickRange(7, "1 April 2026", "7 April 2026");
      await userEvent.click(within(dialog).getByRole("button", { name: "Unduh Flash" }));
      await waitFor(() =>
        expect(posts).toEqual([
          { kind: "FLASH", from: "2026-04-01", to: "2026-04-07", companyId: COMPANY },
        ]),
      );
    });

    it("422 menampilkan pesan server dan dialog tetap terbuka", async () => {
      backend(me("SUPER_ADMIN"), {
        status: 422,
        message: "Terlalu banyak baris — persempit rentang atau pilih satu PT.",
      });
      renderAt("/time/absen-harian");
      await userEvent.click(await screen.findByRole("button", { name: /Flash/ }));
      const dialog = await screen.findByRole("dialog");
      await userEvent.click(within(dialog).getByRole("button", { name: "Unduh Flash" }));
      expect(
        await within(dialog).findByText(
          "Terlalu banyak baris — persempit rentang atau pilih satu PT.",
        ),
      ).toBeInTheDocument();
      expect(downloadBytes).not.toHaveBeenCalled();
    });

    it("403 menampilkan pesan tidak berhak", async () => {
      backend(me("HR_ADMIN"), { status: 403, message: "Forbidden" });
      renderAt("/time/absen-harian");
      await userEvent.click(await screen.findByRole("button", { name: /Flash/ }));
      const dialog = await screen.findByRole("dialog");
      await userEvent.click(within(dialog).getByRole("button", { name: "Unduh Flash" }));
      expect(await within(dialog).findByText(/tidak berhak/)).toBeInTheDocument();
    });

    // TM-D34: dialog Detail — karyawan, kelompok kolom, filter baris.
    describe("Export Detail (TM-D34)", () => {
      const openDetail = async () => {
        const out = backend(me("SUPER_ADMIN"));
        renderAt("/time/absen-harian");
        await userEvent.click(await screen.findByRole("button", { name: /Export Excel/ }));
        const dialog = await screen.findByRole("dialog");
        return { ...out, dialog };
      };

      it("bawaan: Identitas terkunci, kolom bawaan tercentang, body tanpa columnGroups/statuses/labeledOnly", async () => {
        const { posts, dialog } = await openDetail();
        const identity = within(dialog).getByRole("checkbox", { name: "Identitas" });
        expect(identity).toBeChecked();
        expect(identity).toBeDisabled();
        for (const name of [
          "Jadwal",
          "Clock In & Clock Out",
          "Lokasi & peta",
          "Label",
          "Lembar Ringkasan",
        ])
          expect(within(dialog).getByRole("checkbox", { name })).toBeChecked();
        for (const name of ["Alasan", "Istirahat", "Persetujuan", "Telat & pulang cepat"])
          expect(within(dialog).getByRole("checkbox", { name })).not.toBeChecked();
        for (const name of [
          "Menunggu",
          "Disetujui",
          "Ditolak",
          "Alpha",
          "Cuti/izin/sakit",
          "OFF/Time off",
          "Tanpa absen",
        ])
          expect(within(dialog).getByRole("checkbox", { name })).toBeChecked();
        expect(within(dialog).getByRole("radio", { name: "Sesuai crew" })).toBeChecked();
        await userEvent.click(within(dialog).getByRole("button", { name: "Unduh Excel" }));
        await waitFor(() => expect(posts).toHaveLength(1));
        expect(posts[0]).toEqual({
          kind: "DETAIL",
          from: "2026-11-10",
          to: "2026-11-24",
          companyId: COMPANY,
          includeNoCrew: true,
        });
      });

      it("kelompok kolom & filter baris dikirim; berlabel true", async () => {
        const { posts, dialog } = await openDetail();
        await userEvent.click(within(dialog).getByRole("checkbox", { name: "Alasan" }));
        await userEvent.click(within(dialog).getByRole("checkbox", { name: "Label" }));
        await userEvent.click(within(dialog).getByRole("checkbox", { name: "Alpha" }));
        await userEvent.click(
          within(dialog).getByRole("checkbox", { name: "Hanya yang berlabel" }),
        );
        await userEvent.click(within(dialog).getByRole("button", { name: "Unduh Excel" }));
        await waitFor(() => expect(posts).toHaveLength(1));
        expect(posts[0]).toMatchObject({
          columnGroups: ["SCHEDULE", "CLOCK", "LOCATION", "SUMMARY", "REASON"],
          statuses: ["PENDING", "APPROVED", "REJECTED", "LEAVE", "OFF", "NO_RECORD"],
          labeledOnly: true,
        });
      });

      it("tanpa status terpilih: tombol Unduh nonaktif", async () => {
        const { dialog } = await openDetail();
        for (const name of [
          "Menunggu",
          "Disetujui",
          "Ditolak",
          "Alpha",
          "Cuti/izin/sakit",
          "OFF/Time off",
          "Tanpa absen",
        ])
          await userEvent.click(within(dialog).getByRole("checkbox", { name }));
        expect(within(dialog).getByText("Pilih minimal satu status.")).toBeInTheDocument();
        expect(within(dialog).getByRole("button", { name: "Unduh Excel" })).toBeDisabled();
      });

      it("Pilih karyawan tertentu: kosong → nonaktif; terpilih → employeeIds tanpa crewIds", async () => {
        const { posts, dialog } = await openDetail();
        await userEvent.click(
          within(dialog).getByRole("radio", { name: "Pilih karyawan tertentu" }),
        );
        expect(within(dialog).getByRole("button", { name: "Unduh Excel" })).toBeDisabled();
        await userEvent.click(await within(dialog).findByRole("checkbox", { name: /Budi Uji/ }));
        await userEvent.click(within(dialog).getByRole("checkbox", { name: /Andi Uji/ }));
        expect(within(dialog).getByText(/2 karyawan dipilih \(maksimal 500\)/)).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Hapus Budi Uji" }));
        expect(within(dialog).getByText(/1 karyawan dipilih/)).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Unduh Excel" }));
        await waitFor(() => expect(posts).toHaveLength(1));
        expect(posts[0]).toMatchObject({ employeeIds: [PEOPLE[0]?.id] });
        expect(posts[0]).not.toHaveProperty("crewIds");
        expect(posts[0]).not.toHaveProperty("includeNoCrew");
        expect(posts[0]).not.toHaveProperty("q");
      });

      it("Sesuai filter halaman ini: q kosong dikirim, status terisi dari tab (Menunggu), tetap bisa diubah", async () => {
        const { posts, dialog } = await openDetail();
        await userEvent.click(
          within(dialog).getByRole("radio", { name: "Sesuai filter halaman ini" }),
        );
        expect(within(dialog).getAllByText(/Butuh keputusan/).length).toBeGreaterThan(0);
        expect(within(dialog).getByRole("checkbox", { name: "Menunggu" })).toBeChecked();
        expect(within(dialog).getByRole("checkbox", { name: "Disetujui" })).not.toBeChecked();
        await userEvent.click(within(dialog).getByRole("checkbox", { name: "Disetujui" }));
        await userEvent.click(within(dialog).getByRole("button", { name: "Unduh Excel" }));
        await waitFor(() => expect(posts).toHaveLength(1));
        expect(posts[0]).toMatchObject({ q: "", statuses: ["PENDING", "APPROVED"] });
        expect(posts[0]).not.toHaveProperty("includeNoCrew");
        expect(posts[0]).not.toHaveProperty("employeeIds");
      });
    });
  },
);
