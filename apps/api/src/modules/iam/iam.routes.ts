import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import { ForbiddenError } from "../../core/errors.ts";
import { API_BASE_PATH, BEARER_SCHEME } from "../../core/openapi.ts";
import { dataEnvelope, ERROR_RESPONSES, ok } from "../../core/response.ts";
import { canReadOwnAccount } from "./iam.policy.ts";
import { meResponseSchema } from "./iam.schema.ts";
import * as service from "./iam.service.ts";

export interface IamRouteDeps {
  /** authenticate + loadActor, dirakit di app.ts. */
  protect: MiddlewareHandler[];
}

const meRoute = createRoute({
  method: "get",
  path: `${API_BASE_PATH}/me`,
  tags: ["IAM"],
  summary: "Profil akun yang sedang login: role, grant aktif, keterhubungan karyawan",
  security: [{ [BEARER_SCHEME]: [] }],
  responses: {
    200: {
      description: "Profil akses akun sendiri",
      content: { "application/json": { schema: dataEnvelope(meResponseSchema) } },
    },
    401: ERROR_RESPONSES[401],
    403: ERROR_RESPONSES[403],
    500: ERROR_RESPONSES[500],
  },
});

export function registerIamRoutes(app: OpenAPIHono, { protect }: IamRouteDeps): void {
  app.use(meRoute.getRoutingPath(), ...protect);
  app.openapi(meRoute, async (c) => {
    const actor = c.get("actor");
    if (!canReadOwnAccount(actor)) throw new ForbiddenError();
    return c.json(ok(await service.getMe(actor)), 200);
  });
}
