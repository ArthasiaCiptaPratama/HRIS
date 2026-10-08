import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// React Flow butuh browser sungguhan; di jsdom kanvas diganti daftar tombol orang (onOpenPerson).
vi.mock("@/features/employee/org-chart/org-chart-canvas", () => ({
  OrgChartCanvas: ({
    chart,
    onOpenPerson,
  }: {
    chart: { posts: { id: string; holders: { id: string; fullName: string }[] }[] };
    onOpenPerson: (id: string) => void;
  }) => (
    <section aria-label="kanvas uji">
      {chart.posts.flatMap((post) =>
        post.holders.map((holder) => (
          <button key={holder.id} type="button" onClick={() => onOpenPerson(holder.id)}>
            {holder.fullName}
          </button>
        )),
      )}
    </section>
  ),
}));

// D-051: halaman Struktur Organisasi — tab bagan (default), pemilih PT, klik orang → detail/kartu.
const ID = (n: number) => `00000000-0000-4000-8000-00000000001${n}`;
const health = {
  data: { status: "ok", checks: { database: "ok" }, time: new Date().toISOString() },
};

function chart(overrides: Record<string, unknown> = {}) {
  return {
    company: { id: ID(1), code: "ACP", name: "PT Uji" },
    companies: [
      { id: ID(1), code: "ACP", name: "PT Uji" },
      { id: ID(2), code: "CD2", name: "PT Dua" },
    ],
    units: [
      { id: ID(3), name: "Direksi", unitType: "DIRECTORATE", parentId: null, corporate: false },
    ],
    posts: [
      {
        id: ID(4),
        positionName: "Direktur Utama",
        level: "DIRECTOR",
        departmentId: ID(3),
        corporate: false,
        reportsToId: null,
        functionalReportsToId: null,
        headcount: 1,
        sortOrder: 0,
        holders: [{ id: ID(5), fullName: "Budi Contoh", photoUrl: null }],
      },
    ],
    unplacedCount: 3,
    canOpenDetail: true,
    canManage: true,
    ...overrides,
  };
}

function mockFetch(role: ReturnType<typeof me>, data: ReturnType<typeof chart>) {
  const paths: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const path = url.pathname.replace("/api/v1", "");
      paths.push(`${path}${url.search}`);
      const json = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (path === "/me") return json(200, { data: role });
      if (path === "/health") return json(200, health);
      if (path === "/notifications")
        return json(200, { data: [], meta: { page: 1, pageSize: 20, total: 0, unreadCount: 0 } });
      if (path === "/org-chart") return json(200, { data });
      if (path === `/org-chart/people/${ID(5)}`)
        return json(200, {
          data: {
            id: ID(5),
            fullName: "Budi Contoh",
            photoUrl: null,
            position: "Direktur Utama",
            department: "Direksi",
            company: { code: "ACP", name: "PT Uji" },
            workLocation: "Kantor Pusat",
            workEmail: "budi@contoh.test",
          },
        });
      return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
    }),
  );
  return paths;
}

beforeEach(() => {
  authState.session = { access_token: "t", user: { id: "u" } };
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("Struktur Organisasi › Bagan organisasi (D-051)", () => {
  it("SA: tab bagan default, pemilih PT, tombol Kelola pos, info karyawan belum ditempatkan", async () => {
    mockFetch(me("SUPER_ADMIN", true), chart());
    renderAt("/personal/struktur-organisasi");
    expect(await screen.findByRole("tab", { name: /Bagan organisasi/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByLabelText("kanvas uji")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Perusahaan bagan" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Kelola pos/ })).toHaveAttribute(
      "href",
      "/master-data/pos-jabatan",
    );
    expect(screen.getByText(/3 karyawan aktif ACP belum ditempatkan/)).toBeInTheDocument();
  });

  it("MANAGER: klik orang → kartu profil kerja (bukan detail lengkap); tanpa Kelola pos", async () => {
    const paths = mockFetch(
      me("MANAGER", false, ID(9)),
      chart({ canOpenDetail: false, canManage: false, companies: [chart().company] }),
    );
    renderAt("/personal/struktur-organisasi");
    await userEvent.click(await screen.findByRole("button", { name: "Budi Contoh" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("budi@contoh.test")).toBeInTheDocument();
    expect(within(dialog).getByText(/Direktur Utama · Direksi/)).toBeInTheDocument();
    expect(paths).toContain(`/org-chart/people/${ID(5)}`);
    expect(paths.some((p) => p.startsWith(`/employees/${ID(5)}`))).toBe(false);
    expect(screen.queryByRole("link", { name: /Kelola pos/ })).toBeNull();
    // Satu PT → tanpa pemilih.
    expect(screen.queryByRole("combobox", { name: "Perusahaan bagan" })).toBeNull();
  });

  it("belum ada pos → keadaan kosong dengan petunjuk untuk SA", async () => {
    mockFetch(me("SUPER_ADMIN", true), chart({ posts: [] }));
    renderAt("/personal/struktur-organisasi");
    expect(await screen.findByText("Belum ada pos jabatan")).toBeInTheDocument();
    expect(screen.getByText(/Master Data › Pos jabatan/)).toBeInTheDocument();
  });

  it("tab Per unit memuat struktur lama hanya saat dibuka", async () => {
    const paths = mockFetch(me("SUPER_ADMIN", true), chart());
    renderAt("/personal/struktur-organisasi");
    await screen.findByLabelText("kanvas uji");
    expect(paths.includes("/org-structure")).toBe(false);
    await userEvent.click(screen.getByRole("tab", { name: /Per unit/ }));
    await waitFor(() => expect(paths).toContain("/org-structure"));
  });
});
