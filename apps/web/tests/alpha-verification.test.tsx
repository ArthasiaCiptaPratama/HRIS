import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlphaVerificationList } from "@/features/time-management/components/alpha-verification-list";
import { authState } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// TM-D13 Fase B: atasan memverifikasi Alpha tim (Alpha / izin / sakit / tugas luar, catatan wajib).
const item = {
  dayId: "d1",
  employee: { id: "e1", fullName: "Rina Lestari", employeeNumber: "ACP-1" },
  workDate: "2026-10-21",
  shiftCode: "S1",
  scheduledStart: "2026-10-21T01:00:00.000Z",
  verification: "PENDING",
  note: null,
  verifiedAt: null,
  deadline: "2026-10-24",
  canVerify: true,
};

beforeEach(() => {
  authState.session = { access_token: "tok", user: { id: "u1" } };
});
afterEach(() => vi.unstubAllGlobals());

describe("verifikasi Alpha (atasan)", () => {
  it("pilih Sakit + catatan → POST hasil verifikasi; tombol terkunci sampai lengkap", async () => {
    const posts: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname.replace("/api/v1", "");
        const json = (data: unknown) =>
          new Response(JSON.stringify({ data }), {
            headers: { "Content-Type": "application/json" },
          });
        if (init?.method === "POST") {
          posts.push({ path, body: JSON.parse(String(init.body)) });
          return json({ ...item, verification: "SICK", note: "Demam" });
        }
        return json(path === "/attendance/alpha-verifications" ? [item] : []);
      }),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AlphaVerificationList enabled />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Rina Lestari")).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Simpan verifikasi" });
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Sakit" }));
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Catatan verifikasi"), "Demam tinggi");
    await userEvent.click(save);
    await waitFor(() =>
      expect(posts).toEqual([
        {
          path: "/attendance/alpha-verifications/d1",
          body: { outcome: "SICK", note: "Demam tinggi" },
        },
      ]),
    );
  });
});
