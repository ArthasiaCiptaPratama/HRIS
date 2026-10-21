import { swaggerUI } from "@hono/swagger-ui";
import type { OpenAPIHono } from "@hono/zod-openapi";

export const API_BASE_PATH = "/api/v1";
export const BEARER_SCHEME = "Bearer";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

/**
 * MOB-D9: nama operasi untuk endpoint yang dipakai app mobile (nama method di klien Dart hasil generate).
 * Kunci `METHOD /path` persis seperti di dokumen OpenAPI. Endpoint lain memakai nama otomatis.
 * Mengganti nama di sini = perubahan kontrak untuk app (generate ulang klien).
 */
export const APP_OPERATION_IDS: Record<string, string> = {
  "GET /api/v1/me": "getMe",
  "POST /api/v1/me/devices": "registerDevice",
  "DELETE /api/v1/me/devices/{token}": "unregisterDevice",
  "GET /api/v1/attendance/me/today": "getMyAttendanceToday",
  "GET /api/v1/attendance/me/history": "getMyAttendanceHistory",
  "POST /api/v1/attendance/precheck": "precheckPunch",
  "POST /api/v1/attendance/selfie-upload": "createSelfieUpload",
  "POST /api/v1/attendance/punch": "createPunch",
  "POST /api/v1/attendance/punches/{id}/cancel": "cancelMyPunch",
  "GET /api/v1/attendance/days": "listAttendanceDays",
  "GET /api/v1/attendance/days/{id}": "getAttendanceDay",
  "GET /api/v1/attendance/record/me": "getMyAttendanceRecord",
  "GET /api/v1/attendance/statements": "listStatements",
  "GET /api/v1/attendance/statements/me": "listMyStatements",
  "POST /api/v1/attendance/statements": "createStatement",
  "POST /api/v1/attendance/statements/upload": "createStatementUpload",
  "GET /api/v1/attendance/corrections": "listCorrections",
  "POST /api/v1/attendance/corrections": "createCorrection",
  "POST /api/v1/attendance/corrections/{id}/cancel": "cancelCorrection",
  "GET /api/v1/roster": "getRoster",
  "GET /api/v1/roster-changes": "listRosterChanges",
  "POST /api/v1/roster-changes": "createRosterChange",
  "POST /api/v1/roster-changes/{id}/cancel": "cancelRosterChange",
  "POST /api/v1/roster-changes/{id}/peer-response": "respondRosterChange",
  "GET /api/v1/holidays": "listHolidays",
  "GET /api/v1/leave-types": "listLeaveTypes",
  "GET /api/v1/leave/me": "getMyLeave",
  "POST /api/v1/leave/preview": "previewLeave",
  "POST /api/v1/leave/attachment-upload": "createLeaveAttachmentUpload",
  "GET /api/v1/leave-requests": "listLeaveRequests",
  "POST /api/v1/leave-requests": "createLeaveRequest",
  "GET /api/v1/leave-requests/{id}": "getLeaveRequest",
  "POST /api/v1/leave-requests/{id}/cancel": "cancelLeaveRequest",
  "GET /api/v1/overtime": "listOvertime",
  "GET /api/v1/time/queue": "getTimeQueue",
  "GET /api/v1/approvals/{id}": "getApproval",
  "POST /api/v1/approvals/{id}/decision": "decideApproval",
  "POST /api/v1/approvals/decisions": "decideApprovals",
  "GET /api/v1/notifications": "listNotifications",
  "POST /api/v1/notifications/{id}/read": "markNotificationRead",
  "POST /api/v1/notifications/read-all": "markAllNotificationsRead",
};

const pascal = (word: string) =>
  word
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

/** `GET /api/v1/attendance/days/{id}` → `getAttendanceDaysById` (setiap parameter path → `By<Nama>`). */
export function operationIdFor(method: string, path: string): string {
  const segments = path
    .replace(API_BASE_PATH, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      const param = /^\{(.+)\}$/.exec(segment);
      return param ? `By${pascal(param[1] as string)}` : pascal(segment);
    });
  return `${method.toLowerCase()}${segments.join("")}`;
}

type Operation = { operationId?: string };
type Paths = Record<string, Partial<Record<string, Operation>> | undefined>;

/** Lengkapi operationId: nama app (APP_OPERATION_IDS) → otomatis; yang sudah diisi di rute dihormati. */
export function withOperationIds<T extends { paths?: unknown }>(doc: T): T {
  for (const [path, operations] of Object.entries((doc.paths ?? {}) as Paths)) {
    for (const method of HTTP_METHODS) {
      const operation = operations?.[method];
      if (!operation || operation.operationId) continue;
      operation.operationId =
        APP_OPERATION_IDS[`${method.toUpperCase()} ${path}`] ?? operationIdFor(method, path);
    }
  }
  return doc;
}

// PROMPT §5: dokumen di /api/v1/openapi.json selalu lengkap untuk tim mobile.
export function registerOpenApi(app: OpenAPIHono): void {
  app.openAPIRegistry.registerComponent("securitySchemes", BEARER_SCHEME, {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    description: "Access token Supabase Auth",
  });

  app.get(`${API_BASE_PATH}/openapi.json`, (c) =>
    c.json(
      withOperationIds(
        app.getOpenAPI31Document({
          openapi: "3.1.0",
          info: {
            title: "Akselerasi Arthasia API",
            version: "1.0.0",
            description:
              "REST API Akselerasi Arthasia (HRIS PT Arthasia Cipta Pratama). App mobile mengirim header " +
              "`X-App-Version: MAJOR.MINOR.PATCH`; versi di bawah minimum dibalas 426 APP_UPDATE_REQUIRED " +
              "dengan `details[0] = { minVersion, downloadUrl }`. Punch absen menerima header " +
              "`Idempotency-Key` (retry aman).",
          },
          servers: [{ url: "/" }],
        }),
      ),
    ),
  );

  app.get(`${API_BASE_PATH}/docs`, swaggerUI({ url: `${API_BASE_PATH}/openapi.json` }));
}
