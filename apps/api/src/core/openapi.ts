import { swaggerUI } from "@hono/swagger-ui";
import type { OpenAPIHono } from "@hono/zod-openapi";

export const API_BASE_PATH = "/api/v1";
export const BEARER_SCHEME = "Bearer";

// PROMPT §5: dokumen di /api/v1/openapi.json selalu lengkap untuk tim mobile.
export function registerOpenApi(app: OpenAPIHono): void {
  app.openAPIRegistry.registerComponent("securitySchemes", BEARER_SCHEME, {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    description: "Access token Supabase Auth",
  });

  app.doc31(`${API_BASE_PATH}/openapi.json`, {
    openapi: "3.1.0",
    info: {
      title: "HRIS Arthasia API",
      version: "1.0.0",
      description: "REST API HRIS PT Arthasia Cipta Pratama.",
    },
    servers: [{ url: "/" }],
  });

  app.get(`${API_BASE_PATH}/docs`, swaggerUI({ url: `${API_BASE_PATH}/openapi.json` }));
}
