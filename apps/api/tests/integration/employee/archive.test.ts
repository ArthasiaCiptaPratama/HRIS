import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ErrorBody } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId, createTestCompany } from "../../helpers/company.ts";

// D-054 (Arsip gelombang 1a): tabel lintas karyawan per kategori + kelola item per karyawan.
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const NUM = (n: string) => `AR-${RUN}-${n}`;
const auth = createAuthFixture(`ar${RUN.toLowerCase()}`);
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
});

type Headers = Record<string, string>;
type Login = Awaited<ReturnType<typeof auth.loginAs>>;
const call = (method: string, path: string, headers: Headers, body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const code = async (res: Response) => ((await res.json()) as ErrorBody).error.code;
// biome-ignore lint/suspicious/noExplicitAny: bentuk respons diperiksa per test
const body = async (res: Response) => (await res.json()) as { data: any; meta?: any };

const ids = {
  acp: "",
  other: "",
  status: "",
  department: "",
  position: "",
  manager: "",
  team: "",
  outsider: "",
  otherPt: "",
  inactive: "",
};
const startedAt = new Date();
let sa: Login;
let hr: Login;
let hrGrant: Login;
let hrOther: Login;
let mgr: Login;
let emp: Login;

async function employee(n: string, extra: Record<string, unknown> = {}) {
  const row = await prisma.employee.create({
    data: {
      companyId: ids.acp,
      employeeNumber: NUM(n),
      fullName: `Arsip ${RUN} ${n}`,
      joinDate: new Date("2023-02-01T00:00:00.000Z"),
      employmentStatusId: ids.status,
      positionId: ids.position,
      phoneNumber: "081234567890",
      emergencyContactName: `Kontak ${n}`,
      ...extra,
    },
  });
  await prisma.employeePersonal.create({
    data: { employeeId: row.id, domicileAddress: `Jl. Arsip ${n}` },
  });
  return row.id;
}
const q = `q=${RUN}`;
const list = async (category: string, who: Login, extra = "") =>
  call("GET", `/archive/${category}?${q}${extra ? `&${extra}` : ""}`, who.headers);

beforeAll(async () => {
  ids.acp = await acpCompanyId();
  ids.other = await createTestCompany(`A${RUN}`, `PT Arsip ${RUN}`);
  ids.status = (await prisma.employmentStatus.create({ data: { name: `Arsip St ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `Arsip Dept ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({
      data: { name: `Arsip Jab ${RUN}`, departmentId: ids.department },
    })
  ).id;
  ids.manager = await employee("M");
  ids.team = await employee("T", { managerId: ids.manager });
  ids.outsider = await employee("O");
  ids.otherPt = await employee("P", { companyId: ids.other });
  ids.inactive = await employee("I", {
    isActive: false,
    endDate: new Date("2025-01-01T00:00:00.000Z"),
  });
  for (const id of [ids.manager, ids.team, ids.outsider, ids.otherPt, ids.inactive]) {
    await prisma.education.create({
      data: { employeeId: id, level: id === ids.team ? "D3" : "S1", schoolName: `Kampus ${RUN}` },
    });
    await prisma.training.create({
      data: {
        employeeId: id,
        trainingField: `K3 ${RUN}`,
        type: id === ids.team ? "INTERNAL" : "EXTERNAL",
        cost: "2500000.00",
      },
    });
    await prisma.workExperience.create({
      data: { employeeId: id, companyName: `PT Lama ${RUN}`, position: "Staf", startYear: 2018 },
    });
    await prisma.employmentHistory.create({
      data: {
        employeeId: id,
        changeType: "HIRED",
        effectiveDate: new Date("2023-02-01T00:00:00.000Z"),
      },
    });
  }
  sa = await auth.loginAs("SUPER_ADMIN");
  hr = await auth.loginAs("HR_ADMIN", { companies: [ids.acp] });
  hrGrant = await auth.loginAs("HR_ADMIN", {
    companies: [ids.acp],
    grants: [{ permission: "EMPLOYEE_PERSONAL_READ" }],
  });
  hrOther = await auth.loginAs("HR_ADMIN", { companies: [ids.other] });
  mgr = await auth.loginAs("MANAGER", { employeeId: ids.manager });
  emp = await auth.loginAs("EMPLOYEE", { employeeId: ids.outsider });
});

afterAll(async () => {
  const employees = [ids.manager, ids.team, ids.outsider, ids.otherPt, ids.inactive];
  await auth.cleanup();
  // Audit yang dibuat test ini (item Arsip & baca data sensitif kontak).
  await prisma.auditLog.deleteMany({
    where: {
      occurredAt: { gte: startedAt },
      OR: [
        { entityType: "employee.archive" },
        ...["education", "training", "work_experience", "position_history"].map((entity) => ({
          entityType: `employee.${entity}`,
        })),
      ],
    },
  });
  await prisma.employee.updateMany({ where: { id: { in: employees } }, data: { managerId: null } });
  await prisma.employee.deleteMany({ where: { id: { in: employees } } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await prisma.company.delete({ where: { id: ids.other } });
  await disconnectPrisma();
});

describe("tabel lintas karyawan — cakupan (D-054 §8)", () => {
  test("SA semua PT; HR PT ditugaskan; MANAGER tim; EMPLOYEE 403; tanpa token 401", async () => {
    const names = async (who: Login) =>
      ((await body(await list("educations", who))).data as { employee: { id: string } }[])
        .map((r) => r.employee.id)
        .sort();
    expect(await names(sa)).toEqual([ids.manager, ids.team, ids.outsider, ids.otherPt].sort());
    expect(await names(hr)).toEqual([ids.manager, ids.team, ids.outsider].sort());
    expect(await names(hrOther)).toEqual([ids.otherPt]);
    expect(await names(mgr)).toEqual([ids.team]);
    expect((await list("educations", emp)).status).toBe(403);
    expect((await call("GET", "/archive/educations", {})).status).toBe(401);
  });

  test("status karyawan: bawaan aktif; inactive & all; paginasi meta", async () => {
    const inactive = await body(await list("trainings", sa, "employees=inactive"));
    expect(inactive.data.map((r: { employee: { id: string } }) => r.employee.id)).toEqual([
      ids.inactive,
    ]);
    const all = await body(await list("trainings", sa, "employees=all&pageSize=2"));
    expect(all.meta).toMatchObject({ page: 1, pageSize: 2, total: 5 });
    expect(all.data).toHaveLength(2);
  });

  test("filter kategori: jenjang, jenis pelatihan, PT; cari teks item", async () => {
    const d3 = await body(await list("educations", sa, "level=D3"));
    expect(d3.data.map((r: { employee: { id: string } }) => r.employee.id)).toEqual([ids.team]);
    const internal = await body(await list("trainings", sa, "type=INTERNAL"));
    expect(internal.meta.total).toBe(1);
    const otherPt = await body(await list("work-experiences", sa, `companyId=${ids.other}`));
    expect(otherPt.meta.total).toBe(1);
    const byItem = await body(
      await call("GET", `/archive/work-experiences?q=PT%20Lama%20${RUN}`, sa.headers),
    );
    expect(byItem.meta.total).toBe(4);
  });

  test("kontak: alamat domisili hanya bila berhak (SA / HR ber-grant); HR tanpa grant tanpa key", async () => {
    const saRow = (await body(await list("contacts", sa))).data.find(
      (r: { id: string }) => r.id === ids.outsider,
    );
    expect(saRow).toMatchObject({ domicileAddress: "Jl. Arsip O", phoneNumber: "081234567890" });
    const hrRow = (await body(await list("contacts", hr))).data.find(
      (r: { id: string }) => r.id === ids.outsider,
    );
    expect("domicileAddress" in hrRow).toBe(false);
    const grantRow = (await body(await list("contacts", hrGrant))).data.find(
      (r: { id: string }) => r.id === ids.outsider,
    );
    expect(grantRow.domicileAddress).toBe("Jl. Arsip O");
  });

  test("biaya pelatihan hanya SA/HR; MANAGER tanpa key", async () => {
    const saRow = (await body(await list("trainings", sa))).data[0];
    expect(saRow.cost).toBe(2500000);
    const mgrRow = (await body(await list("trainings", mgr))).data[0];
    expect("cost" in mgrRow).toBe(false);
  });
});

describe("kelola item per karyawan", () => {
  test("pendidikan: SA tambah/ubah/hapus; validasi 400; HR PT lain 404; MANAGER 403; item karyawan lain 404", async () => {
    const created = await call("POST", `/employees/${ids.outsider}/educations`, sa.headers, {
      level: "S2",
      schoolName: "Pascasarjana Uji",
      graduationYear: 2021,
    });
    expect(created.status).toBe(201);
    const itemId = (await body(created)).data.id as string;
    expect(
      (
        await call("PATCH", `/employees/${ids.outsider}/educations/${itemId}`, hr.headers, {
          level: "S2",
          schoolName: "Pascasarjana Uji Ubah",
        })
      ).status,
    ).toBe(200);
    expect(
      (await call("POST", `/employees/${ids.outsider}/educations`, sa.headers, { schoolName: "X" }))
        .status,
    ).toBe(400);
    expect(
      (
        await call("POST", `/employees/${ids.outsider}/educations`, hrOther.headers, {
          level: "S1",
          schoolName: "X",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call("POST", `/employees/${ids.team}/educations`, mgr.headers, {
          level: "S1",
          schoolName: "X",
        })
      ).status,
    ).toBe(403);
    expect(
      (await call("DELETE", `/employees/${ids.team}/educations/${itemId}`, sa.headers)).status,
    ).toBe(404);
    expect(
      (await call("DELETE", `/employees/${ids.outsider}/educations/${itemId}`, sa.headers)).status,
    ).toBe(200);
    const audits = await prisma.auditLog.count({
      where: { entityId: itemId, action: { startsWith: "employee.education." } },
    });
    expect(audits).toBe(3);
  });

  test("pelatihan: tahun dari tanggal mulai, biaya Decimal; selesai < mulai 400", async () => {
    const res = await call("POST", `/employees/${ids.outsider}/trainings`, sa.headers, {
      trainingField: "POP Uji",
      type: "EXTERNAL",
      startDate: "2024-05-02",
      endDate: "2024-05-06",
      hours: 32,
      cost: 7250000.5,
    });
    expect(res.status).toBe(201);
    const row = await prisma.training.findUniqueOrThrow({
      where: { id: (await body(res)).data.id },
    });
    expect(row.trainingYear).toBe(2024);
    expect(row.cost?.toString()).toBe("7250000.5");
    expect(
      (
        await call("POST", `/employees/${ids.outsider}/trainings`, sa.headers, {
          trainingField: "X",
          startDate: "2024-05-06",
          endDate: "2024-05-02",
        })
      ).status,
    ).toBe(400);
  });

  test("riwayat kerja & detail karyawan memuat riwayat kerja + biaya (SA)", async () => {
    expect(
      (
        await call("POST", `/employees/${ids.outsider}/work-experiences`, sa.headers, {
          companyName: "PT Sebelumnya",
          position: "Operator",
          startYear: 2015,
          endYear: 2017,
        })
      ).status,
    ).toBe(201);
    const detail = await body(await call("GET", `/employees/${ids.outsider}`, sa.headers));
    expect(
      detail.data.workExperiences.map((w: { companyName: string }) => w.companyName),
    ).toContain("PT Sebelumnya");
    expect(detail.data.trainings.some((t: { cost?: number }) => t.cost === 2500000)).toBe(true);
    expect(detail.data.histories[0]).toMatchObject({ source: "SYSTEM" });
  });

  test("riwayat jabatan: lama (manual) dengan teks jabatan; tanggal masa depan 400; otomatis hanya keterangan & tidak bisa dihapus", async () => {
    const created = await call(
      "POST",
      `/employees/${ids.outsider}/position-histories`,
      sa.headers,
      {
        effectiveDate: "2019-07-01",
        movementType: "PROMOTION",
        toPositionName: "Foreman Lama",
        toDepartmentName: "Produksi Lama",
        decreeNumber: "SK/07/2019",
      },
    );
    expect(created.status).toBe(201);
    const manualId = (await body(created)).data.id as string;
    expect(
      (
        await call("POST", `/employees/${ids.outsider}/position-histories`, sa.headers, {
          effectiveDate: "2999-01-01",
          movementType: "MUTATION",
          toPositionName: "X",
        })
      ).status,
    ).toBe(400);
    const listed = await body(await list("position-histories", sa, "source=MANUAL"));
    expect(listed.data[0]).toMatchObject({
      id: manualId,
      source: "MANUAL",
      movementType: "PROMOTION",
      toPositionName: "Foreman Lama",
      decreeNumber: "SK/07/2019",
    });
    const system = await prisma.employmentHistory.findFirstOrThrow({
      where: { employeeId: ids.outsider, changeType: "HIRED" },
    });
    expect(
      (
        await call(
          "PATCH",
          `/employees/${ids.outsider}/position-histories/${system.id}`,
          sa.headers,
          {
            decreeNumber: "SK/02/2023",
          },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          "PATCH",
          `/employees/${ids.outsider}/position-histories/${system.id}`,
          sa.headers,
          {
            toPositionName: "Ubah isi",
          },
        )
      ).status,
    ).toBe(400);
    expect(
      await code(
        await call(
          "DELETE",
          `/employees/${ids.outsider}/position-histories/${system.id}`,
          sa.headers,
        ),
      ),
    ).toBe("BUSINESS_RULE_VIOLATION");
    expect(
      (
        await call(
          "DELETE",
          `/employees/${ids.outsider}/position-histories/${manualId}`,
          sa.headers,
        )
      ).status,
    ).toBe(200);
  });
});
