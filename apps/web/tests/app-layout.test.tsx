import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { routes } from "@/app/router";

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("layout & router", () => {
  it("beranda menampilkan menu dan status API normal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: { status: "ok", checks: { database: "ok" }, time: new Date().toISOString() },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    renderAt("/");
    expect(screen.getByRole("navigation", { name: "Menu utama" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Beranda" })).toBeInTheDocument();
    expect(await screen.findByText("API & database normal")).toBeInTheDocument();
  });

  it("status API tidak terjangkau bila fetch gagal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    renderAt("/");
    expect(await screen.findByText("API tidak terjangkau")).toBeInTheDocument();
  });

  it("rute tidak dikenal menampilkan halaman 404", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderAt("/tidak-ada");
    expect(screen.getByRole("heading", { name: "Halaman tidak ditemukan" })).toBeInTheDocument();
  });
});
