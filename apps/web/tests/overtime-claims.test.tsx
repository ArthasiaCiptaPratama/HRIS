import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tmOn } from "@/app/feature-flags";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// TM-D27: pengajuan lembur karyawan — form & batal di app absen, keputusan HR di Time › Lembur,
// badge menu Lembur = usulan lembur + pengajuan karyawan, tautan notifikasi `?tab=claims`.

type Call = { method: string; path: string; body: unknown };

const claim = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  employee: { id: "emp-1", fullName: "Agus Pratama", employeeNumber: "ACP-1" },
  companyId: "co-acp",
  workDate: "2026-11-02",
  startTime: null,
  endTime: "20:00",
  reason: "Bongkar muat kapal",
  status: "PENDING",
  approvedStartTime: null,
  approvedEndTime: null,
  decisionNote: null,
  decidedAt: null,
  createdAt: "2026-11-02T14:00:00.000Z",
  checkInAt: "2026-11-02T01:00:00.000Z",
  checkOutAt: "2026-11-02T13:10:00.000Z",
  canDecide: false,
  canCancel: false,
  ...extra,
});

function mockFetch(role: ReturnType<typeof me>, claims: unknown[]) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const path = url.pathname.replace("/api/v1", "");
      const method = init?.method ?? "GET";
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const json = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), {
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
      if (path === "/time/queue")
        return json(200, {
          data: {
            attendance: 0,
            leave: 0,
            corrections: 0,
            rosterChanges: 0,
            overtime: 1,
            overtimeClaims: 2,
            total: 3,
          },
        });
      if (path === "/overtime") return json(200, { data: [] });
      if (path === "/overtime-claims" && method === "GET") return json(200, { data: claims });
      if (path === "/overtime-claims" && method === "POST")
        return json(200, { data: claim("new", { canCancel: true }) });
      if (path.endsWith("/cancel"))
        return json(200, { data: claim("k1", { status: "CANCELLED" }) });
      if (path.endsWith("/decision"))
        return json(200, { data: claim("k1", { status: "REJECTED", decisionNote: "x" }) });
      return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
    }),
  );
  return calls;
}

beforeEach(() => {
  authState.session = { access_token: "tok", user: { id: "u1" } };
});
afterEach(() => vi.unstubAllGlobals());

describe.skipIf(!tmOn("tmAbsen"))("Absen › Ajukan Lembur (TM-D27)", () => {
  it("kirim terkunci tanpa jam & alasan; kirim tanggal, jam, alasan; batalkan yang menunggu", async () => {
    const user = userEvent.setup();
    const calls = mockFetch(me("EMPLOYEE", false, "emp-1"), [claim("k1", { canCancel: true })]);
    renderAt("/absen/lembur");
    expect(await screen.findByText("“Bongkar muat kapal”")).toBeInTheDocument();
    expect(screen.getByText("Menunggu HR")).toBeInTheDocument();

    const submit = screen.getByRole("button", { name: "Kirim pengajuan" });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText("Alasan"), "Menyelesaikan laporan audit");
    expect(submit).toBeDisabled(); // belum ada jam
    fireEvent.change(screen.getByLabelText("Selesai lebih lambat"), {
      target: { value: "21:00" },
    });
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => {
      const post = calls.find((c) => c.method === "POST" && c.path === "/overtime-claims");
      expect(post?.body).toMatchObject({
        workDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        startTime: null,
        endTime: "21:00",
        reason: "Menyelesaikan laporan audit",
      });
    });

    await user.click(screen.getByRole("button", { name: /Batalkan/ }));
    await waitFor(() =>
      expect(calls.some((c) => c.path === "/overtime-claims/k1/cancel")).toBe(true),
    );
  });
});

describe.skipIf(!tmOn("tmOvertime"))("Time › Lembur › Pengajuan karyawan (TM-D27)", () => {
  it("?tab=claims membuka tab pengajuan; badge Lembur = usulan + pengajuan", async () => {
    mockFetch(me("HR_ADMIN"), [claim("k1", { canDecide: true })]);
    renderAt("/time/lembur?tab=claims");
    expect(await screen.findByRole("tab", { name: "Pengajuan karyawan" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByText(/Agus Pratama ·/)).toBeInTheDocument();
    const nav = screen
      .getAllByRole("link")
      .find((a) => a.getAttribute("href") === "/time/lembur") as HTMLElement;
    await waitFor(() => expect(within(nav).getByText("3")).toBeInTheDocument());
  });

  it("setujui wajib ada jam yang diakui; tolak wajib catatan", async () => {
    const user = userEvent.setup();
    const calls = mockFetch(me("HR_ADMIN"), [claim("k1", { canDecide: true })]);
    renderAt("/time/lembur?tab=claims");
    await user.click(await screen.findByRole("button", { name: /Putuskan/ }));
    const dialog = await screen.findByRole("dialog");
    const approve = within(dialog).getByRole("button", { name: "Setujui" });
    const reject = within(dialog).getByRole("button", { name: "Tolak" });
    // Jam diajukan terisi otomatis; dikosongkan → tidak bisa disetujui.
    expect(within(dialog).getByLabelText("Selesai lebih lambat")).toHaveValue("20:00");
    expect(approve).toBeEnabled();
    fireEvent.change(within(dialog).getByLabelText("Selesai lebih lambat"), {
      target: { value: "" },
    });
    expect(approve).toBeDisabled();
    expect(reject).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/Catatan/), "Tidak ada perintah atasan");
    expect(reject).toBeEnabled();
    await user.click(reject);
    await waitFor(() =>
      expect(calls.find((c) => c.path === "/overtime-claims/k1/decision")?.body).toEqual({
        decision: "REJECTED",
        startTime: null,
        endTime: null,
        note: "Tidak ada perintah atasan",
      }),
    );
  });
});
