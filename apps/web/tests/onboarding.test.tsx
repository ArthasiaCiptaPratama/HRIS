import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// D-045 bagian a (web): Penerimaan Karyawan Baru — daftar per status, kirim ulang, impor calon
// (unggah → pemetaan → pilih lolos → data kerja → konfirmasi undangan → pengiriman).
const ID = (n: number) => `00000000-0000-4000-8000-00000000010${n}`;
const health = {
  data: { status: "ok", checks: { database: "ok" }, time: new Date().toISOString() },
};
const masterData = {
  companies: [{ id: ID(1), code: "ACP", name: "PT Arthasia Cipta Pratama" }],
  departments: [{ id: ID(2), name: "Operasional", parentId: null, unitType: "DEPARTMENT" }],
  positions: [{ id: ID(3), name: "Operator", departmentId: ID(2), level: "STAFF" }],
  employmentStatuses: [{ id: ID(4), name: "Magang", category: "INTERNSHIP" }],
  grades: [],
  workLocations: [],
};
const candidateRow = (n: number, status: string, extra: Record<string, unknown> = {}) => ({
  id: ID(5 + n),
  employeeNumber: `25.11.ACP.00${n}`,
  fullName: `Calon ${n}`,
  email: `calon${n}@example.test`,
  companyId: ID(1),
  positionId: ID(3),
  employmentStatusId: ID(4),
  joinDate: "2026-11-25",
  onboardingStatus: status,
  completionRequired: false,
  batchId: null,
  invitation: null,
  account: null,
  ...extra,
});
const counts = {
  NOT_INVITED: 1,
  INVITED: 1,
  FILLING: 0,
  SUBMITTED: 0,
  REVISION_REQUESTED: 0,
  APPROVED: 0,
  CANCELLED: 0,
};

type Call = { method: string; path: string; body: unknown };

