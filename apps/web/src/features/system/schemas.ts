import { z } from "zod";

export const healthResponseSchema = z.object({
  data: z.object({
    status: z.enum(["ok", "degraded"]),
    checks: z.object({ database: z.enum(["ok", "error"]) }),
    time: z.string(),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
