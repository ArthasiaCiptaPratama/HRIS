import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, type ReactNode, Suspense, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/features/auth/auth-provider";
import { ApiError } from "@/lib/api-client";
import { supabase } from "@/lib/supabase";

// DEV-ONLY: tombol switch DB lokal ⇄ Supabase. import.meta.env.DEV di-inline Vite menjadi `false`
// saat build produksi → komponen di-tree-shake (tak pernah masuk bundle rilis).
const DevDbSwitcher = import.meta.env.DEV
  ? lazy(() =>
      import("@/features/system/components/dev-db-switcher").then((m) => ({
        default: m.DevDbSwitcher,
      })),
    )
  : null;

// 401 dari API (token kedaluwarsa/akun dinonaktifkan) → keluarkan sesi; guard mengarahkan ke /login.
function handleUnauthenticated(error: unknown) {
  if (error instanceof ApiError && error.status === 401) void supabase.auth.signOut();
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: handleUnauthenticated }),
    mutationCache: new MutationCache({ onError: handleUnauthenticated }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // 401/403/404 tidak akan berubah dengan diulang.
        retry: (count, error) =>
          !(error instanceof ApiError && [401, 403, 404].includes(error.status)) && count < 1,
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
        <Toaster richColors position="top-right" />
        {DevDbSwitcher ? (
          <Suspense fallback={null}>
            <DevDbSwitcher />
          </Suspense>
        ) : null}
      </AuthProvider>
    </QueryClientProvider>
  );
}
