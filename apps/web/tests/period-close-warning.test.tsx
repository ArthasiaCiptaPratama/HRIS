import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloseDialog } from "@/features/time-management/pages/period-pages";
import { authState } from "./helpers";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// EMP-D8 P3 = b: hari yang masih menunggu persetujuan diperingatkan tegas; tutup periode tidak diblokir.
const preview = (pending: number) => ({
  status: "OPEN",
  alpha: pending,
  unverifiedAlpha: 0,
  noAttendance: 0,
  pending,
  rejected: 0,
  sample: [],
});

function renderDialog(pending: number) {
  const paths: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      paths.push(new URL(String(input)).pathname.replace("/api/v1", ""));
      return new Response(JSON.stringify({ data: preview(pending) }), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <CloseDialog companyId="c1" month="2026-10" onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return paths;
}

beforeEach(() => {
  authState.session = { access_token: "tok", user: { id: "u1" } };
});
afterEach(() => vi.unstubAllGlobals());

describe("tutup periode: peringatan hari menunggu persetujuan", () => {
  it("menampilkan jumlah + tautan ke antrean persetujuan, tombol tutup tetap ada", async () => {
    const paths = renderDialog(12);
    expect(await screen.findByText("12 hari masih menunggu persetujuan")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "antrean persetujuan Data Absen Harian" }),
    ).toHaveAttribute("href", "/time/absen-harian");
    expect(screen.getByRole("button", { name: /Tutup periode/ })).toBeInTheDocument();
    expect(paths).toEqual(["/attendance/periods/preview"]);
  });

  it("tanpa hari menunggu → tidak ada peringatan", async () => {
    renderDialog(0);
    expect(await screen.findByText(/hari akan menjadi/)).toBeInTheDocument();
    expect(screen.queryByText(/masih menunggu persetujuan/)).not.toBeInTheDocument();
  });
});
