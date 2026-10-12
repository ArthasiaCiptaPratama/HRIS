import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authState, me, mockApi, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// BUG-004: sapaan Dashboard & kartu akun memakai nama karyawan dari /me; email hanya cadangan.
const common: Record<string, [number, unknown]> = {
  "/health": [200, { data: { status: "ok", checks: { database: "ok" }, time: "x" } }],
  "/notifications": [200, { data: [], meta: { page: 1, pageSize: 5, total: 0, unreadCount: 0 } }],
};

beforeEach(() => {
  authState.session = { access_token: "t", user: { id: "u" } };
});
afterEach(() => vi.unstubAllGlobals());

describe("Sapaan & kartu akun (BUG-004)", () => {
  it("akun tertaut karyawan → sapaan memakai nama depan karyawan, kartu akun memakai nama lengkap", async () => {
    mockApi({
      ...common,
      "/me": [
        200,
        {
          data: {
            ...me("EMPLOYEE", false, "emp-1"),
            email: "oatse2458@gmail.com",
            employeeName: "Calon Uji Oatse",
          },
        },
      ],
    });
    renderAt("/");
    expect(await screen.findByRole("heading", { name: /, Calon$/ })).toBeInTheDocument();
    expect(screen.queryByText(/Oatse2458/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Menu akun" })).toHaveTextContent("Calon Uji Oatse");
  });

  it("akun tanpa karyawan → cadangan dari email seperti sebelumnya", async () => {
    mockApi({ ...common, "/me": [200, { data: { ...me("MANAGER"), employeeName: null } }] });
    renderAt("/");
    expect(await screen.findByRole("heading", { name: /, Manager$/ })).toBeInTheDocument();
  });
});
