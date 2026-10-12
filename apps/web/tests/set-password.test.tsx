import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authState, me, mockApi, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// Form atur password (undangan/reset/profil): tampilkan password, syarat langsung tercentang,
// penanda kecocokan ulangi password.
beforeEach(() => {
  authState.session = { access_token: "t", user: { id: "u" } };
  mockApi({
    "/me": [200, { data: me("EMPLOYEE") }],
    "/health": [200, { data: { status: "ok", checks: { database: "ok" }, time: "x" } }],
    "/notifications": [200, { data: [], meta: { page: 1, pageSize: 5, total: 0, unreadCount: 0 } }],
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("Atur password", () => {
  it("tombol mata menampilkan & menyembunyikan password", async () => {
    const user = userEvent.setup();
    renderAt("/auth/atur-password");
    const input = await screen.findByLabelText("Password baru");
    expect(input).toHaveAttribute("type", "password");
    const [toggle] = screen.getAllByRole("button", { name: "Tampilkan password" });
    await user.click(toggle as HTMLElement);
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getAllByRole("button", { name: "Sembunyikan password" })).toHaveLength(1);
  });

  it("syarat tercentang saat mengetik; ulangi password menunjukkan cocok / belum sama", async () => {
    const user = userEvent.setup();
    renderAt("/auth/atur-password");
    const input = await screen.findByLabelText("Password baru");
    await user.type(input, "pendek");
    expect(screen.getByText(/Minimal 12 karakter/).closest("li")).toHaveTextContent("— belum");
    expect(screen.getByText("Kekuatan: Terlalu pendek")).toBeInTheDocument();
    await user.type(input, "Sekali-1234");
    expect(screen.getByText(/Minimal 12 karakter/).closest("li")).toHaveTextContent("— terpenuhi");
    expect(screen.getByText("Kekuatan: Kuat")).toBeInTheDocument();

    const confirm = screen.getByLabelText("Ulangi password");
    await user.type(confirm, "pendekSekali");
    expect(screen.getByText("Belum sama dengan password baru")).toBeInTheDocument();
    await user.type(confirm, "-1234");
    expect(screen.getByText("Password cocok")).toBeInTheDocument();
  });
});
