import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/app/feature-flags";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// D-045 c / D-047: halaman review isian onboarding (SA / HR + grant) — baca data, setujui (+PTKP),
// minta revisi per bagian, batalkan; HR tanpa grant tidak bisa membuka halaman.
const EMP = "00000000-0000-4000-8000-000000000301";
const health = {
  data: { status: "ok", checks: { database: "ok" }, time: new Date().toISOString() },
};

const review = (over: Record<string, unknown> = {}) => ({
  employeeId: EMP,
  status: "SUBMITTED",
  mode: "candidate",
  editable: false,
  submittedAt: null,
  revision: null,
  personal: {
    fullName: "Ani Calon",
    gender: "FEMALE",
    birthPlace: "Palangka Raya",
    birthDate: "2001-02-03",
    ktpNumber: "6271010101000001",
    kkNumber: "6271010101000002",
    religion: "ISLAM",
    maritalStatus: "SINGLE",
    ktpAddress: "Jl. A",
    domicileAddress: "Jl. B",
    originCity: "Kapuas",
    phoneNumber: "0812",
    npwpNumber: null,
    npwpAbsent: true,
    bpjsEmploymentNumber: null,
    bpjsEmploymentAbsent: true,
    bpjsHealthNumber: null,
    bpjsHealthAbsent: true,
  },
  emergency: { name: "Budi", relationship: "Ayah", phone: "0813" },
  family: [],
  bank: { bankName: "BRI", accountNumber: "123", accountHolder: "Ani" },
  educations: [{ level: "S1", schoolName: "Univ", major: null, graduationYear: 2023 }],
  trainings: [],
  workExperiences: [],
  documents: [
    {
      id: "00000000-0000-4000-8000-000000000401",
      type: "KTP",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      url: "https://files.test/ktp.pdf",
      removable: false,
    },
  ],
  photoUrl: null,
  missing: [],
  reviewMode: "candidate",
  employeeNumber: "25.11.ACP.023",
  personalEmail: "ani@example.test",
  work: {
    companyId: "c1",
    employmentStatusId: "s1",
    positionId: "p1",
    workLocationId: null,
    gradeId: null,
    managerId: null,
    joinDate: "2026-11-25",
  },
  ptkpStatus: null,
  canDecide: true,
  reviews: [],
  ...over,
});

type Call = { method: string; path: string; body: unknown };

function mockFetch(role: Record<string, unknown>) {
  const calls: Call[] = [];
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
    if (path === "/master-data")
      return json(200, {
        data: {
          companies: [{ id: "c1", name: "PT ACP", code: "ACP" }],
          departments: [],
          positions: [],
          employmentStatuses: [{ id: "s1", name: "Kontrak", category: null }],
          grades: [],
          workLocations: [],
        },
      });
    if (path === `/onboarding/${EMP}` && method === "GET") return json(200, { data: review() });
    if (path === `/onboarding/${EMP}/decision`)
      return json(200, {
        data: { employeeId: EMP, decision: (body as { decision: string }).decision },
      });
    if (path === "/onboarding")
      return json(200, {
        data: [],
        meta: { page: 1, pageSize: 20, total: 0, counts: {} },
      });
    return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

const hrWithGrant = {
  ...me("HR_ADMIN"),
  grants: [{ permission: "employee.onboarding.review", expiresAt: null }],
};

beforeEach(() => {
  authState.session = { access_token: "t", user: { id: "u" } };
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

// D-043 rilis bertahap: suite fitur yang disembunyikan saklar FEATURES dilewati di jalur rilis.
describe.skipIf(!FEATURES.onboarding)("Review onboarding (D-045 c)", () => {
  it("HR ber-grant melihat isian + dokumen; setujui mengirim PTKP", async () => {
    const user = userEvent.setup();
    const calls = mockFetch(hrWithGrant);
    renderAt(`/penerimaan/${EMP}`);
    expect(await screen.findByRole("heading", { name: "Ani Calon" })).toBeInTheDocument();
    expect(screen.getByText("6271010101000001")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "KTP" })).toHaveAttribute(
      "href",
      "https://files.test/ktp.pdf",
    );
    await user.click(screen.getByRole("button", { name: "Setujui" }));
    const confirm = screen.getAllByRole("button", { name: "Setujui" }).at(-1) as HTMLElement;
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole("combobox", { name: /PTKP/ }));
    await user.click(await screen.findByRole("option", { name: "K/1" }));
    await user.click(confirm);
    await waitFor(() =>
      expect(calls.find((c) => c.path === `/onboarding/${EMP}/decision`)?.body).toEqual({
        decision: "APPROVED",
        ptkpStatus: "K1",
      }),
    );
  });

  it("minta revisi: catatan per bagian dikirim", async () => {
    const user = userEvent.setup();
    const calls = mockFetch({ ...me("SUPER_ADMIN") });
    renderAt(`/penerimaan/${EMP}`);
    await user.click(await screen.findByRole("button", { name: "Minta revisi" }));
    const send = screen.getByRole("button", { name: "Kirim permintaan revisi" });
    expect(send).toBeDisabled();
    await user.type(screen.getByLabelText("Rekening"), "Nomor salah");
    await user.click(send);
    await waitFor(() =>
      expect(calls.find((c) => c.path === `/onboarding/${EMP}/decision`)?.body).toEqual({
        decision: "REVISION_REQUESTED",
        sectionNotes: { bank: "Nomor salah" },
      }),
    );
  });

  it("HR tanpa grant tidak bisa membuka halaman review", async () => {
    const calls = mockFetch({ ...me("HR_ADMIN") });
    renderAt(`/penerimaan/${EMP}`);
    await waitFor(() => expect(calls.some((c) => c.path === "/me")).toBe(true));
    expect(screen.queryByRole("heading", { name: "Ani Calon" })).not.toBeInTheDocument();
    expect(calls.some((c) => c.path === `/onboarding/${EMP}`)).toBe(false);
  });
});
