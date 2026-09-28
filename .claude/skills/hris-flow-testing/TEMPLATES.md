# Templat Test

## Matriks akses (policy, TDD)
```ts
import { describe, expect, test } from "bun:test";
import { canReadEmployeePersonal } from "../employee.policy.ts";

// PLAN §4.3 baris "Data pribadi sensitif": ✅ SA · 🔑 HR · 🔑 MANAGER tim · 👁 sendiri
const CASES = [
  { role: "SUPER_ADMIN", grants: [], target: "other", allowed: true },
  { role: "HR_ADMIN", grants: [], target: "other", allowed: false },
  { role: "HR_ADMIN", grants: ["employee.personal.read"], target: "other", allowed: true },
  { role: "MANAGER", grants: ["employee.personal.read"], target: "team", allowed: true },
  { role: "MANAGER", grants: ["employee.personal.read"], target: "other", allowed: false },
  { role: "EMPLOYEE", grants: [], target: "self", allowed: true },
  { role: "EMPLOYEE", grants: [], target: "other", allowed: false },
] as const;

describe("employee.personal.read", () => {
  test.each(CASES)("$role $grants → $target = $allowed", ({ role, grants, target, allowed }) => {
    expect(canReadEmployeePersonal(buildActor(role, grants), buildTarget(target))).toBe(allowed);
  });
});
```

## Integration endpoint
```ts
const app = createApp({ logger: createLogger("error", () => {}) });

test("403 bila EMPLOYEE membuat karyawan", async () => {
  const res = await app.request("/api/v1/employees", {
    method: "POST",
    headers: { ...(await auth.loginAs("EMPLOYEE")).headers, "Content-Type": "application/json" },
    body: JSON.stringify(validEmployeeInput(RUN)),
  });
  expect(res.status).toBe(403);
  expect((await res.json()).error.code).toBe("FORBIDDEN");
});
```

## Flow
```ts
describe("flow: onboarding karyawan", () => {
  test("HR membuat karyawan → MANAGER melihat di tim → tanpa grant tidak melihat NIK", async () => {
    const manager = await factories.employee({ run: RUN, role: "MANAGER" });
    const created = await post("/employees", asHr, { ...validEmployeeInput(RUN), managerId: manager.id });
    expect(created.status).toBe(201);

    const asManager = await loginAs("MANAGER", [], { employeeId: manager.id });
    const detail = await get(`/employees/${created.body.data.id}`, asManager);
    expect(detail.status).toBe(200);
    expect(detail.body.data).not.toHaveProperty("personal");
  });
});
```

`testVerifier` & `createAuthFixture` sudah ada di `tests/helpers/auth.ts` (contoh nyata: `tests/integration/iam/me.test.ts`). `factories`, `post`, `get` masih rencana; buat saat pertama dibutuhkan dan catat di CODEMAP §2.
