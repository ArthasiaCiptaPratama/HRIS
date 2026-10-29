import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "@/app/feature-flags";
import { authState, me, renderAt } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// Data Absen Harian: cari nama / NIK dikirim ke API (`q`), bukan disaring di browser (batas 500 baris).

function mockFetch() {
  const searches: URLSearchParams[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const path = url.pathname.replace("/api/v1", "");
      const json = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (path === "/me") return json(200, { data: { ...me("HR_ADMIN"), companyIds: [] } });
      if (path === "/health")
        return json(200, { data: { status: "ok", checks: { database: "ok" }, time: "x" } });
      if (path === "/notifications")
        return json(200, { data: [], meta: { page: 1, pageSize: 5, total: 0, unreadCount: 0 } });
      if (path === "/attendance/days") {
        searches.push(url.searchParams);
        return json(200, { data: [] });
      }
      return json(404, { error: { code: "NOT_FOUND", message: "x", requestId: "r" } });
    }),
  );
  return searches;
}

beforeEach(() => {
  authState.session = { access_token: "tok", user: { id: "u1" } };
});
afterEach(() => vi.unstubAllGlobals());

describe.skipIf(!FEATURES.timeManagement)("Data Absen Harian › cari karyawan", () => {
  it("ketik nama → permintaan daftar membawa q (dirapikan)", async () => {
    const user = userEvent.setup();
    const searches = mockFetch();
    renderAt("/time/absen-harian");
    const box = await screen.findByRole("textbox", { name: "Cari karyawan" });
    await user.type(box, "joko");
    await waitFor(() => expect(searches.at(-1)?.get("q")).toBe("joko"));
    expect(searches[0]?.has("q")).toBe(false);
    await user.clear(box);
    await user.type(box, "  ACP-0016 ");
    await waitFor(() => expect(searches.at(-1)?.get("q")).toBe("ACP-0016"));
    expect(await screen.findByText('Tidak ada absen untuk "ACP-0016"')).toBeInTheDocument();
  });
});
