import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { createTestCompany } from "../../helpers/company.ts";

// ORG-D5: zona HO/Site tersimpan di unit; endpoint sempit PUT /departments/:id/zone.

const RUN = crypto.randomUUID().slice(0, 8);
const name = (value: string) => `OUZ-${RUN} ${value}`;
const prisma = getPrisma();
const auth = createAuthFixture(`ouz-${RUN}`);
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
});
type Login = Awaited<ReturnType<typeof auth.loginAs>>;
let sa: Login;
let hr: Login;
let hrNoGrant: Login;
let hrOther: Login;
let companyId: string;
let otherCompanyId: string;
let siteRoot: string;
let siteChild: string;
let otherUnit: string;
let corporateUnit: string;
let positionId: string;
let postId: string;
const units: string[] = [];

const call = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const putZone = (id: string, headers: Record<string, string>, body: unknown) =>
  call("PUT", `/departments/${id}/zone`, headers, body);
const zoneOf = async (id: string) =>
  (await prisma.department.findUniqueOrThrow({ where: { id } })).zone;

beforeAll(async () => {
  companyId = await createTestCompany(`Z${RUN}`, name("PT Zona"));
  otherCompanyId = await createTestCompany(`Y${RUN}`, name("PT Lain"));
  const create = async (label: string, owner: string | null, parentId: string | null = null) => {
    const row = await prisma.department.create({
      data: { name: name(label), companyId: owner, parentId },
    });
    units.push(row.id);
    return row.id;
  };
  siteRoot = await create("Site Root", companyId);
  siteChild = await create("Engineering", companyId, siteRoot);
  otherUnit = await create("Lain", otherCompanyId);
  corporateUnit = await create("Korporat", null);
  positionId = (
    await prisma.position.create({ data: { name: name("Driller"), departmentId: siteChild } })
  ).id;
  postId = (await prisma.orgPost.create({ data: { positionId } })).id;
  sa = await auth.loginAs("SUPER_ADMIN");
  hr = await auth.loginAs("HR_ADMIN", {
    companies: [companyId],
    grants: [{ permission: "ORG_STRUCTURE_MANAGE" }],
  });
  hrNoGrant = await auth.loginAs("HR_ADMIN", { companies: [companyId] });
  hrOther = await auth.loginAs("HR_ADMIN", {
    companies: [otherCompanyId],
    grants: [{ permission: "ORG_STRUCTURE_MANAGE" }],
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: units } } });
  await auth.cleanup();
  if (postId) await prisma.orgPost.deleteMany({ where: { id: postId } });
  await prisma.position.deleteMany({ where: { departmentId: { in: units } } });
  await prisma.department.updateMany({ where: { id: { in: units } }, data: { parentId: null } });
  await prisma.department.deleteMany({ where: { id: { in: units } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await disconnectPrisma();
});

describe("ORG-D5 PUT /departments/:id/zone", () => {
  test("401 tanpa token, 400 body salah, 404 unit tak ada", async () => {
    expect((await putZone(siteRoot, {}, { zone: "SITE" })).status).toBe(401);
    expect((await putZone(siteRoot, sa.headers, { zone: "MARS" })).status).toBe(400);
    expect((await putZone(siteRoot, sa.headers, {})).status).toBe(400);
    expect((await putZone(crypto.randomUUID(), sa.headers, { zone: "SITE" })).status).toBe(404);
  });

  test("403 HR tanpa izin, HR PT lain, HR pada unit korporat", async () => {
    expect((await putZone(siteRoot, hrNoGrant.headers, { zone: "SITE" })).status).toBe(403);
    expect((await putZone(siteRoot, hrOther.headers, { zone: "SITE" })).status).toBe(403);
    expect((await putZone(corporateUnit, hr.headers, { zone: "SITE" })).status).toBe(403);
    expect(await zoneOf(siteRoot)).toBeNull();
    expect(await zoneOf(corporateUnit)).toBeNull();
  });

  test("HR ber-izin mengubah zona unit PT-nya + audit; /org-chart memuat zona", async () => {
    const response = await putZone(siteRoot, hr.headers, { zone: "SITE" });
    expect(response.status).toBe(200);
    expect(await zoneOf(siteRoot)).toBe("SITE");
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: siteRoot, action: "organization.department.zone_update" },
    });
    expect(audit?.before).toEqual({ zone: null });
    expect(audit?.after).toEqual({ zone: "SITE" });

    const chart = await call("GET", `/org-chart?companyId=${companyId}`, sa.headers);
    expect(chart.status).toBe(200);
    const body = (await chart.json()) as {
      data: { units: { id: string; zone: string | null }[] };
    };
    const byId = new Map(body.data.units.map((u) => [u.id, u.zone]));
    expect(byId.get(siteRoot)).toBe("SITE");
    // Anak tetap kosong (ikut induk) — leluhur ikut dikirim agar warisan zona terbaca.
    expect(byId.get(siteChild)).toBeNull();
  });

  test("SA mengubah zona unit korporat dan mengosongkan kembali (null = ikut induk)", async () => {
    expect((await putZone(corporateUnit, sa.headers, { zone: "HEAD_OFFICE" })).status).toBe(200);
    expect(await zoneOf(corporateUnit)).toBe("HEAD_OFFICE");
    expect((await putZone(corporateUnit, sa.headers, { zone: null })).status).toBe(200);
    expect(await zoneOf(corporateUnit)).toBeNull();
  });

  test("daftar admin unit mengembalikan zone + canEditZone sesuai aktor", async () => {
    const list = async (headers: Record<string, string>) => {
      const response = await call(
        "GET",
        `/departments?q=${encodeURIComponent(`OUZ-${RUN}`)}`,
        headers,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: { id: string; zone: string | null; canEditZone: boolean }[];
      };
      return new Map(body.data.map((row) => [row.id, row]));
    };
    const forHr = await list(hr.headers);
    expect(forHr.get(siteRoot)?.zone).toBe("SITE");
    expect(forHr.get(siteRoot)?.canEditZone).toBe(true);
    expect(forHr.get(otherUnit)?.canEditZone).toBe(false);
    expect(forHr.get(corporateUnit)?.canEditZone).toBe(false);
    const forSa = await list(sa.headers);
    expect(forSa.get(corporateUnit)?.canEditZone).toBe(true);
  });

  test("SA create/update unit menerima zone", async () => {
    const created = await call("POST", "/departments", sa.headers, {
      name: name("Camp"),
      companyId,
      zone: "SITE",
    });
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { data: { id: string } }).data.id;
    units.push(id);
    expect(await zoneOf(id)).toBe("SITE");
    expect((await call("PATCH", `/departments/${id}`, sa.headers, { zone: null })).status).toBe(
      200,
    );
    expect(await zoneOf(id)).toBeNull();
    // Form unit lengkap tetap SA saja.
    expect((await call("PATCH", `/departments/${id}`, hr.headers, { zone: "SITE" })).status).toBe(
      403,
    );
  });
});
