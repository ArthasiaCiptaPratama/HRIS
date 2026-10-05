import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ErrorBody } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { EMPLOYEE_PHOTO_BUCKET as BUCKET } from "../../../src/core/storage.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// D-037: foto profil pegawai — signed upload URL → unggah langsung → konfirmasi; akses PLAN §4.3.
const RUN = crypto.randomUUID().slice(0, 8);
const auth = createAuthFixture(RUN);
const fake = createFakeStorage();
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  storage: fake.storage,
  // Eksplisit kosong: `.env` developer boleh berisi prefix `dev/<nama>/` (PLAN §3.3).
  storagePathPrefix: "",
  appUrl: "http://localhost:5173",
});
// App kedua mewakili lokal developer: path foto diberi prefix `dev/<nama>/`.
const PREFIX = "dev/qa-test/";
const devApp = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  storage: fake.storage,
  storagePathPrefix: PREFIX,
  appUrl: "http://localhost:5173",
});

type Headers = Record<string, string>;
const callOn = (
  target: typeof app,
  method: string,
  path: string,
  headers: Headers,
  body?: unknown,
) =>
  target.request(`/api/v1${path}`, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const call = (method: string, path: string, headers: Headers, body?: unknown) =>
  callOn(app, method, path, headers, body);
const code = async (res: Response) => ((await res.json()) as ErrorBody).error.code;
// biome-ignore lint/suspicious/noExplicitAny: bentuk respons diperiksa per test
const body = async (res: Response) => (await res.json()) as { data: any };

const ids = {
  department: "",
  position: "",
  status: "",
  other: "",
  manager: "",
  team: "",
  self: "",
};
let sa: Awaited<ReturnType<typeof auth.loginAs>>;
let hr: typeof sa;
let mgr: typeof sa;
let emp: typeof sa;

async function makeEmployee(n: string, managerId: string | null = null) {
  const row = await prisma.employee.create({
    data: {
      employeeNumber: `P-${RUN}-${n}`,
      companyId: await acpCompanyId(),
      fullName: `Foto ${RUN} ${n}`,
      joinDate: new Date("2024-01-02T00:00:00.000Z"),
      employmentStatusId: ids.status,
      positionId: ids.position,
      managerId,
    },
  });
  return row.id;
}

/** upload-url + objek "terunggah" (simulasi browser) → path. */
async function uploaded(
  employeeId: string,
  headers: Headers,
  info = { size: 50_000, contentType: "image/webp" },
) {
  const res = await call("POST", `/employees/${employeeId}/photo/upload-url`, headers, {
    contentType: "image/webp",
  });
  expect(res.status).toBe(200);
  const { data } = await body(res);
  fake.putObject(BUCKET, data.path, info);
  return data.path as string;
}

beforeAll(async () => {
  const department = await prisma.department.create({ data: { name: `DeptFoto ${RUN}` } });
  ids.department = department.id;
  ids.position = (
    await prisma.position.create({ data: { name: `JabFoto ${RUN}`, departmentId: department.id } })
  ).id;
  ids.status = (await prisma.employmentStatus.create({ data: { name: `StFoto ${RUN}` } })).id;
  ids.other = await makeEmployee("O");
  ids.manager = await makeEmployee("M");
  ids.team = await makeEmployee("T", ids.manager);
  ids.self = await makeEmployee("E");
  sa = await auth.loginAs("SUPER_ADMIN");
  hr = await auth.loginAs("HR_ADMIN");
  mgr = await auth.loginAs("MANAGER", { employeeId: ids.manager });
  emp = await auth.loginAs("EMPLOYEE", { employeeId: ids.self });
});

afterAll(async () => {
  const employeeIds = [ids.other, ids.manager, ids.team, ids.self];
  await prisma.auditLog.deleteMany({ where: { entityId: { in: employeeIds } } });
  await auth.cleanup();
  await prisma.employee.updateMany({
    where: { id: { in: employeeIds } },
    data: { managerId: null },
  });
  await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
  await prisma.position.deleteMany({ where: { departmentId: ids.department } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await disconnectPrisma();
});

describe("POST /employees/:id/photo/upload-url", () => {
  test("HR: path unik milik pegawai + token; tipe tidak didukung 400", async () => {
    const res = await call("POST", `/employees/${ids.other}/photo/upload-url`, hr.headers, {
      contentType: "image/jpeg",
    });
    expect(res.status).toBe(200);
    const { data } = await body(res);
    expect(data.bucket).toBe(BUCKET);
    expect(data.path).toMatch(new RegExp(`^employees/${ids.other}/[0-9a-f-]{36}\\.jpg$`));
    expect(data.token).toBe("tok");
    expect(data.maxBytes).toBe(2 * 1024 * 1024);
    expect(
      await code(
        await call("POST", `/employees/${ids.other}/photo/upload-url`, hr.headers, {
          contentType: "image/gif",
        }),
      ),
    ).toBe("VALIDATION_ERROR");
  });

  test("akses: EMPLOYEE & MANAGER untuk diri sendiri 200; MANAGER→tim 403; EMPLOYEE→lain 404; tanpa token 401", async () => {
    const req = (id: string, headers: Headers) =>
      call("POST", `/employees/${id}/photo/upload-url`, headers, { contentType: "image/png" });
    expect((await req(ids.self, emp.headers)).status).toBe(200);
    expect((await req(ids.manager, mgr.headers)).status).toBe(200);
    expect(await code(await req(ids.team, mgr.headers))).toBe("FORBIDDEN");
    expect(await code(await req(ids.other, emp.headers))).toBe("NOT_FOUND");
    expect((await req(ids.other, {})).status).toBe(401);
    expect(await code(await req(crypto.randomUUID(), sa.headers))).toBe("NOT_FOUND");
  });
});

describe("POST /employees/:id/photo (konfirmasi) & DELETE", () => {
  test("belum terunggah 422; setelah terunggah 200 + URL; tersimpan, audit, tampil di detail & daftar", async () => {
    const res = await call("POST", `/employees/${ids.other}/photo/upload-url`, hr.headers, {
      contentType: "image/webp",
    });
    const path = (await body(res)).data.path as string;
    expect(
      await code(await call("POST", `/employees/${ids.other}/photo`, hr.headers, { path })),
    ).toBe("BUSINESS_RULE_VIOLATION");

    fake.putObject(BUCKET, path, { size: 80_000, contentType: "image/webp" });
    const ok = await call("POST", `/employees/${ids.other}/photo`, hr.headers, { path });
    expect(ok.status).toBe(200);
    expect((await body(ok)).data.photoUrl).toContain(path);

    const row = await prisma.employee.findUnique({ where: { id: ids.other } });
    expect(row?.photoPath).toBe(path);
    const audit = await prisma.auditLog.findMany({
      where: { action: "employee.photo.update", entityId: ids.other },
    });
    expect(audit.map((a) => [a.before, a.after])).toEqual([
      [{ hasPhoto: false }, { hasPhoto: true }],
    ]);

    const detail = await body(await call("GET", `/employees/${ids.other}?view=work`, sa.headers));
    expect(detail.data.photoUrl).toContain(path);
    expect(detail.data.access.photo).toBe(true);
    const list = await body(await call("GET", `/employees?q=${RUN}&pageSize=10`, sa.headers));
    const item = list.data.find((r: { id: string }) => r.id === ids.other);
    expect(item.photoUrl).toContain(path);
    expect(list.data.find((r: { id: string }) => r.id === ids.team).photoUrl).toBeNull();
  });

  test("ganti foto: path baru tersimpan, objek lama dihapus", async () => {
    const before = (await prisma.employee.findUnique({ where: { id: ids.other } }))?.photoPath;
    const path = await uploaded(ids.other, hr.headers);
    expect((await call("POST", `/employees/${ids.other}/photo`, hr.headers, { path })).status).toBe(
      200,
    );
    expect((await prisma.employee.findUnique({ where: { id: ids.other } }))?.photoPath).toBe(path);
    expect(fake.has(BUCKET, before as string)).toBe(false);
    expect(fake.removed).toContain(`${BUCKET}/${before}`);
  });

  test("bukan gambar / > 2 MB → 422 dan objek dibuang; path pegawai lain 422; format path salah 400", async () => {
    const html = await uploaded(ids.other, hr.headers, { size: 1000, contentType: "text/html" });
    expect(
      await code(await call("POST", `/employees/${ids.other}/photo`, hr.headers, { path: html })),
    ).toBe("BUSINESS_RULE_VIOLATION");
    expect(fake.has(BUCKET, html)).toBe(false);

    const big = await uploaded(ids.other, hr.headers, {
      size: 3 * 1024 * 1024,
      contentType: "image/jpeg",
    });
    expect(
      await code(await call("POST", `/employees/${ids.other}/photo`, hr.headers, { path: big })),
    ).toBe("BUSINESS_RULE_VIOLATION");
    expect(fake.has(BUCKET, big)).toBe(false);

    const foreign = await uploaded(ids.self, emp.headers);
    expect(
      await code(
        await call("POST", `/employees/${ids.other}/photo`, hr.headers, { path: foreign }),
      ),
    ).toBe("BUSINESS_RULE_VIOLATION");
    for (const path of [
      "../etc/passwd",
      `employees/${ids.other}/x.webp`,
      `employees/${ids.other}/${crypto.randomUUID()}.svg`,
    ]) {
      expect(
        await code(await call("POST", `/employees/${ids.other}/photo`, hr.headers, { path })),
      ).toBe("VALIDATION_ERROR");
    }
  });

  test("pegawai mengganti fotonya sendiri; MANAGER tidak bisa memasang foto timnya (403)", async () => {
    const own = await uploaded(ids.self, emp.headers);
    expect(
      (await call("POST", `/employees/${ids.self}/photo`, emp.headers, { path: own })).status,
    ).toBe(200);
    const self = await body(await call("GET", `/employees/${ids.self}?view=work`, emp.headers));
    expect(self.data.access.photo).toBe(true);
    expect(self.data.photoUrl).toContain(own);

    const teamPath = await uploaded(ids.team, hr.headers);
    expect(
      await code(
        await call("POST", `/employees/${ids.team}/photo`, mgr.headers, { path: teamPath }),
      ),
    ).toBe("FORBIDDEN");
    const team = await body(await call("GET", `/employees/${ids.team}?view=work`, mgr.headers));
    expect(team.data.access.photo).toBe(false);
  });

  test("DELETE: kolom kosong, objek dihapus, audit; ulang = tanpa perubahan; MANAGER→tim 403", async () => {
    const path = (await prisma.employee.findUnique({ where: { id: ids.self } }))
      ?.photoPath as string;
    expect(await code(await call("DELETE", `/employees/${ids.team}/photo`, mgr.headers))).toBe(
      "FORBIDDEN",
    );
    const res = await call("DELETE", `/employees/${ids.self}/photo`, emp.headers);
    expect(res.status).toBe(200);
    expect((await body(res)).data.photoUrl).toBeNull();
    expect((await prisma.employee.findUnique({ where: { id: ids.self } }))?.photoPath).toBeNull();
    expect(fake.has(BUCKET, path)).toBe(false);
    expect(
      await prisma.auditLog.count({
        where: { action: "employee.photo.delete", entityId: ids.self },
      }),
    ).toBe(1);
    expect((await call("DELETE", `/employees/${ids.self}/photo`, emp.headers)).status).toBe(200);
    expect(
      await prisma.auditLog.count({
        where: { action: "employee.photo.delete", entityId: ids.self },
      }),
    ).toBe(1);
  });
});

describe("STORAGE_PATH_PREFIX (PLAN §3.3: file lokal di bucket staging dengan prefix)", () => {
  test("upload-url memberi path berprefix; konfirmasi berprefix 200 dan tersimpan", async () => {
    const res = await callOn(
      devApp,
      "POST",
      `/employees/${ids.other}/photo/upload-url`,
      hr.headers,
      {
        contentType: "image/png",
      },
    );
    expect(res.status).toBe(200);
    const path = (await body(res)).data.path as string;
    expect(path).toMatch(new RegExp(`^dev/qa-test/employees/${ids.other}/[0-9a-f-]{36}\\.png$`));
    fake.putObject(BUCKET, path, { size: 40_000, contentType: "image/png" });
    const ok = await callOn(devApp, "POST", `/employees/${ids.other}/photo`, hr.headers, { path });
    expect(ok.status).toBe(200);
    expect((await prisma.employee.findUnique({ where: { id: ids.other } }))?.photoPath).toBe(path);
    // Foto berprefix tetap terbaca oleh app tanpa prefix (path lengkap disimpan di DB).
    const detail = await body(await call("GET", `/employees/${ids.other}?view=work`, sa.headers));
    expect(detail.data.photoUrl).toContain(path);
  });

  test("konfirmasi ditolak bila prefix tidak cocok dengan lingkungan (422)", async () => {
    const plain = await uploaded(ids.other, hr.headers);
    expect(
      await code(
        await callOn(devApp, "POST", `/employees/${ids.other}/photo`, hr.headers, { path: plain }),
      ),
    ).toBe("BUSINESS_RULE_VIOLATION");
    const other = `dev/orang-lain/employees/${ids.other}/${crypto.randomUUID()}.webp`;
    fake.putObject(BUCKET, other, { size: 1000, contentType: "image/webp" });
    for (const target of [app, devApp]) {
      expect(
        await code(
          await callOn(target, "POST", `/employees/${ids.other}/photo`, hr.headers, {
            path: other,
          }),
        ),
      ).toBe("BUSINESS_RULE_VIOLATION");
    }
  });
});
