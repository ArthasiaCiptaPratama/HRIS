import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Me } from "@/features/auth/schemas";
import { setSelectedCompany } from "@/features/employee/company-scope";
import { downloadBytes } from "@/lib/xlsx-write";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/xlsx-write", () => ({ downloadBytes: vi.fn() }));
const company = { id: "co-acp", code: "ACP", name: "PT Uji" };
const person = (id: string, fullName: string) => ({
  id,
  fullName,
  employeeNumber: `N-${id}`,
  workEmail: null,
  phoneNumber: null,
  gender: null,
  joinDate: "2025-01-02",
  endDate: null,
  isActive: true,
  exitReason: null,
  employmentStatus: { id: "st", name: "Tetap", category: "PERMANENT" },
  company,
  position: { id: "p1", name: "Staf" },
  department: null,
  workLocation: null,
  homebase: null,
  grade: null,
  manager: null,
  photoUrl: null,
});
function backend(role: Me, options: { fail?: boolean; total?: number } = {}) {
  const posts: unknown[] = [];
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
            companies: [company],
            departments: [{ id: "d1", name: "Unit Uji", parentId: null, unitType: "DEPARTMENT" }],
            positions: [],
            employmentStatuses: [],
            grades: [],
            workLocations: [{ id: "l1", name: "Lokasi Uji", city: null }],
            homebases: [{ id: "h1", name: "Homebase Uji", city: null, province: null }],
          },
        });
      if (path === "/employees/summary")
        return json({
          data: {
            active: { total: 2, byCategory: { PERMANENT: 2 }, uncategorized: 0 },
            inactive: 0,
          },
        });
      if (path === "/employees/export") {
        posts.push(JSON.parse(String(init?.body)));
        return options.fail
          ? json(
              { error: { code: "FORBIDDEN", message: "Izin baca diperlukan.", requestId: "r" } },
              403,
            )
          : json({ data: { fileName: "karyawan.xlsx", rows: 2, contentBase64: "UEs=" } });
      }
      if (path === "/employees")
        return json({
          data: [person("e1", "Ani Uji"), person("e2", "Budi Uji")],
          meta: { page: 1, pageSize: 20, total: options.total ?? 2 },
        });
      return json({ data: [] });
    }),
  );
  return posts;
}
beforeEach(() => {
  authState.session = { access_token: "token", user: { id: "u" } };
  setSelectedCompany("co-acp");
  vi.mocked(downloadBytes).mockClear();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setSelectedCompany(null);
});

describe("Ekspor karyawan (EMP-D7)", () => {
  it.each(["SUPER_ADMIN", "HR_ADMIN"] as const)(
    "%s melihat tombol tepat di samping Import",
    async (role) => {
      backend(me(role));
      renderAt("/personal/pegawai-aktif/semua");
      const button = await screen.findByRole("button", { name: "Ekspor" });
      expect(screen.getByRole("link", { name: "Import" }).nextElementSibling).toBe(button);
    },
  );
  it("MANAGER tidak melihat tombol Ekspor", async () => {
    backend(me("MANAGER", false, "m1"));
    renderAt("/personal/pegawai-aktif/semua");
    await screen.findByRole("heading", { name: "Semua Karyawan Aktif" });
    expect(screen.queryByRole("button", { name: "Ekspor" })).not.toBeInTheDocument();
  });
  it("dialog mengirim kategori, filter URL dan PT tanpa paginasi; mengunduh bytes Excel", async () => {
    const posts = backend(me("SUPER_ADMIN"));
    renderAt("/personal/pegawai-aktif/tetap?q=Uji&dept=d1&loc=l1&hb=h1&nip=kosong&size=50");
    await userEvent.click(await screen.findByRole("button", { name: "Ekspor" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByRole("radio", { name: "Sesuai filter halaman ini (2 karyawan)" }),
    ).toBeChecked();
    expect(
      within(dialog).getByRole("checkbox", { name: "Identitas & kepegawaian" }),
    ).toBeDisabled();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Kontak" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Unduh Excel" }));
    await waitFor(() =>
      expect(posts).toEqual([
        {
          filter: {
            active: true,
            category: "PERMANENT",
            companyId: "co-acp",
            q: "Uji",
            departmentId: "d1",
            workLocationId: "l1",
            homebaseId: "h1",
            missingNumber: "true",
            sort: "fullName:asc",
          },
          sections: ["identity", "contact"],
        },
      ]),
    );
    expect(downloadBytes).toHaveBeenCalledWith(
      new Uint8Array([80, 75]),
      "karyawan.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("2 karyawan berhasil diekspor."),
    );
  });
  it("mode pilih tertentu mengirim employeeIds, pilihan bisa dilepas", async () => {
    const posts = backend(me("HR_ADMIN"));
    renderAt("/personal/pegawai-aktif/internal");
    await userEvent.click(await screen.findByRole("button", { name: "Ekspor" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Pilih karyawan tertentu" }));
    expect(within(dialog).getByRole("button", { name: "Unduh Excel" })).toBeDisabled();
    const ani = await within(dialog).findByRole("button", { name: /Ani Uji/ });
    const budi = within(dialog).getByRole("button", { name: /Budi Uji/ });
    await userEvent.click(ani);
    await userEvent.click(budi);
    await userEvent.click(ani);
    await userEvent.click(within(dialog).getByRole("button", { name: "Unduh Excel" }));
    await waitFor(() => expect(posts).toEqual([{ employeeIds: ["e2"], sections: ["identity"] }]));
  });
  it("HR tanpa grant tidak bisa memilih data pribadi, rekening, keluarga", async () => {
    backend(me("HR_ADMIN"));
    renderAt("/personal/pegawai-aktif/semua");
    await userEvent.click(await screen.findByRole("button", { name: "Ekspor" }));
    for (const name of ["Data pribadi", "Rekening", "Keluarga"])
      expect(screen.getByRole("checkbox", { name })).toBeDisabled();
    expect(screen.getAllByText("butuh izin baca data pribadi")).toHaveLength(2);
    expect(screen.getByText("butuh izin baca rekening")).toBeInTheDocument();
  });
  it("HR ber-grant bisa memilih bagian sensitif; error API ditampilkan dan dialog tetap terbuka", async () => {
    const posts = backend(
      {
        ...me("HR_ADMIN"),
        grants: [
          { permission: "employee.personal.read", expiresAt: null },
          { permission: "employee.bank.read", expiresAt: null },
        ],
      },
      { fail: true },
    );
    renderAt("/personal/pegawai-aktif/eksternal");
    await userEvent.click(await screen.findByRole("button", { name: "Ekspor" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Data pribadi" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Rekening" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Unduh Excel" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Unduh Excel" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Izin baca diperlukan."));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(posts).toEqual([
      {
        filter: { active: true, group: "EXTERNAL", companyId: "co-acp", sort: "fullName:asc" },
        sections: ["identity", "personal", "bank"],
      },
    ]);
    expect(downloadBytes).not.toHaveBeenCalled();
  });
  it("hasil >5.000 meminta filter dipersempit", async () => {
    backend(me("SUPER_ADMIN"), { total: 5001 });
    renderAt("/personal/pegawai-aktif/semua");
    await userEvent.click(await screen.findByRole("button", { name: "Ekspor" }));
    expect(await screen.findByText(/Maksimal 5.000 karyawan; persempit/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unduh Excel" })).toBeDisabled();
  });
});
