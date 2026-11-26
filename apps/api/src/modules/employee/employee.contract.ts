import type { z } from "@hono/zod-openapi";
import { assertExact } from "../../core/contract.ts";
import { employeeStatusChangeResultSchema } from "./employee.schema.ts";
import type { changeStatus } from "./employee.service.ts";

// Separate from schema.ts: repositories depend on input types there, so importing the service there creates a cycle.
assertExact<
  z.infer<typeof employeeStatusChangeResultSchema>,
  Awaited<ReturnType<typeof changeStatus>>
>(true);

export { employeeStatusChangeResultSchema };
