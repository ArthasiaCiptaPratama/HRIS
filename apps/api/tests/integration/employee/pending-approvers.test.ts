import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";

// Audit PM T4 (2026-11-23): langkah atasan yang masih menunggu ikut pindah saat atasan karyawan berubah,
// dan menjadi "tanpa atasan" saat atasannya dinonaktifkan. Langkah yang sudah diputus tidak disentuh.
const RUN = crypto.randomUUID().slice(0, 8);
const auth = createAuthFixture(RUN);
const fake = createFakeAuthAdmin();
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: fake.admin,
  appUrl: "http://localhost:5173",
});

const call = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const fx = {
  company: "",
  department: "",
  position: "",
  status: "",
  employees: [] as string[],
  requests: [] as string[],
};
let hr: Awaited<ReturnType<typeof auth.loginAs>>;
let staff = "";
let managerOld = "";
let managerNew = "";
let managerNoAccount = "";

async function makeEmployee(tag: string, managerId: string | null = null) {
  const row = await prisma.employee.create({
    data: {
      companyId: fx.company,
      employeeNumber: `PA-${RUN}-${tag}`,
      fullName: `Pengaju ${RUN} ${tag}`,
      joinDate: new Date("2024-01-02T00:00:00.000Z"),
      employmentStatusId: fx.status,
      positionId: fx.position,
      managerId,
    },
  });
  fx.employees.push(row.id);
  return row.id;
}

/** Permintaan approval PARALLEL milik `staff` dengan snapshot atasan `managerId`. */
async function makeRequest(managerId: string | null, managerDecision: "PENDING" | "APPROVED") {
  const row = await prisma.approvalRequest.create({
    data: {
      subjectType: "ATTENDANCE_PUNCH",
      subjectId: crypto.randomUUID(),
      requesterEmployeeId: staff,
      companyId: fx.company,
      managerEmployeeId: managerId,
      mode: "PARALLEL",
      steps: { create: [{ kind: "MANAGER", decision: managerDecision }, { kind: "HR" }] },
    },
  });
  fx.requests.push(row.id);
  return row.id;
}

const snapshot = async (id: string) =>
  (await prisma.approvalRequest.findUniqueOrThrow({ where: { id } })).managerEmployeeId;

beforeAll(async () => {
  fx.company = await acpCompanyId();
  fx.department = (await prisma.department.create({ data: { name: `Dept PA ${RUN}` } })).id;
  fx.position = (
    await prisma.position.create({ data: { name: `Jab PA ${RUN}`, departmentId: fx.department } })
  ).id;
  fx.status = (await prisma.employmentStatus.create({ data: { name: `St PA ${RUN}` } })).id;
  managerOld = await makeEmployee("M1");
  managerNew = await makeEmployee("M2");
  managerNoAccount = await makeEmployee("M3");
  staff = await makeEmployee("S1", managerOld);
  await auth.loginAs("EMPLOYEE", { employeeId: managerOld });
  await auth.loginAs("EMPLOYEE", { employeeId: managerNew });
  hr = await auth.loginAs("HR_ADMIN");
});

afterAll(async () => {
  await prisma.approvalRequest.deleteMany({ where: { id: { in: fx.requests } } });
  await auth.cleanup();
  await prisma.employee.updateMany({
    where: { id: { in: fx.employees } },
    data: { managerId: null },
  });
  await prisma.employeeFieldChange.deleteMany({ where: { employeeId: { in: fx.employees } } });
  await prisma.employmentHistory.deleteMany({ where: { employeeId: { in: fx.employees } } });
  await prisma.employee.deleteMany({ where: { id: { in: fx.employees } } });
  await prisma.position.deleteMany({ where: { id: fx.position } });
  await prisma.department.deleteMany({ where: { id: fx.department } });
  await prisma.employmentStatus.deleteMany({ where: { id: fx.status } });
  await disconnectPrisma();
});

describe("Langkah atasan PENDING mengikuti atasan karyawan (audit PM T4)", () => {
  test("ganti atasan → langkah atasan yang menunggu pindah; yang sudah diputus tetap", async () => {
    const waiting = await makeRequest(managerOld, "PENDING");
    const decided = await makeRequest(managerOld, "APPROVED");
    const res = await call("PATCH", `/employees/${staff}`, hr.headers, { managerId: managerNew });
    expect(res.status).toBe(200);
    expect(await snapshot(waiting)).toBe(managerNew);
    expect(await snapshot(decided)).toBe(managerOld);
  });

  test("atasan baru tanpa akun aktif → tanpa atasan (null), sama seperti saat pengajuan", async () => {
    const waiting = await makeRequest(managerNew, "PENDING");
    const res = await call("PATCH", `/employees/${staff}`, hr.headers, {
      managerId: managerNoAccount,
    });
    expect(res.status).toBe(200);
    expect(await snapshot(waiting)).toBeNull();
  });

  test("atasan dinonaktifkan → permintaan yang menunggunya menjadi tanpa atasan", async () => {
    const waiting = await makeRequest(managerNew, "PENDING");
    const decided = await makeRequest(managerNew, "APPROVED");
    const today = new Date().toISOString().slice(0, 10);
    const res = await call("POST", `/employees/${managerNew}/deactivate`, hr.headers, {
      effectiveDate: today,
      exitReason: "RESIGNATION",
    });
    expect(res.status).toBe(200);
    expect(await snapshot(waiting)).toBeNull();
    expect(await snapshot(decided)).toBe(managerNew);
  });
});
