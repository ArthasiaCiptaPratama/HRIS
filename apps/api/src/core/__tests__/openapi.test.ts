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
    expect(grid.holidays?.items?.properties.kind).toEqual({
      $ref: "#/components/schemas/HolidayKind",
    });
    expect(doc.components.schemas.HolidayKind).toMatchObject({
      enum: ["NATIONAL", "COLLECTIVE_LEAVE"],
    });
    expect(grid.days?.items?.properties.source).toMatchObject({
      enum: ["PATTERN", "MANUAL", "IMPORT", "CHANGE"],
    });
  });

  test("perintah lembur di AttendanceToday = TodayOvertimeOrder, tidak menimpa OvertimeOrder", async () => {
    const doc = (await spec()) as unknown as Doc;
    expect(
      JSON.stringify(doc.components.schemas.AttendanceToday?.properties?.overtimeOrder),
    ).toContain("#/components/schemas/TodayOvertimeOrder");
    expect(doc.components.schemas.OvertimeOrder?.properties).toHaveProperty("employee");
  });

  test("skema inline impor karyawan tidak memakai nama MasterData milik GET /master-data", async () => {
    const doc = (await spec()) as unknown as Doc;
    expect(doc.components.schemas.EmployeeImportPreview?.properties?.masterData).toEqual({
      $ref: "#/components/schemas/EmployeeImportMasterData",
    });
    expect(doc.components.schemas.MasterData?.properties).toHaveProperty("companies");
  });

  test.each([
    "/api/v1/attendance/punch",
    // MOB-D22: pengajuan dari app juga aman di-retry.
    "/api/v1/leave-requests",
    "/api/v1/attendance/corrections",
    "/api/v1/attendance/statements",
  ])("%s mendeklarasikan header Idempotency-Key opsional", async (path) => {
    const doc = (await spec()) as unknown as Doc;
    const parameters = doc.paths[path]?.post?.parameters as {
      name: string;
      in: string;
      required?: boolean;
      schema: { pattern?: string };
    }[];
    expect(parameters).toContainEqual(
      expect.objectContaining({ name: "Idempotency-Key", in: "header", required: false }),
    );
  });

  test("LeaveRequest.type = skema bernama LeaveRequestType (bukan objek inline yang bentrok nama di codegen)", async () => {
    const doc = (await spec()) as unknown as Doc;
    const schemas = doc.components.schemas as Record<
      string,
      { properties?: Record<string, { $ref?: string; enum?: string[] }> }
    >;
    expect(schemas.LeaveRequest?.properties?.type?.$ref).toBe(
      "#/components/schemas/LeaveRequestType",
    );
    expect(schemas.LeaveRequestType?.properties?.category?.enum).toEqual([
      "ANNUAL",
      "PERMIT",
      "SICK",
    ]);
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

  test("GET /employees (pemilih karyawan SPL, M5d): item bertipe dengan sub-objek bernama", async () => {
    const doc = (await spec()) as unknown as Doc;
    const op = doc.paths["/api/v1/employees"]?.get as {
      operationId: string;
      parameters: { name: string; schema: Record<string, unknown> }[];
    };
    expect(op.operationId).toBe("listEmployees");
    // Default konsisten dengan enum string → klien Dart tidak memakai default boolean untuk tipe enum.
    const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
    expect(op.parameters.find((p) => p.name === "active")?.schema).toEqual(
      ref("EmployeeActiveFilter"),
    );
    expect(doc.components.schemas.EmployeeActiveFilter).toMatchObject({
      enum: ["true", "false"],
      default: "true",
    });
    const props = doc.components.schemas.EmployeeListItem?.properties as Record<string, unknown>;
    expect(props.employmentStatus).toEqual(ref("EmployeeListStatus"));
    expect(props.company).toEqual(ref("EmployeeListCompany"));
    expect(props.position).toEqual(ref("EmployeeListRef"));
    for (const field of ["department", "workLocation", "grade", "manager"]) {
      expect(props[field]).toEqual({ anyOf: [ref("EmployeeListRef"), { type: "null" }] });
    }
  });

  // swagger_parser memberi enum inline yang tidak berada langsung di skema bernama (item array inline, body,
  // query) nama polos + nomor (`Kind`, `Kind3`, `Scope2`, …). Nomornya bergeser antar-spec dan enum kembar
  // bisa tidak dibuat sama sekali (Kind4/Category2 di f5ffc98 → app gagal kompilasi). Enum bernama generik
  // di operasi app wajib skema bernama, kecuali properti langsung skema bernama (nama `<Induk><Prop>`).
  // Enum query param selalu bernama polos (`Active` tidak dibuat di f5ffc98) → semuanya wajib bernama.
  test("operasi app tanpa enum inline bernama generik (kind/type/status/category/scope) atau di query", async () => {
    const doc = (await spec()) as unknown as Doc;
    const schemas = doc.components.schemas as Record<string, unknown>;
    const generic = new Set(["kind", "type", "status", "category", "scope"]);
    const visited = new Set<string>();
    const offenders: string[] = [];
    type Node = Record<string, unknown>;
    const walk = (
      node: unknown,
      where: string,
      prop: string | null,
      direct: boolean,
      query = false,
    ): void => {
      if (Array.isArray(node)) {
        for (const n of node) walk(n, where, prop, direct, query);
        return;
      }
      if (!node || typeof node !== "object") return;
      const n = node as Node;
      if (typeof n.$ref === "string") {
        const name = n.$ref.split("/").pop() as string;
        if (!visited.has(name)) {
          visited.add(name);
          walk(schemas[name], `#${name}`, null, true);
        }
        return;
      }
      if (Array.isArray(n.enum)) {
        if (query || (prop && generic.has(prop) && !direct)) offenders.push(where);
        return;
      }
      for (const key of ["anyOf", "oneOf", "allOf"]) {
        if (key in n) walk(n[key], where, prop, direct, query);
      }
      if (n.items) walk(n.items, `${where}[]`, prop, false);
      const props = (n.properties ?? {}) as Record<string, unknown>;
      // Properti langsung skema bernama → `direct`; di objek inline mana pun → tidak.
      const isNamedRoot = direct && prop === null;
      for (const [key, value] of Object.entries(props)) {
        walk(value, `${where}.${key}`, key, isNamedRoot);
      }
    };
    // Generator app memfilter per path (`include_paths`) → semua method pada path app ikut di-generate.
    const appPaths = new Set(Object.keys(APP_OPERATION_IDS).map((k) => k.split(" ")[1] as string));
    const operations = [...appPaths].flatMap((path) =>
      Object.entries(doc.paths[path] ?? {}).map(([method, op]) => ({
        key: `${method.toUpperCase()} ${path}`,
        op: op as Node,
      })),
    );
    for (const { key, op } of operations) {
      for (const p of (op.parameters ?? []) as { name: string; schema: unknown }[]) {
        walk(p.schema, `${key} ?${p.name}`, p.name, false, true);
      }
      const body = (op.requestBody as { content?: Record<string, { schema: unknown }> })?.content;
      for (const c of Object.values(body ?? {})) walk(c.schema, `${key} body`, null, false);
      const responses = (op.responses ?? {}) as Record<
        string,
        { content?: Record<string, { schema: unknown }> }
      >;
      for (const [code, r] of Object.entries(responses)) {
        for (const c of Object.values(r.content ?? {}))
          walk(c.schema, `${key} ${code}`, null, false);
      }
    }
    // Skema bernama di luar operasi app yang ikut memengaruhi penamaan (spec diparse utuh oleh generator).
    walk({ $ref: "#/components/schemas/LeaveLedger" }, "LeaveLedger", null, false);
    expect([...new Set(offenders)].sort()).toEqual([]);
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
