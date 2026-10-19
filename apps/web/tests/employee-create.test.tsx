import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSelectedCompany } from "@/features/employee/company-scope";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// EMP-D2: Tambah karyawan bertahap (urutan Google Form) — data kerja wajib, profil opsional, bagian
// sensitif terkunci tanpa grant tulis, simpan sekali (POST /employees + profile).
const ACP = { id: "co-acp", code: "ACP", name: "PT Arthasia Cipta Pratama" };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mockBackend(account: ReturnType<typeof me> | Record<string, unknown>) {
  const requests: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      const path = url.pathname.replace("/api/v1", "");
      requests.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (path === "/me") return json(200, { data: account });
      if (path === "/health")
        return json(200, { data: { status: "ok", checks: { database: "ok" }, time: "x" } });
      if (path === "/notifications")
        return json(200, { data: [], meta: { page: 1, pageSize: 5, total: 0, unreadCount: 0 } });
      if (path === "/master-data")
        return json(200, {
          data: {
            companies: [ACP],
            departments: [
              {
                id: "d1",
                name: "General Affair",
                parentId: null,
                unitType: "DEPARTMENT",
                companyId: null,
              },
            ],
            positions: [{ id: "p1", name: "GA Staff", departmentId: "d1", level: null }],
            employmentStatuses: [{ id: "st1", name: "Karyawan Tetap", category: "PERMANENT" }],
            grades: [],
            workLocations: [],
          },
        });
      if (path === "/employees/manager-options") return json(200, { data: [] });
      if (path === "/org-posts") return json(200, { data: [] });
      if (path === "/employees" && method === "POST") return json(201, { data: { id: "new-1" } });
      if (path === "/employees")
        return json(200, { data: [], meta: { page: 1, pageSize: 20, total: 0 } });
      return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
    }),
  );
  return requests;
}

async function fillWork(user: ReturnType<typeof userEvent.setup>) {
  const step = await screen.findByRole("region", { name: "Data kepegawaian" });
  await user.type(within(step).getByLabelText(/NIP/), "ACP-2026-0100");
  await user.type(within(step).getByLabelText("Nama lengkap"), "Contoh Fiktif");
  await user.click(within(step).getByRole("combobox", { name: /Status kepegawaian/ }));
  await user.click(await screen.findByRole("option", { name: "Karyawan Tetap" }));
  await user.click(within(step).getByRole("combobox", { name: /Unit organisasi/ }));
  await user.click(await screen.findByRole("option", { name: /General Affair/ }));
  await user.click(within(step).getByRole("combobox", { name: /^Jabatan/ }));
  await user.click(await screen.findByRole("option", { name: "GA Staff" }));
}

beforeEach(() => {
  authState.session = { access_token: "t", user: { id: "u" } };
  setSelectedCompany(null);
});
afterEach(() => vi.unstubAllGlobals());

// Banyak isian & pilihan Radix: di suite penuh paralel bisa >5 dtk.
describe("Tambah karyawan bertahap (EMP-D2)", { timeout: 20_000 }, () => {
  it("data kepegawaian wajib sebelum lanjut; SA mengisi profil → satu POST berisi profile", async () => {
    const requests = mockBackend(me("SUPER_ADMIN", true));
    const user = userEvent.setup();
    renderAt("/personal/tambah-karyawan?dari=semua");
    await screen.findByRole("region", { name: "Data kepegawaian" });
    await user.click(screen.getByRole("button", { name: /Berikutnya/ }));
    // Masih di langkah 1 (nama/unit/jabatan kosong).
    expect(screen.getByRole("region", { name: "Data kepegawaian" })).toBeInTheDocument();

    await fillWork(user);
    await user.click(screen.getByRole("button", { name: /Berikutnya/ }));
    const personal = await screen.findByRole("region", { name: "Data pribadi & alamat" });
    await user.type(within(personal).getByLabelText(/No. KTP/), "3200000000000001");
    await user.type(within(personal).getByLabelText(/Tempat lahir/), "Bandung");
    await user.click(within(personal).getByRole("button", { name: "SIM A" }));
    await user.type(within(personal).getByLabelText("No. SIM A"), "SIM-A-1");

    await user.click(screen.getByRole("button", { name: /Data rekening/ }));
    const bank = await screen.findByRole("region", { name: "Data rekening" });
    await user.type(within(bank).getByLabelText(/Nama bank/), "Bank Contoh");
    await user.type(within(bank).getByLabelText(/Nomor rekening/), "0000111122");

    await user.click(screen.getByRole("button", { name: /Ringkasan & simpan/ }));
    await user.click(await screen.findByRole("button", { name: /Simpan karyawan/ }));
    await waitFor(() => {
      const post = requests.find((r) => r.method === "POST" && r.path === "/employees");
      expect(post?.body).toMatchObject({
        employeeNumber: "ACP-2026-0100",
        fullName: "Contoh Fiktif",
        companyId: ACP.id,
        employmentStatusId: "st1",
        positionId: "p1",
        profile: {
          personal: {
            ktpNumber: "3200000000000001",
            birthPlace: "Bandung",
            drivingLicenses: [{ type: "A", number: "SIM-A-1" }],
          },
          bank: { bankName: "Bank Contoh", accountNumber: "0000111122" },
        },
      });
    });
  });

  it("NIK salah: tidak dikirim, kembali ke langkah data pribadi", async () => {
    const requests = mockBackend(me("SUPER_ADMIN", true));
    const user = userEvent.setup();
    renderAt("/personal/tambah-karyawan");
    await fillWork(user);
    await user.click(screen.getByRole("button", { name: /Berikutnya/ }));
    const personal = await screen.findByRole("region", { name: "Data pribadi & alamat" });
    await user.type(within(personal).getByLabelText(/No. KTP/), "123");
    await user.click(screen.getByRole("button", { name: /Simpan sekarang/ }));
    expect(await screen.findByText("NIK KTP harus 16 digit.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Data pribadi & alamat" })).toBeInTheDocument();
    expect(requests.some((r) => r.method === "POST")).toBe(false);
  });

  it("HR tanpa grant tulis: data pribadi & rekening terkunci, profil tanpa bagian sensitif", async () => {
    const requests = mockBackend(me("HR_ADMIN"));
    const user = userEvent.setup();
    renderAt("/personal/tambah-karyawan");
    await fillWork(user);
    await user.click(screen.getByRole("button", { name: /Berikutnya/ }));
    const personal = await screen.findByRole("region", { name: "Data pribadi & alamat" });
    expect(within(personal).getByText(/employee\.personal\.write/)).toBeInTheDocument();
    expect(within(personal).queryByLabelText(/No. KTP/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Simpan sekarang/ }));
    await waitFor(() => {
      const post = requests.find((r) => r.method === "POST" && r.path === "/employees");
      const profile = (post?.body as { profile?: object } | undefined)?.profile;
      expect(profile).toMatchObject({ family: [], educations: [], certifications: [] });
      expect(profile).not.toHaveProperty("personal");
      expect(profile).not.toHaveProperty("bank");
    });
  });
});
