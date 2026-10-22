import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";

// Angka antrean keputusan Time Management (badge menu & tile Approval di HP).

export const timeQueueSchema = z.object({
  attendance: z.number(),
  leave: z.number(),
  corrections: z.number(),
  rosterChanges: z.number(),
  overtime: z.number().default(0),
  total: z.number(),
});
export type TimeQueue = z.infer<typeof timeQueueSchema>;
export type TimeQueueKey = Exclude<keyof TimeQueue, "total">;

export function useTimeQueue(enabled = true) {
  return useQuery({
    queryKey: ["time-management", "queue"],
    queryFn: ({ signal }) =>
      api("/time/queue", { schema: z.object({ data: timeQueueSchema }), signal }).then(
        (r) => r.data,
      ),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
