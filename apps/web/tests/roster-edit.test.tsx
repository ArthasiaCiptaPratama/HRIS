import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RosterEditList } from "@/features/time-management/components/roster-edit-list";
import { authState } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// TM-D24: atasan/HR memutus perubahan jadwal dari HR; pengaju bisa membatalkan.
const edit = (extra: Record<string, unknown> = {}) => ({
  id: "re1",
  kind: "TEMPLATE",
  status: "PENDING",
  employee: { id: "e1", fullName: "Budi Santoso", employeeNumber: "B1" },
  summary: "Isi template Malam → Crew A (Site)",
  effectiveDate: "2099-01-05",
  appliedFrom: null,
  reason: null,
  preview: [
    { date: "2099-01-05", from: "D", to: "N" },
    { date: "2099-01-06", from: "D", to: "N" },
    { date: "2099-01-07", from: "OFF", to: "OFF" },
  ],
  createdAt: "2099-01-01T00:00:00.000Z",
  createdByMe: false,
  approval: {
    id: "apr1",
    subjectType: "ROSTER_EDIT",
    subjectId: "re1",
    status: "PENDING",
    createdAt: "2099-01-01T00:00:00.000Z",
    decidedAt: null,
    steps: [],
    canDecide: true,
    canOverride: false,
  },
  ...extra,
});

function mockFetch(rows: unknown[]) {
  const posts: { path: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname.replace("/api/v1", "");
      const json = (data: unknown) =>
        new Response(JSON.stringify({ data }), { headers: { "Content-Type": "application/json" } });
      if (init?.method === "POST") {
        posts.push({ path, body: init.body ? JSON.parse(String(init.body)) : null });
        return path.endsWith("/cancel")
          ? json(edit({ status: "CANCELLED" }))
          : json({ requestId: "apr1", status: "PENDING" });
      }
      return json(rows);
    }),
  );
  return posts;
}

const renderList = (scope: "inbox" | "mine") =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RosterEditList scope={scope} enabled />
    </QueryClientProvider>,
  );

beforeEach(() => {
  authState.session = { access_token: "tok", user: { id: "u1" } };
});
afterEach(() => vi.unstubAllGlobals());

describe("Perubahan jadwal dari HR (TM-D24)", () => {
  it("inbox: ringkasan lama → baru; setujui; tolak wajib alasan", async () => {
    const user = userEvent.setup();
    const posts = mockFetch([edit()]);
    renderList("inbox");
    expect(await screen.findByText("Budi Santoso")).toBeInTheDocument();
    expect(screen.getByText(/2 dari 3 hari pertama berubah/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Setujui/ }));
    await waitFor(() =>
      expect(posts).toContainEqual({
        path: "/approvals/apr1/decision",
        body: { decision: "APPROVED" },
      }),
    );
    await user.click(screen.getByRole("button", { name: /Tolak/ }));
    const reject = screen.getByRole("button", { name: "Tolak perubahan" });
    expect(reject).toBeDisabled();
    await user.type(screen.getByLabelText("Alasan menolak"), "Masih dibutuhkan siang");
    await user.click(reject);
    await waitFor(() =>
      expect(posts).toContainEqual({
        path: "/approvals/apr1/decision",
        body: { decision: "REJECTED", note: "Masih dibutuhkan siang" },
      }),
    );
  });

  it("diajukan saya: tanpa tombol putus, bisa dibatalkan", async () => {
    const user = userEvent.setup();
    const posts = mockFetch([
      edit({ createdByMe: true, approval: { ...edit().approval, canDecide: false } }),
    ]);
    renderList("mine");
    await screen.findByText("Budi Santoso");
    expect(screen.queryByRole("button", { name: /Setujui/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Batalkan pengajuan" }));
    await waitFor(() =>
      expect(posts.some((p) => p.path === "/roster-edits/re1/cancel")).toBe(true),
    );
  });
});
