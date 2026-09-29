import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "./auth-provider";
import { type Me, meResponseSchema } from "./schemas";

export const authKeys = { me: ["auth", "me"] as const };

/** Role & grant dari API (D-008), bukan dari token. */
export function useMe() {
  const { session } = useAuth();
  return useQuery({
    queryKey: [...authKeys.me, session?.user.id],
    queryFn: async ({ signal }): Promise<Me> =>
      (await api("/me", { schema: meResponseSchema, signal })).data,
    enabled: Boolean(session),
    staleTime: 60_000,
  });
}
