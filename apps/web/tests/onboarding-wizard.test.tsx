import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// D-045 bagian b (web): wizard isi data — calon dikunci ke /onboarding, simpan draf per langkah,
// ringkasan kekurangan, layar menunggu review; karyawan existing: banner + field terisi terkunci.
const health = {
  data: { status: "ok", checks: { database: "ok" }, time: new Date().toISOString() },
};
const EMP = "00000000-0000-4000-8000-000000000201";

const mine = (over: Record<string, unknown> = {}) => ({
  employeeId: EMP,
  status: "FILLING",
  mode: "candidate",
  editable: true,
  submittedAt: null,
  personal: {
    fullName: "Ani Calon",
    gender: null,
    birthPlace: null,
    birthDate: null,
    ktpNumber: null,
    kkNumber: null,
    religion: null,
    maritalStatus: null,
    ktpAddress: null,
    domicileAddress: null,
    originCity: null,
    phoneNumber: "081234567890",
    npwpNumber: null,
    npwpAbsent: false,
    bpjsEmploymentNumber: null,
    bpjsEmploymentAbsent: false,
    bpjsHealthNumber: null,
    bpjsHealthAbsent: false,
  },
  emergency: { name: null, relationship: null, phone: null },
  family: [],
  bank: { bankName: null, accountNumber: null, accountHolder: null },
  educations: [],
  trainings: [],
  workExperiences: [],
  documents: [],
  photoUrl: null,
  missing: [
    { section: "personal", field: "ktpNumber", message: "NIK KTP wajib diisi." },
    { section: "documents", field: "KTP", message: "KTP wajib diunggah." },
  ],
  ...over,
});

type Call = { method: string; path: string; body: unknown };

function mockFetch(role: Record<string, unknown>, onboarding: Record<string, unknown>) {
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
    if (path === "/onboarding/me" && method === "GET") return json(200, { data: onboarding });
    if (path.startsWith("/onboarding/me/") && method === "PUT")
      return json(200, { data: { ...onboarding, missing: [] } });
    if (path === "/employees/summary")
      return json(200, { data: { total: 0, uncategorized: 0, inactive: 0, byCategory: {} } });
    return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

const candidateMe = {
  ...me("EMPLOYEE", false, EMP),
  onboarding: { status: "FILLING", completionRequired: false, submitted: false, locked: true },
};

beforeEach(() => {
  authState.session = { access_token: "t", user: { id: "u" } };
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("Wizard onboarding (D-045 b)", () => {
  it("calon terkunci: membuka / diarahkan ke wizard", async () => {
    mockFetch(candidateMe, mine());
    renderAt("/");
    expect(
      await screen.findByRole("heading", { name: "Lengkapi data karyawan" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Kembali ke aplikasi" })).not.toBeInTheDocument();
  });

  it("simpan data pribadi → PUT bagian personal dengan nilai terisi, lalu ke langkah berikutnya", async () => {
    const user = userEvent.setup();
    const calls = mockFetch(candidateMe, mine());
    renderAt("/onboarding");
    await user.type(await screen.findByLabelText("NIK KTP (16 digit)"), "6271010101000001");
    await user.click(screen.getByRole("checkbox", { name: "NPWP: belum punya" }));
    await user.click(screen.getByRole("button", { name: "Simpan & lanjut" }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "PUT" && c.path === "/onboarding/me/personal")).toBe(
        true,
      ),
    );
    const body = calls.find((c) => c.path === "/onboarding/me/personal")?.body as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      ktpNumber: "6271010101000001",
      npwpAbsent: true,
      npwpNumber: null,
    });
    expect(await screen.findByLabelText("Nama")).toBeInTheDocument();
  });

  it("ringkasan: daftar kekurangan; tombol kirim nonaktif selama belum lengkap", async () => {
    const user = userEvent.setup();
    mockFetch(candidateMe, mine());
    renderAt("/onboarding");
    await user.click(await screen.findByRole("button", { name: /Ringkasan & kirim/ }));
    expect(screen.getByText(/Masih perlu dilengkapi \(2\)/)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Saya menyatakan/ }));
    expect(screen.getByRole("button", { name: "Kirim untuk diperiksa HR" })).toBeDisabled();
  });

  it("sudah dikirim → layar menunggu review", async () => {
    mockFetch(
      {
        ...candidateMe,
        onboarding: { ...candidateMe.onboarding, status: "SUBMITTED", submitted: true },
      },
      mine({ status: "SUBMITTED", editable: false }),
    );
    renderAt("/onboarding");
    expect(
      await screen.findByRole("heading", { name: "Data Anda sudah dikirim" }),
    ).toBeInTheDocument();
  });

  it("karyawan existing: banner di aplikasi; field yang sudah terisi terkunci di wizard", async () => {
    const existingMe = {
      ...me("EMPLOYEE", false, EMP),
      onboarding: { status: "APPROVED", completionRequired: true, submitted: false, locked: false },
    };
    mockFetch(
      existingMe,
      mine({
        status: "APPROVED",
        mode: "completion",
        personal: { ...mine().personal, ktpNumber: "6271010101000099" },
      }),
    );
    renderAt("/");
    const link = await screen.findByRole("link", { name: "Lengkapi data Anda" });
    expect(link).toHaveAttribute("href", "/onboarding");
    renderAt("/onboarding");
    const ktp = await screen.findAllByLabelText("NIK KTP (16 digit)");
    expect(ktp.at(-1)).toBeDisabled();
    const kk = screen.getAllByLabelText("Nomor KK (16 digit)");
    expect(kk.at(-1)).not.toBeDisabled();
    expect(
      within(document.body).getAllByRole("link", { name: "Kembali ke aplikasi" }).length,
    ).toBeGreaterThan(0);
  });
});
