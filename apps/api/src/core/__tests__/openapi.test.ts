import { describe, expect, test } from "bun:test";
import { createApp } from "../../app.ts";
import { createLogger } from "../logger.ts";
import { APP_OPERATION_IDS, operationIdFor } from "../openapi.ts";

// MOB-D9: operationId = nama method di klien Dart hasil generate; wajib ada & unik.
type Spec = { paths: Record<string, Record<string, { operationId?: string }>> };

async function spec(): Promise<Spec> {
  const app = createApp({
    logger: createLogger("error", () => undefined),
    checkDatabase: async () => true,
  });
  return (await (await app.request("/api/v1/openapi.json")).json()) as Spec;
}

describe("operationId OpenAPI", () => {
  test("nama otomatis dari method + path; parameter → By<Nama>", () => {
    expect(operationIdFor("get", "/api/v1/attendance/me/today")).toBe("getAttendanceMeToday");
    expect(operationIdFor("get", "/api/v1/attendance/days/{id}")).toBe("getAttendanceDaysById");
    expect(operationIdFor("post", "/api/v1/leave-requests/{id}/cancel")).toBe(
      "postLeaveRequestsByIdCancel",
    );
  });

  test("setiap operasi punya operationId yang unik", async () => {
    const ids: string[] = [];
    for (const operations of Object.values((await spec()).paths)) {
      for (const operation of Object.values(operations)) {
        expect(operation.operationId).toBeString();
        ids.push(operation.operationId as string);
      }
    }
    expect(ids.length).toBeGreaterThan(200);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(duplicates).toEqual([]);
  });

  test("setiap nama app menunjuk endpoint yang benar-benar ada (salah ketik path ketahuan)", async () => {
    const doc = await spec();
    for (const [key, name] of Object.entries(APP_OPERATION_IDS)) {
      const [method, path] = key.split(" ") as [string, string];
      expect({ key, id: doc.paths[path]?.[method.toLowerCase()]?.operationId }).toEqual({
        key,
        id: name,
      });
    }
  });
});
