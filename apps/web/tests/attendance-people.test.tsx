import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/app/feature-flags";
import { workDateLabel } from "@/features/time-management/components/display";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// TM-D33: Data Absen Harian › tampilan "Per karyawan" (kartu karyawan + riwayat per jendela 14 hari).

const VIEW_KEY = "tm.absenHarian.view.acc-HR_ADMIN";

const person = (n: number, over: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  fullName: `Karyawan Contoh ${n}`,
  employeeNumber: `T-${String(n).padStart(4, "0")}`,
  position: "Operator",
  division: "Produksi",
  company: { id: "c1", name: "PT Contoh" },
  crew: { id: "k1", name: "Crew A" },
  isActive: true,
  firstWorkDate: "2026-10-25",
  lastWorkDate: "2026-11-20",
  lastPunchAt: "2026-11-20T01:05:00.000Z",
  todayStatus: "APPROVED",
  photoUrl: null,
  ...over,
});

const punch = (id: string, kind: "IN" | "OUT", at: string) => ({
  id,
  kind,
  at,
  latitude: -1.2,
  longitude: 116.8,
  accuracyM: 8,
  altitudeM: 12,
  distanceM: 30,
  insideGeofence: true,
  location: null,
  labels: [],
  reason: null,
  selfieUrl: null,
  selfiePurged: false,
  status: "APPROVED",
  source: "DEVICE",
  approval: null,
  canCancel: false,
});

const day = (workDate: string, withPunch = true) => ({
  id: `day-${workDate}`,
  employee: { id: "e1", fullName: "Karyawan Contoh 1", employeeNumber: "T-0001" },
  workDate,
  shiftCode: "P",
  scheduledStart: `${workDate}T00:00:00.000Z`,
  scheduledEnd: `${workDate}T08:00:00.000Z`,
  workLocation: { id: "w1", name: "Site Contoh" },
  status: withPunch ? "APPROVED" : "ALPHA",
  labels: [],
  punches: withPunch
    ? [
        punch(`${workDate}-in`, "IN", `${workDate}T00:01:00.000Z`),
        punch(`${workDate}-out`, "OUT", `${workDate}T08:02:00.000Z`),
      ]
    : [],
  approval: null,
});

function mockFetch(opts: { people?: unknown[]; total?: number; daysStatus?: number } = {}) {
  const peopleCalls: URLSearchParams[] = [];
  const dayCalls: URLSearchParams[] = [];
  const list = opts.people ?? [person(1)];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const path = url.pathname.replace("/api/v1", "");
      const json = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (path === "/me") return json(200, { data: { ...me("HR_ADMIN"), companyIds: [] } });
      if (path === "/health")
        return json(200, { data: { status: "ok", checks: { database: "ok" }, time: "x" } });
      if (path === "/notifications")
        return json(200, { data: [], meta: { page: 1, pageSize: 5, total: 0, unreadCount: 0 } });
      if (path === "/attendance/people") {
        peopleCalls.push(url.searchParams);
        const page = Number(url.searchParams.get("page") ?? 1);
        const size = Number(url.searchParams.get("pageSize") ?? 24);
        const q = url.searchParams.get("q")?.toLowerCase();
        const all = q
          ? (list as ReturnType<typeof person>[]).filter((p) =>
              p.fullName.toLowerCase().includes(q),
            )
          : list;
        return json(200, {
          data: all.slice((page - 1) * size, page * size),
          meta: { page, pageSize: size, total: opts.total ?? all.length },
        });
      }
      if (path === "/attendance/days") {
        dayCalls.push(url.searchParams);
        if (opts.daysStatus === 403)
          return json(403, { error: { code: "FORBIDDEN", message: "", requestId: "r" } });
        if (!url.searchParams.get("employeeId")) return json(200, { data: [] });
        const to = url.searchParams.get("to");
        if (to === "2026-11-20")
          return json(200, {
            data: [day("2026-11-12", false), day("2026-11-15"), day("2026-11-20")],
          });
        if (to === "2026-11-06") return json(200, { data: [day("2026-10-30")] });
        return json(200, { data: [] });
      }
      return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
    }),
  );
  return { peopleCalls, dayCalls };
}

beforeEach(() => {
  authState.session = { access_token: "tok", user: { id: "u1" } };
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

const openPeopleView = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole("radio", { name: "Per karyawan (baru)" }));
};

