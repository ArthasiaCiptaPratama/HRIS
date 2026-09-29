import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authState, me, mockApi, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

const emptyNotifications = { data: [], meta: { page: 1, pageSize: 5, total: 0, unreadCount: 0 } };

// BUG-001: route lazy pada muatan awal tanpa HydrateFallback memicu warning React Router di konsol.
describe("BUG-001 HydrateFallback", () => {
  beforeEach(() => {
    authState.session = { access_token: "t", user: { id: "u" } };
    vi.clearAllMocks();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("membuka route lazy (Dashboard) tanpa warning HydrateFallback", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockApi({
      "/me": [200, { data: me("SUPER_ADMIN", true) }],
      "/notifications": [200, emptyNotifications],
    });
    renderAt("/");
    expect(await screen.findByRole("navigation", { name: "Navigasi utama" })).toBeInTheDocument();
    const messages = warn.mock.calls.map((args) => args.map(String).join(" "));
    expect(messages.filter((m) => m.includes("HydrateFallback"))).toEqual([]);
    warn.mockRestore();
  });
});
