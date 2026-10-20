import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AlphaBanner, PunchReminder } from "@/features/time-management/components/home-insights";
import type { Today } from "@/features/time-management/schemas";

vi.mock("@/lib/supabase", async () => ({
  supabase: (await import("./supabase-mock")).supabaseMock,
}));

// Paket UX 2026-10-20: pengingat absen langsung di HP & banner Alpha yang masih bisa dikoreksi.
const shift = {
  id: "s1",
  companyId: "c1",
  code: "D",
  name: "Day",
  startMinute: 7 * 60,
  endMinute: 19 * 60,
  checkInOpenMin: 60,
  lateToleranceMin: 15,
  earlyLeaveToleranceMin: 0,
  checkOutCloseMin: 240,
  color: null,
  archived: false,
};
const base = {
  serverTime: "2026-10-20T02:00:00.000Z",
  timezone: "Asia/Jakarta",
  gpsAccuracyMaxM: 100,
  employee: { id: "e1", fullName: "Rina", employeeNumber: "TMDEMO-EMP" },
  roster: [{ date: "2026-10-20", code: "D", shift }],
  location: null,
  openDay: null,
  recent: [],
  next: "IN",
} as unknown as Today;

const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

afterEach(() => vi.unstubAllGlobals());

describe("pengingat absen di HP", () => {
  it("belum Clock In setelah jam masuk + toleransi → banner merah dengan menit telat", () => {
    // 09.30 WIB = 02.30 UTC; shift D mulai 07.00 → lewat 2 jam 30 menit.
    wrap(<PunchReminder data={base} clock={new Date("2026-10-20T02:30:00.000Z")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Belum Clock In — shift D");
    expect(screen.getByRole("alert")).toHaveTextContent("lewat 2 jam 30 menit");
  });

  it("masih dalam toleransi telat → tanpa banner; sudah selesai (DONE) → tanpa banner", () => {
    const { container, rerender } = wrap(
      <PunchReminder data={base} clock={new Date("2026-10-20T00:10:00.000Z")} />,
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <PunchReminder
            data={{ ...base, next: "DONE" }}
            clock={new Date("2026-10-20T05:00:00.000Z")}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});

describe("banner Alpha", () => {
  it("menampilkan jumlah hari yang masih bisa dikoreksi & batas tercepat", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                employee: { id: "e1", fullName: "Rina", employeeNumber: null },
                today: "2026-10-20",
                summary: {
                  ALPHA_CORRECTABLE: 2,
                  ALPHA_EXPIRED: 1,
                  ALPHA_PERIOD: 0,
                  CORRECTION_PENDING: 0,
                  CORRECTED: 0,
                  CORRECTION_REJECTED: 0,
                },
                items: [
                  {
                    workDate: "2026-10-18",
                    shiftCode: "D",
                    outcome: "ALPHA_CORRECTABLE",
                    deadline: "2026-10-21",
                    correction: null,
                  },
                  {
                    workDate: "2026-10-17",
                    shiftCode: "D",
                    outcome: "ALPHA_CORRECTABLE",
                    deadline: "2026-10-20",
                    correction: null,
                  },
                  {
                    workDate: "2026-10-10",
                    shiftCode: "D",
                    outcome: "ALPHA_EXPIRED",
                    deadline: "2026-10-13",
                    correction: null,
                  },
                ],
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    wrap(<AlphaBanner />);
    expect(await screen.findByText("2 hari Alpha masih bisa dikoreksi")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("hari ini terakhir");
  });
});