describe.skipIf(!FEATURES.timeManagement)("Data Absen Harian › Per karyawan", () => {
  it("bawaan Per hari (lama): tampilan lama utuh, daftar karyawan tidak diminta", async () => {
    const { peopleCalls } = mockFetch();
    renderAt("/time/absen-harian");
    expect(await screen.findByRole("tab", { name: "Perlu keputusan" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Per hari (lama)" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Per karyawan (baru)" })).not.toBeChecked();
    expect(screen.getByLabelText("Dari tanggal")).toBeInTheDocument();
    expect(peopleCalls).toHaveLength(0);
  });

  it("pilihan tampilan diingat per pengguna di browser", async () => {
    const user = userEvent.setup();
    mockFetch();
    const first = renderAt("/time/absen-harian");
    await openPeopleView(user);
    expect(await screen.findByText("Karyawan Contoh 1")).toBeInTheDocument();
    expect(localStorage.getItem(VIEW_KEY)).toBe("people");
    first.unmount();
    renderAt("/time/absen-harian");
    expect(await screen.findByText("Karyawan Contoh 1")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Per karyawan (baru)" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Per hari (lama)" }));
    expect(await screen.findByRole("tab", { name: "Perlu keputusan" })).toBeInTheDocument();
    expect(localStorage.getItem(VIEW_KEY)).toBe("day");
  });

  it("kartu menampilkan data pokok, inisial tanpa foto, dan terangkat saat hover/fokus", async () => {
    const user = userEvent.setup();
    mockFetch({
      people: [person(1), person(2, { isActive: false, crew: null, todayStatus: null })],
    });
    renderAt("/time/absen-harian");
    await openPeopleView(user);
    const card = await screen.findByRole("button", {
      name: "Buka riwayat absen Karyawan Contoh 1",
    });
    expect(within(card).getByText("T-0001")).toBeInTheDocument();
    expect(within(card).getByText("Operator · Produksi")).toBeInTheDocument();
    expect(within(card).getByText("PT Contoh")).toBeInTheDocument();
    expect(within(card).getByText("Crew A")).toBeInTheDocument();
    expect(within(card).getByText(/Absen terakhir/)).toBeInTheDocument();
    expect(within(card).getByText("Disetujui")).toBeInTheDocument();
    expect(within(card).getByText("KC")).toBeInTheDocument();
    expect(card.querySelector("img")).toBeNull();
    expect(card.className).toContain("hover:-translate-y-1");
    expect(card.className).toContain("focus-visible:-translate-y-1");
    expect(card.className).toContain("motion-reduce:transition-none");
    const second = screen.getByRole("button", { name: "Buka riwayat absen Karyawan Contoh 2" });
    expect(within(second).getByText("Nonaktif")).toBeInTheDocument();
    expect(within(second).getByText("Tanpa crew")).toBeInTheDocument();
    expect(within(second).getByText("Belum ada absen")).toBeInTheDocument();
  });

  it("nama panjang tidak dipotong satu baris: tampil hingga 2 baris + nama lengkap di title", async () => {
    const user = userEvent.setup();
    const longName = "Muhamad Contoh Nama Karyawan Yang Sangat Panjang Sekali";
    mockFetch({ people: [person(1, { fullName: longName })] });
    renderAt("/time/absen-harian");
    await openPeopleView(user);
    const card = await screen.findByRole("button", { name: `Buka riwayat absen ${longName}` });
    const name = within(card).getByText(longName);
    expect(name.className).toContain("line-clamp-2");
    expect(name.className).not.toContain("truncate");
    expect(name).toHaveAttribute("title", longName);
    expect(within(card).getByText("PT Contoh")).toHaveAttribute("title", "PT Contoh");
  });

  it("foto profil dari API dipakai (bukan selfie absen)", async () => {
    const user = userEvent.setup();
    mockFetch({ people: [person(1, { photoUrl: "https://foto.example.test/p1.jpg" })] });
    renderAt("/time/absen-harian");
    await openPeopleView(user);
    const card = await screen.findByRole("button", { name: /Karyawan Contoh 1/ });
    expect(card.querySelector("img")?.getAttribute("src")).toBe("https://foto.example.test/p1.jpg");
  });

  it("cari nama / NIP dikirim ke API (q)", async () => {
    const user = userEvent.setup();
    const { peopleCalls } = mockFetch({ people: [person(1), person(2)] });
    renderAt("/time/absen-harian");
    await openPeopleView(user);
    await screen.findByText("Karyawan Contoh 2");
    await user.type(screen.getByRole("textbox", { name: "Cari karyawan" }), "contoh 2");
    await waitFor(() => expect(peopleCalls.at(-1)?.get("q")).toBe("contoh 2"));
    expect(peopleCalls[0]?.has("q")).toBe(false);
    await waitFor(() => expect(screen.queryByText("Karyawan Contoh 1")).not.toBeInTheDocument());
    expect(screen.getByText("Karyawan Contoh 2")).toBeInTheDocument();
  });

  it("memuat halaman kartu berikutnya lewat tombol Muat lagi", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 25 }, (_, i) => person(i + 1));
    const { peopleCalls } = mockFetch({ people: many });
    renderAt("/time/absen-harian");
    await openPeopleView(user);
    await screen.findByText("Karyawan Contoh 24");
    expect(screen.queryByText("Karyawan Contoh 25")).not.toBeInTheDocument();
    expect(peopleCalls[0]?.get("pageSize")).toBe("24");
    await user.click(screen.getByRole("button", { name: "Muat lagi" }));
    expect(await screen.findByText("Karyawan Contoh 25")).toBeInTheDocument();
    expect(peopleCalls.at(-1)?.get("page")).toBe("2");
    expect(screen.queryByRole("button", { name: "Muat lagi" })).not.toBeInTheDocument();
  });

  it("dialog: hari terbaru dulu, Alpha tanpa absen disembunyikan, hari lama dimuat per jendela 14 hari", async () => {
    const user = userEvent.setup();
    const { dayCalls: allDayCalls } = mockFetch();
    renderAt("/time/absen-harian");
    await openPeopleView(user);
    await user.click(await screen.findByRole("button", { name: /Karyawan Contoh 1/ }));
    // Panggilan tampilan lama (tanpa employeeId) diabaikan; yang dihitung hanya riwayat karyawan.
    const dayCalls = {
      get 0() {
        return allDayCalls.filter((c) => c.has("employeeId"))[0];
      },
      at: (i: number) => allDayCalls.filter((c) => c.has("employeeId")).at(i),
      get length() {
        return allDayCalls.filter((c) => c.has("employeeId")).length;
      },
    };
    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText(`Karyawan Contoh 1 · ${workDateLabel("2026-11-20")}`),
    ).toBeInTheDocument();
    expect(within(dialog).getAllByText(/T-0001 · Shift P/).length).toBe(2);
    const regions = within(dialog).getAllByRole("region", { name: /^Absen / });
    expect(regions.map((r) => r.getAttribute("aria-label"))).toEqual([
      `Absen ${workDateLabel("2026-11-20")}`,
      `Absen ${workDateLabel("2026-11-15")}`,
    ]);
    expect(
      within(dialog).queryByRole("region", { name: `Absen ${workDateLabel("2026-11-12")}` }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getAllByText(/Lihat di peta/).length).toBeGreaterThan(0);
    expect(dayCalls[0]?.get("scope")).toBe("all");
    expect(dayCalls[0]?.get("employeeId")).toBe(person(1).id);
    expect(dayCalls[0]?.get("to")).toBe("2026-11-20");
    expect(dayCalls[0]?.get("from")).toBe("2026-11-07");

    await user.click(within(dialog).getByRole("button", { name: "Muat hari lebih lama" }));
    expect(
      await within(dialog).findByRole("region", { name: `Absen ${workDateLabel("2026-10-30")}` }),
    ).toBeInTheDocument();
    expect(dayCalls.at(-1)?.get("to")).toBe("2026-11-06");
    expect(dayCalls.at(-1)?.get("from")).toBe("2026-10-24");
    // Jendela sudah melewati absen pertama (2026-10-25): berhenti, tak ada jendela ke-3.
    expect(
      within(dialog).queryByRole("button", { name: "Muat hari lebih lama" }),
    ).not.toBeInTheDocument();
    expect(dayCalls).toHaveLength(2);
  });

  it("dialog: pesan jelas bila riwayat di luar cakupan (403)", async () => {
    const user = userEvent.setup();
    mockFetch({ daysStatus: 403 });
    renderAt("/time/absen-harian");
    await openPeopleView(user);
    await user.click(await screen.findByRole("button", { name: /Karyawan Contoh 1/ }));
    expect(
      await screen.findByText("Riwayat absen karyawan ini tidak dapat dibuka dari cakupan Anda."),
    ).toBeInTheDocument();
  });
});
