import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RefreshButton } from "@/features/time-management/components/refresh-button";

// Tombol Muat ulang di halaman persetujuan: mengambil ulang query yang sedang tampil.
function Inbox({ fetcher }: { fetcher: () => Promise<string> }) {
  const q = useQuery({ queryKey: ["inbox"], queryFn: fetcher });
  return <p>{q.data ?? "…"}</p>;
}

describe("RefreshButton", () => {
  it("klik Muat ulang → antrean diambil ulang & data terbaru tampil", async () => {
    let n = 0;
    const fetcher = vi.fn(async () => `antrean ${++n}`);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Inbox fetcher={fetcher} />
        <RefreshButton />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("antrean 1")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Muat ulang" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Muat ulang" }));
    expect(await screen.findByText("antrean 2")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
