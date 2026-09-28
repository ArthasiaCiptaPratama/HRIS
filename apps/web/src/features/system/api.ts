import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api.ts";
import { healthResponseSchema } from "./schemas.ts";

export const systemKeys = {
  health: ["system", "health"] as const,
};

export function useHealth() {
  return useQuery({
    queryKey: systemKeys.health,
    queryFn: async ({ signal }) => {
      const body = await api("/health", {
        schema: healthResponseSchema,
        signal,
        acceptStatuses: [503],
      });
      return body.data;
    },
    refetchInterval: 30_000,
  });
}