function mockFetch(role: ReturnType<typeof me>) {
  const calls: Call[] = [];
  let processed = false;
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/api/v1", "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    const json = (status: number, payload: unknown) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (path === "/me") return json(200, { data: role });
    if (path === "/health") return json(200, health);
    if (path === "/notifications")
      return json(200, { data: [], meta: { page: 1, pageSize: 20, total: 0, unreadCount: 0 } });
    if (path === "/master-data") return json(200, { data: masterData });
    if (path === "/onboarding")
      return json(200, {
        data: [
          candidateRow(1, "NOT_INVITED"),
          candidateRow(2, "INVITED", {
            invitation: { status: "SENT", sentAt: "2026-10-02T03:00:00.000Z", errorCode: null },
          }),
        ],
        meta: { page: 1, pageSize: 20, total: 2, counts },
      });
    if (path === "/onboarding-batches/preview")
      return json(200, {
        data: {
          valid: true,
          rows: (body.candidates as { sourceRow: number }[]).map((c, i) => ({
            sourceRow: c.sourceRow,
            employeeNumber: `25.11.ACP.0${21 + i}`,
            suggested: true,
            issues: [],
          })),
        },
      });
    if (path === "/onboarding-batches" && method === "POST")
      return json(201, {
        data: {
          id: ID(9),
          name: "x",
          companyId: ID(1),
          createdCount: 2,
          invitedCount: 1,
          createdAt: "2026-10-02T03:00:00.000Z",
          invitations: { queued: 1, sent: 0, failed: 0 },
        },
      });
    if (path === `/onboarding-batches/${ID(9)}`)
      return json(200, {
        data: {
          id: ID(9),
          name: "x",
          companyId: ID(1),
          createdCount: 2,
          invitedCount: 1,
          createdAt: "2026-10-02T03:00:00.000Z",
          invitations: processed
            ? { queued: 0, sent: 1, failed: 0 }
            : { queued: 1, sent: 0, failed: 0 },
        },
      });
    if (path === "/onboarding-invitations/process") {
      processed = true;
      return json(200, {
        data: { processed: 1, sent: 1, failed: 0, remaining: 0, rateLimited: false },
      });
    }
    if (path.endsWith("/resend-invitation"))
      return json(200, { data: { employeeId: ID(6), queued: true } });
    return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

beforeEach(() => {
  authState.session = { access_token: "t", user: { id: "u" } };
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("Penerimaan Karyawan Baru (D-045)", () => {
  it("daftar: tab status ber-hitungan, status & undangan per calon, Undang memanggil kirim ulang", async () => {
    const user = userEvent.setup();
    const calls = mockFetch(me("HR_ADMIN"));
    renderAt("/penerimaan");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Penerimaan Karyawan Baru" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Belum diundang 1/ })).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "Daftar calon karyawan" });
    expect(await within(table).findByText("Calon 1")).toBeInTheDocument();
    expect(within(table).getByText(/Terkirim/)).toBeInTheDocument();
    await user.click(within(table).getByRole("button", { name: /Undang/ }));
    await waitFor(() =>
      expect(calls.some((c) => c.path === `/onboarding/${ID(6)}/resend-invitation`)).toBe(true),
    );
  });

  it("MANAGER tidak bisa membuka menu Penerimaan", async () => {
    mockFetch(me("MANAGER", false, "emp-1"));
    renderAt("/penerimaan");
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { level: 1, name: "Penerimaan Karyawan Baru" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("impor: unggah → pemetaan otomatis → pilih lolos → data kerja → konfirmasi → kirim", async () => {
    const user = userEvent.setup();
    const calls = mockFetch(me("SUPER_ADMIN", true));
    renderAt("/penerimaan/impor");
    const csv = [
      "Nama Lengkap;Email;No HP",
      "Ani Calon;ani@example.test;081234567890",
      "Budi Calon;budi@example.test;081298765432",
      "Cici Tanpa Email;;0812",
    ].join("\n");
    await user.upload(
      await screen.findByLabelText(/Pilih file ekspor portal/),
      new File([csv], "maganghub.csv", { type: "text/csv" }),
    );
    // Pemetaan otomatis: nama & email dikenali → lanjut.
    await user.click(await screen.findByRole("button", { name: /Lanjut \(3 calon\)/ }));
    // Baris tanpa email tidak bisa dipilih; pilih semua yang valid.
    expect(screen.getByRole("checkbox", { name: "Lolos: Cici Tanpa Email" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /Pilih semua/ }));
    await user.click(screen.getByRole("button", { name: /Lanjut \(2 calon lolos\)/ }));

    // Data kerja bawaan (PT tunggal terisi otomatis).
    await user.click(screen.getByLabelText("Status kepegawaian"));
    await user.click(await screen.findByRole("option", { name: "Magang" }));
    await user.click(screen.getByLabelText("Unit organisasi"));
    await user.click(await screen.findByRole("option", { name: /Operasional/ }));
    await user.click(screen.getByLabelText("Jabatan"));
    await user.click(await screen.findByRole("option", { name: "Operator" }));
    await user.click(screen.getByRole("button", { name: /Pratinjau & isi nomor induk/ }));
    expect(await screen.findByDisplayValue("25.11.ACP.021")).toBeInTheDocument();
    // Regresi QA 2026-10-02: ubah tanggal masuk bawaan → semua baris ikut, nomor usulan & pratinjau
    // lama dibatalkan (nomor induk bergantung pada tanggal masuk).
    const defaultDate = screen.getByLabelText("Tanggal masuk");
    await user.clear(defaultDate);
    await user.type(defaultDate, "2026-12-01");
    expect(screen.getByLabelText("Tanggal masuk Ani Calon")).toHaveValue("2026-12-01");
    expect(screen.queryByDisplayValue("25.11.ACP.021")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Lanjut ke konfirmasi/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Pratinjau & isi nomor induk/ }));
    expect(await screen.findByDisplayValue("25.11.ACP.021")).toBeInTheDocument();
    const lastPreview = calls.filter((c) => c.path === "/onboarding-batches/preview").at(-1)
      ?.body as { candidates: { joinDate: string }[] };
    expect(lastPreview.candidates.map((c) => c.joinDate)).toEqual(["2026-12-01", "2026-12-01"]);
    await user.click(screen.getByRole("button", { name: /Lanjut ke konfirmasi/ }));

    // Konfirmasi undangan: lepas centang Budi → disimpan "Belum diundang".
    await user.click(screen.getByRole("checkbox", { name: "Undang Budi Calon" }));
    await user.click(screen.getByRole("button", { name: /Simpan & kirim 1 undangan/ }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.path === "/onboarding-batches")).toBe(true),
    );
    const saved = calls.find((c) => c.method === "POST" && c.path === "/onboarding-batches")
      ?.body as { candidates: Record<string, unknown>[]; sourceFileName: string };
    expect(saved.sourceFileName).toBe("maganghub.csv");
    expect(saved.candidates).toEqual([
      expect.objectContaining({
        fullName: "Ani Calon",
        personalEmail: "ani@example.test",
        employeeNumber: "25.11.ACP.021",
        companyId: ID(1),
        employmentStatusId: ID(4),
        positionId: ID(3),
        invite: true,
      }),
      expect.objectContaining({ fullName: "Budi Calon", invite: false }),
    ]);
    // Pengiriman: antrean diproses otomatis selama halaman terbuka.
    expect(await screen.findByText(/2 calon disimpan/)).toBeInTheDocument();
    await waitFor(
      () => expect(calls.some((c) => c.path === "/onboarding-invitations/process")).toBe(true),
      { timeout: 4000 },
    );
    expect(await screen.findByText("1/1")).toBeInTheDocument();
  }, 15_000);
});
