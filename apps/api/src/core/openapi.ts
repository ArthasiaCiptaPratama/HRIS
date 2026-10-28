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
  "GET /api/v1/roster/employees/{id}": "getEmployeeRoster",
  "GET /api/v1/shifts": "listShifts",
  "GET /api/v1/crews": "listCrews",
  "GET /api/v1/roster-changes": "listRosterChanges",
  "POST /api/v1/roster-changes": "createRosterChange",
  "POST /api/v1/roster-changes/{id}/cancel": "cancelRosterChange",
  "POST /api/v1/roster-changes/{id}/peer-response": "respondRosterChange",
  // TM-D24: keputusan perubahan jadwal oleh HR dari app (memutus lewat /approvals/{id}/decision).
  "GET /api/v1/roster-edits": "listRosterEdits",
  "GET /api/v1/roster-edits/{id}": "getRosterEdit",
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
  // TM-D17: perintah lembur (SPL) — karyawan melihat miliknya; atasan membuat/membatalkan dari app.
  "GET /api/v1/overtime-orders": "listOvertimeOrders",
  "PUT /api/v1/overtime-orders": "setOvertimeOrder",
  "POST /api/v1/overtime-orders/{id}/cancel": "cancelOvertimeOrder",
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

export const INPUT_DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";
const SCHEMA_REF = /^#\/components\/schemas\/(.+)$/;

type Json = unknown;
type Doc = { paths?: unknown; components?: { schemas?: Record<string, Json> } };

function walk(node: Json, visit: (obj: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
  } else if (node && typeof node === "object") {
    visit(node as Record<string, unknown>);
    for (const value of Object.values(node)) walk(value, visit);
  }
}

/** Komponen yang dirujuk `node`, termasuk rujukan bertingkat antar komponen. */
function referencedSchemas(node: Json, schemas: Record<string, Json>): Set<string> {
  const found = new Set<string>();
  const queue = [node];
  while (queue.length > 0) {
    walk(queue.pop(), (obj) => {
      const name = typeof obj.$ref === "string" ? SCHEMA_REF.exec(obj.$ref)?.[1] : undefined;
      if (name && !found.has(name)) {
        found.add(name);
        queue.push(schemas[name]);
      }
    });
  }
  return found;
}

/**
 * MOB-D19: tanggal murni pada INPUT (query/path/header & request body) = `string` + pola `YYYY-MM-DD`
 * tanpa `format: date`. Generator Dart memetakan `format: date` ke `DateTime` lalu mengirim
 * `2026-10-01T00:00:00.000`, yang ditolak `z.iso.date()`. Respons tetap `format: date` (diparse benar).
 * Komponen yang dipakai input sekaligus respons tidak diubah (test kontrak memastikan tidak ada).
 */
export function withInputDates<T extends Doc>(doc: T): T {
  const schemas = doc.components?.schemas ?? {};
  const inputs: Json[] = [];
  const outputs: Json[] = [];
  for (const operations of Object.values((doc.paths ?? {}) as Record<string, Json>)) {
    for (const operation of Object.values(operations as Record<string, Record<string, Json>>)) {
      inputs.push(operation.parameters, operation.requestBody);
      outputs.push(operation.responses);
    }
  }
  const outputSchemas = referencedSchemas(outputs, schemas);
  const inputOnly = [...referencedSchemas(inputs, schemas)].filter((n) => !outputSchemas.has(n));
  const toPlainString = (obj: Record<string, unknown>) => {
    if (obj.format !== "date") return;
    delete obj.format;
    obj.pattern ??= INPUT_DATE_PATTERN;
  };
  walk(inputs, toPlainString);
  for (const name of inputOnly) walk(schemas[name], toPlainString);
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
        withInputDates(
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
    ),
  );

  app.get(`${API_BASE_PATH}/docs`, swaggerUI({ url: `${API_BASE_PATH}/openapi.json` }));
}
