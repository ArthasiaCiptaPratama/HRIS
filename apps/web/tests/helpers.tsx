import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { vi } from "vitest";
import { createQueryClient } from "@/app/providers";
import { routes } from "@/app/router";
import { AuthProvider } from "@/features/auth/auth-provider";

export { authState, supabaseMock } from "./supabase-mock";

export function me(
  role: "SUPER_ADMIN" | "HR_ADMIN" | "MANAGER" | "EMPLOYEE",
  primary = false,
  employeeId: string | null = null,
) {
  return {
    id: `acc-${role}`,
    email: `${role.toLowerCase()}@example.test`,
    role,
    isPrimarySuperAdmin: primary,
    employeeId,
    lastLoginAt: null,
    grants: [],
  };
}

/** fetch palsu: rute API → [status, body]. Selain itu 404. */
export function mockApi(routesMap: Record<string, [number, unknown]>) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const key = url.pathname.replace("/api/v1", "");
    const [status, body] = routesMap[key] ?? [
      404,
      { error: { code: "NOT_FOUND", message: "x", requestId: "r" } },
    ];
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

export function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}
