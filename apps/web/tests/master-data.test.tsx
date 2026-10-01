import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// D-049: Administrasi › Master Data — SA kelola (tambah, ubah, arsip, hapus, gabungkan), HR lihat saja.
const health = {
  data: { status: "ok", checks: { database: "ok" }, time: new Date().toISOString() },
};
const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const grade = { id: ID(1), name: "3A", archived: false, employeeCount: 4 };
const position = {
  id: ID(2),
  name: "Staff IT",
  archived: false,
  employeeCount: 2,
  departmentId: ID(3),
  departmentName: "Teknologi Informasi",
};
const department = {
  id: ID(3),
  name: "Teknologi Informasi",
  archived: false,
  employeeCount: 2,
  parentId: null,
  parentName: null,
  positionCount: 1,
};

type Call = { method: string; path: string; body: unknown };

/** fetch palsu yang membedakan method (POST/PATCH/DELETE) dan mencatat body. */
function mockFetch(role: ReturnType<typeof me>, lists: Record<string, unknown[]>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
    if (path === "/health") return json(200, health);
    if (path === "/notifications")
      return json(200, { data: [], meta: { page: 1, pageSize: 20, total: 0, unreadCount: 0 } });
    if (method === "GET" && path.slice(1) in lists)
      return json(200, { data: lists[path.slice(1)] });
    if (method !== "GET")
      return json(method === "POST" && !path.includes("/", 1) ? 201 : 200, {
        data: { id: ID(9) },
      });
    return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");

beforeEach(() => {
  authState.session = { access_token: "t", user: { id: "u" } };
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("Master Data (D-049)", () => {
  it("SA: judul, breadcrumb Administrasi, tabel jabatan + departemennya, tombol tambah, menu Master Data", async () => {
    mockFetch(me("SUPER_ADMIN", true), { positions: [position], departments: [department] });
    renderAt("/master-data/jabatan");
    expect(await screen.findByRole("heading", { level: 1, name: "Jabatan" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent(
      "Administrasi",
    );
    const table = await screen.findByRole("table", { name: "Daftar jabatan" });
    expect(await within(table).findByText("Staff IT")).toBeInTheDocument();
    expect(within(table).getByText("Teknologi Informasi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tambah jabatan" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Site \/ lokasi kerja/ }).length).toBeGreaterThan(0);
  });

  it("HR: hanya melihat — tanpa tombol tambah & aksi, ada penjelasan", async () => {
    mockFetch(me("HR_ADMIN"), { grades: [grade] });
    renderAt("/master-data/grade");
    const table = await screen.findByRole("table", { name: "Daftar grade" });
    expect(await within(table).findByText("3A")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tambah/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Aksi untuk/ })).not.toBeInTheDocument();
    expect(
      screen.getByText(/Hanya Super Admin yang dapat mengubah master data/),
    ).toBeInTheDocument();
  });

  it("MANAGER tidak bisa membuka halaman master data", async () => {
    mockFetch(me("MANAGER", false, "emp-1"), { grades: [grade] });
    renderAt("/master-data/grade");
    await waitFor(() =>
      expect(screen.queryByRole("heading", { level: 1, name: "Grade" })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("table", { name: "Daftar grade" })).not.toBeInTheDocument();
  });

  it("lokasi: geofence tidak lengkap ditolak di form; tempel koordinat mengisi latitude & longitude", async () => {
    const user = userEvent.setup();
    const calls = mockFetch(me("SUPER_ADMIN", true), { "work-locations": [] });
    renderAt("/master-data/lokasi-kerja");
    await user.click(await screen.findByRole("button", { name: "Tambah lokasi" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Nama"), "Site Kapuas");
    fireEvent.paste(within(dialog).getByLabelText("Latitude"), {
      clipboardData: { getData: () => "-2.2136, 113.9213" },
    });
    expect(within(dialog).getByLabelText("Latitude")).toHaveValue("-2.2136");
    expect(within(dialog).getByLabelText("Longitude")).toHaveValue("113.9213");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    expect(
      await within(dialog).findByText(/Isi latitude, longitude, dan radius sekaligus/),
    ).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);

    await user.type(within(dialog).getByLabelText("Radius (m)"), "150");
    await user.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({
      method: "POST",
      path: "/work-locations",
      body: { name: "Site Kapuas", latitude: -2.2136, longitude: 113.9213, radiusM: 150 },
    });
  });

  it("arsipkan lewat menu aksi + konfirmasi memanggil POST /:id/archive", async () => {
    const user = userEvent.setup();
    const calls = mockFetch(me("SUPER_ADMIN", true), { grades: [grade] });
    renderAt("/master-data/grade");
    await user.click(await screen.findByRole("button", { name: "Aksi untuk 3A" }));
    await user.click(await screen.findByRole("menuitem", { name: /Arsipkan/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("4 karyawan aktif masih memakai");
    await user.click(within(dialog).getByRole("button", { name: "Arsipkan" }));
    await waitFor(() =>
      expect(writes(calls)).toEqual([
        { method: "POST", path: `/grades/${ID(1)}/archive`, body: undefined },
      ]),
    );
  });
});
