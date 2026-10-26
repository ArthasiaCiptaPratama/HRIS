import { describe, expect, test } from "bun:test";
import { createApp } from "../../app.ts";
import { createLogger } from "../logger.ts";
import { APP_OPERATION_IDS, INPUT_DATE_PATTERN, operationIdFor } from "../openapi.ts";

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

// MOB-D7 #5 / MOB-D19: kontrak yang dibutuhkan klien Dart hasil generate.
type Doc = {
  paths: Record<string, Record<string, Record<string, unknown>>>;
  components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
};

const formatsDate = (node: unknown): boolean =>
  JSON.stringify(node ?? null).includes('"format":"date"');

describe("kontrak OpenAPI untuk app mobile", () => {
  test("EmployeeRoster = array dengan item skema bernama EmployeeRosterDay", async () => {
    const doc = (await spec()) as unknown as Doc;
    expect(doc.components.schemas.EmployeeRoster).toMatchObject({
      type: "array",
      items: { $ref: "#/components/schemas/EmployeeRosterDay" },
    });
  });

  test("status/jenis/sumber roster berupa enum, bukan string bebas", async () => {
    const doc = (await spec()) as unknown as Doc;
    const props = (name: string) =>
      doc.components.schemas[name]?.properties as Record<
        string,
        { items?: { properties: Record<string, unknown> } }
      >;
    expect(props("RosterChange").status).toMatchObject({
      enum: ["AWAITING_PEER", "PENDING", "APPROVED", "REJECTED", "CANCELLED"],
    });
    const grid = props("RosterGrid");
    expect(grid.holidays?.items?.properties.kind).toMatchObject({
      enum: ["NATIONAL", "COLLECTIVE_LEAVE"],
    });
    expect(grid.days?.items?.properties.source).toMatchObject({
      enum: ["PATTERN", "MANUAL", "IMPORT", "CHANGE"],
    });
  });

  test("skema inline impor karyawan tidak memakai nama MasterData milik GET /master-data", async () => {
    const doc = (await spec()) as unknown as Doc;
    expect(doc.components.schemas.EmployeeImportPreview?.properties?.masterData).toEqual({
      $ref: "#/components/schemas/EmployeeImportMasterData",
    });
    expect(doc.components.schemas.MasterData?.properties).toHaveProperty("companies");
  });

  test("punch mendeklarasikan header Idempotency-Key opsional", async () => {
    const doc = (await spec()) as unknown as Doc;
    const parameters = doc.paths["/api/v1/attendance/punch"]?.post?.parameters as {
      name: string;
      in: string;
      required?: boolean;
      schema: { pattern?: string };
    }[];
    expect(parameters).toContainEqual(
      expect.objectContaining({ name: "Idempotency-Key", in: "header", required: false }),
    );
  });

  test("tanggal input = string + pola tanpa format date; respons tetap format date", async () => {
    const doc = (await spec()) as unknown as Doc;
    const dated: string[] = [];
    const inputRefs = new Set<string>();
    for (const [path, operations] of Object.entries(doc.paths)) {
      for (const [method, operation] of Object.entries(operations)) {
        const input = { parameters: operation.parameters, requestBody: operation.requestBody };
        if (formatsDate(input)) dated.push(`${method} ${path}`);
        for (const [, name] of JSON.stringify(input).matchAll(/#\/components\/schemas\/(\w+)/g)) {
          inputRefs.add(name as string);
        }
      }
    }
    expect(dated).toEqual([]);
    // Komponen input langsung; bila suatu saat dipakai respons juga, withInputDates melewatinya → gagal di sini.
    expect([...inputRefs].filter((name) => formatsDate(doc.components.schemas[name]))).toEqual([]);

    const history = doc.paths["/api/v1/attendance/me/history"]?.get?.parameters as {
      name: string;
      schema: unknown;
    }[];
    expect(history.find((p) => p.name === "from")?.schema).toEqual({
      type: "string",
      pattern: INPUT_DATE_PATTERN,
    });
    expect(doc.components.schemas.AttendanceDay?.properties?.workDate).toMatchObject({
      format: "date",
    });
  });

  test("Me memuat employeeCompanyId nullable (filter roster/shift/crew di app)", async () => {
    const doc = (await spec()) as unknown as Doc;
    const me = doc.components.schemas.Me as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    expect(me.properties?.employeeCompanyId).toMatchObject({ type: ["string", "null"] });
    expect(me.required).toContain("employeeCompanyId");
  });
});
