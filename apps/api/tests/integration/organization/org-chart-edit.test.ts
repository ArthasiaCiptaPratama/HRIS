import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  type ErrorBody,
  type OrgChartChange,
  orgChartChangePreviewSchema,
  orgChartChangeResultSchema,
} from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { createTestCompany } from "../../helpers/company.ts";

const RUN = crypto.randomUUID().slice(0, 8);
const name = (value: string) => `OCE-${RUN} ${value}`;
const prisma = getPrisma();
const auth = createAuthFixture(`oce-${RUN}`);
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
let manager: Login;
let companyId: string;
let otherCompanyId: string;
let departmentId: string;
let corporateDepartmentId: string;
let positionId: string;
let otherPositionId: string;
let corporatePositionId: string;
let statusId: string;
let bossA: string;
let bossB: string;
let staff: string;
let candidate: string;
let bossPostA: string;
let bossPostB: string;
let staffPost: string;
let corporatePost: string;
let requestId: string;
const employeeIds: string[] = [];
const departments: string[] = [];

const call = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const data = async (response: Response): Promise<unknown> =>
  ((await response.json()) as { data: unknown }).data;
const result = async (response: Response) => orgChartChangeResultSchema.parse(await data(response));
const revision = async () =>
  (await prisma.orgChartState.findUniqueOrThrow({ where: { id: 1 } })).revision;
async function batch(
  changes: OrgChartChange[],
  options: {
    headers?: Record<string, string>;
    baseRevision?: number;
    companyId?: string;
    preview?: boolean;
  } = {},
) {
  return call(
    "POST",
    `/org-chart/changes${options.preview ? "/preview" : ""}`,
    options.headers ?? sa.headers,
    {
      companyId: options.companyId ?? companyId,
      baseRevision: options.baseRevision ?? (await revision()),
      changes,
    },
  );
}
const newPost = (
  tempId = "tmp:post",
  extra: Partial<Extract<OrgChartChange, { op: "createPost" }>> = {},
): Extract<OrgChartChange, { op: "createPost" }> => ({
  op: "createPost",
  tempId,
  positionId,
  reportsToId: null,
  functionalReportsToId: null,
  headcount: 1,
  sortOrder: 0,
  ...extra,
});
async function employee(
  label: string,
  extra: { orgPostId?: string; managerId?: string; onboardingStatus?: "NOT_INVITED" } = {},
) {
  const row = await prisma.employee.create({
    data: {
      employeeNumber: `OCE-${RUN}-${label}`,
      fullName: name(label),
      companyId,
      employmentStatusId: statusId,
      positionId,
      joinDate: new Date("2024-01-02"),
      ...extra,
    },
  });
  employeeIds.push(row.id);
  return row.id;
}
async function expectRejected(changes: OrgChartChange[], status = 422, preview = false) {
  const baseRevision = await revision();
  const response = await batch(changes, { baseRevision, preview });
  expect(response.status).toBe(status);
  const body = (await response.json()) as ErrorBody;
  if (status !== 400) expect(JSON.stringify(body.error.details)).toContain("changes.");
  expect(await revision()).toBe(baseRevision);
  return body;
}

beforeAll(async () => {
  companyId = await createTestCompany(`E${RUN}`, name("PT Edit"));
  otherCompanyId = await createTestCompany(`F${RUN}`, name("PT Lain"));
  for (const [label, owner] of [
    ["Unit", companyId],
    ["Lain", otherCompanyId],
    ["Korporat", null],
  ] as const) {
    const row = await prisma.department.create({ data: { name: name(label), companyId: owner } });
    departments.push(row.id);
  }
  [departmentId, , corporateDepartmentId] = departments as [string, string, string];
  const positions: string[] = [];
  for (const id of departments) {
    positions.push(
      (await prisma.position.create({ data: { name: name("Jabatan"), departmentId: id } })).id,
    );
  }
  [positionId, otherPositionId, corporatePositionId] = positions as [string, string, string];
  statusId = (await prisma.employmentStatus.create({ data: { name: name("Status") } })).id;
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
  manager = await auth.loginAs("MANAGER");
  bossPostA = (await prisma.orgPost.create({ data: { positionId } })).id;
  bossPostB = (await prisma.orgPost.create({ data: { positionId } })).id;
  staffPost = (await prisma.orgPost.create({ data: { positionId, reportsToId: bossPostA } })).id;
  corporatePost = (await prisma.orgPost.create({ data: { positionId: corporatePositionId } })).id;
  bossA = await employee("boss-a", { orgPostId: bossPostA });
  bossB = await employee("boss-b", { orgPostId: bossPostB });
  staff = await employee("staff", { orgPostId: staffPost, managerId: bossA });
  candidate = await employee("candidate", { onboardingStatus: "NOT_INVITED" });
  await auth.loginAs("MANAGER", { employeeId: bossA });
  await auth.loginAs("MANAGER", { employeeId: bossB });
  requestId = (
    await prisma.approvalRequest.create({
      data: {
        subjectType: "LEAVE",
        subjectId: crypto.randomUUID(),
        requesterEmployeeId: staff,
        companyId,
        managerEmployeeId: bossA,
        mode: "SINGLE",
        status: "PENDING",
      },
    })
  ).id;
});

afterAll(async () => {
  // Setup can fail before the request exists; undefined would remove the Prisma filter.
  if (requestId) await prisma.approvalRequest.deleteMany({ where: { id: requestId } });
  await prisma.employmentHistory.deleteMany({ where: { employeeId: { in: employeeIds } } });
  await auth.cleanup();
  await prisma.employee.updateMany({
    where: { id: { in: employeeIds } },
    data: { orgPostId: null, managerId: null },
  });
  await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
  const posts = await prisma.orgPost.findMany({
    where: { position: { departmentId: { in: departments } } },
    select: { id: true },
  });
  const postIds = posts.map((post) => post.id);
  await prisma.orgPost.updateMany({
    where: { id: { in: postIds } },
    data: { reportsToId: null, functionalReportsToId: null },
  });
  await prisma.orgPost.deleteMany({ where: { id: { in: postIds } } });
  await prisma.position.deleteMany({ where: { departmentId: { in: departments } } });
  await prisma.department.deleteMany({ where: { id: { in: departments } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await prisma.employmentStatus.deleteMany({ where: { id: statusId } });
  await disconnectPrisma();
});

describe("ORG-D2 akses & kontrak", () => {
  test("401 tanpa token, 403 Manager/HR tanpa grant/PT di luar cakupan untuk apply dan preview", async () => {
    for (const preview of [false, true]) {
      for (const [headers, expected] of [
        [{}, 401],
        [manager.headers, 403],
        [hrNoGrant.headers, 403],
        [hrOther.headers, 403],
      ] as const) {
        expect((await batch([newPost()], { headers, preview })).status).toBe(expected);
      }
    }
  });

  test("HR tidak dapat mengubah korporat atau memindahkan pos ke/dari PT di luar cakupan", async () => {
    for (const change of [
      { op: "updatePost", postId: corporatePost, headcount: 2 },
      { op: "archivePost", postId: corporatePost },
      newPost("tmp:corp", { positionId: corporatePositionId }),
      { op: "updatePost", postId: bossPostB, positionId: otherPositionId },
    ] satisfies OrgChartChange[]) {
      expect((await batch([change], { headers: hr.headers })).status).toBe(403);
    }
    expect(
      (
        await batch([
          {
            op: "createPosition",
            tempId: "tmp:corp-pos",
            name: name("Terlarang"),
            departmentId: corporateDepartmentId,
            level: "L2",
          },
        ])
      ).status,
    ).toBe(403);
  });

  test("GET memuat revision, positionId, canEdit & canEditCorporate sesuai izin", async () => {
    for (const [login, canEdit, canEditCorporate] of [
      [sa, true, true],
      [hr, true, false],
      [hrNoGrant, false, false],
    ] as const) {
      const response = await call("GET", `/org-chart?companyId=${companyId}`, login.headers);
      expect(response.status).toBe(200);
      const chart = (await data(response)) as {
        revision: number;
        canEdit: boolean;
        canEditCorporate: boolean;
        posts: { id: string; positionId: string }[];
      };
      expect(chart).toMatchObject({ revision: await revision(), canEdit, canEditCorporate });
      expect(chart.posts.find((post) => post.id === staffPost)?.positionId).toBe(positionId);
    }
  });

  test("Direksi di unit ber-PT tetap hanya SA", async () => {
    const executive = await prisma.position.create({
      data: { name: name("Direksi"), departmentId, level: "L6" },
    });
    expect(
      (
        await batch([newPost("tmp:executive", { positionId: executive.id })], {
          headers: hr.headers,
        })
      ).status,
    ).toBe(403);
    const response = await batch([newPost("tmp:executive", { positionId: executive.id })]);
    expect(response.status).toBe(200);
    const postId = (await result(response)).createdIds["tmp:executive"] as string;
    for (const changes of [
      [{ op: "updatePost", postId, sortOrder: 1 }],
      [{ op: "archivePost", postId }],
      [{ op: "updatePost", postId, positionId }],
      [{ op: "placeEmployee", employeeId: staff, postId }],
    ] satisfies OrgChartChange[][]) {
      expect((await batch(changes, { headers: hr.headers })).status).toBe(403);
    }
    expect((await call("DELETE", `/org-posts/${postId}`, hr.headers)).status).toBe(403);
  });

  test("SA dan HR berizin berhasil; revisi tepat +1 dan audit satu entri tanpa data pribadi", async () => {
    for (const login of [sa, hr]) {
      const baseRevision = await revision();
      const auditBefore = await prisma.auditLog.count({
        where: { actorAccountId: login.account.id, action: "organization.org_chart.batch_apply" },
      });
      const response = await batch([newPost("tmp:one"), newPost("tmp:two")], {
        headers: login.headers,
        baseRevision,
      });
      expect(response.status).toBe(200);
      const saved = await result(response);
      expect(saved.revision).toBe(baseRevision + 1);
      expect(await revision()).toBe(baseRevision + 1);
      expect(Object.keys(saved.createdIds)).toHaveLength(2);
      const logs = await prisma.auditLog.findMany({
        where: { actorAccountId: login.account.id, action: "organization.org_chart.batch_apply" },
      });
      expect(logs).toHaveLength(auditBefore + 1);
      expect(JSON.stringify(logs)).not.toContain(name("staff"));
    }
  });
});

describe("ORG-D2 validasi, revisi, dan atomisitas", () => {
  test("slot di luar 1–50 atau body tidak valid → 400 di kedua route", async () => {
    for (const preview of [false, true]) {
      for (const headcount of [0, 51])
        await expectRejected([newPost("tmp:invalid", { headcount })], 400, preview);
      const response = await call(
        "POST",
        `/org-chart/changes${preview ? "/preview" : ""}`,
        sa.headers,
        { companyId },
      );
      expect(response.status).toBe(400);
    }
  });

  test("409 revisi basi untuk apply dan preview", async () => {
    const baseRevision = await revision();
    const response = await batch([newPost()], { baseRevision });
    expect(response.status).toBe(200);
    for (const preview of [false, true]) {
      const stale = await batch([newPost()], { baseRevision, preview });
      expect(stale.status).toBe(409);
      expect(((await stale.json()) as ErrorBody).error.message).toBe(
        "Bagan sudah diubah pengguna lain. Muat ulang bagan.",
      );
    }
    expect(await revision()).toBe(baseRevision + 1);
  });

  test("dua penulis dengan base sama: tepat satu sukses, satu 409", async () => {
    const baseRevision = await revision();
    const count = await prisma.orgPost.count();
    const responses = await Promise.all([
      batch([newPost("tmp:race-a")], { baseRevision }),
      batch([newPost("tmp:race-b")], { baseRevision }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await revision()).toBe(baseRevision + 1);
    expect(await prisma.orgPost.count()).toBe(count + 1);
  });

  test("operasi kedua gagal → tidak ada pos baru, revisi tetap, detail changes.1", async () => {
    const count = await prisma.orgPost.count();
    const body = await expectRejected([
      newPost("tmp:atomic"),
      { op: "updatePost", postId: bossPostA, reportsToId: staffPost },
    ]);
    expect(JSON.stringify(body.error.details)).toContain("changes.1");
    expect(await prisma.orgPost.count()).toBe(count);
  });

  test("siklus, garis tegas lintas PT, id sementara sebelum dibuat/duplikat ditolak", async () => {
    for (const changes of [
      [{ op: "updatePost", postId: bossPostA, reportsToId: staffPost }],
      [newPost("tmp:cross", { positionId: otherPositionId, reportsToId: bossPostA })],
      [newPost("tmp:future", { reportsToId: "tmp:not-created" })],
      [newPost("tmp:duplicate"), newPost("tmp:duplicate")],
      [newPost("tmp:self", { reportsToId: bossPostA, functionalReportsToId: bossPostA })],
    ] satisfies OrgChartChange[][]) {
      await expectRejected(changes);
      await expectRejected(changes, 422, true);
    }
  });

  test("HR boleh merujuk pos korporat sebagai atasan fungsional", async () => {
    const response = await batch(
      [newPost("tmp:function", { functionalReportsToId: corporatePost })],
      { headers: hr.headers },
    );
    expect(response.status).toBe(200);
    const id = (await result(response)).createdIds["tmp:function"];
    expect((await prisma.orgPost.findUniqueOrThrow({ where: { id } })).functionalReportsToId).toBe(
      corporatePost,
    );
  });

  test("id sementara: jabatan baru, bawahan, dan penempatan dengan riwayat", async () => {
    const personId = await employee("placed");
    const response = await batch(
      [
        {
          op: "createPosition",
          tempId: "tmp:position",
          name: name("Jabatan baru"),
          departmentId,
          level: "L2",
        },
        newPost("tmp:parent", { positionId: "tmp:position" }),
        newPost("tmp:child", { positionId: "tmp:position", reportsToId: "tmp:parent" }),
        { op: "placeEmployee", employeeId: personId, postId: "tmp:child" },
      ],
      { headers: hr.headers },
    );
    expect(response.status).toBe(200);
    const saved = await result(response);
    expect(Object.keys(saved.createdIds)).toHaveLength(3);
    const row = await prisma.employee.findUniqueOrThrow({ where: { id: personId } });
    expect(row.orgPostId).toBe(saved.createdIds["tmp:child"] as string);
    expect(row.positionId).toBe(saved.createdIds["tmp:position"] as string);
    expect(
      (await prisma.orgPost.findUniqueOrThrow({ where: { id: row.orgPostId as string } }))
        .reportsToId,
    ).toBe(saved.createdIds["tmp:parent"] as string);
    expect(
      await prisma.employmentHistory.count({
        where: {
          employeeId: personId,
          changeType: "POSITION_CHANGED",
          fromPositionId: positionId,
          toPositionId: row.positionId,
        },
      }),
    ).toBe(1);
    const detach = await batch([{ op: "placeEmployee", employeeId: personId, postId: null }]);
    expect(detach.status).toBe(200);
    expect(
      await prisma.employee.findUnique({
        where: { id: personId },
        select: { orgPostId: true, positionId: true },
      }),
    ).toEqual({ orgPostId: null, positionId: row.positionId });
  });

  test("pos penuh, calon belum disetujui, jabatan berisi, dan slot kurang dari pemegang ditolak", async () => {
    const unplaced = await employee("full");
    await expectRejected([{ op: "placeEmployee", employeeId: unplaced, postId: staffPost }]);
    await expectRejected([{ op: "placeEmployee", employeeId: candidate, postId: bossPostB }]);
    await expectRejected([
      { op: "updatePost", postId: staffPost, positionId: corporatePositionId },
    ]);
    const response = await batch([
      newPost("tmp:slots", { headcount: 2 }),
      { op: "placeEmployee", employeeId: unplaced, postId: "tmp:slots" },
      { op: "placeEmployee", employeeId: staff, postId: "tmp:slots" },
      { op: "updatePost", postId: "tmp:slots", headcount: 1 },
    ]);
    expect(response.status).toBe(422);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: staff } })).orgPostId).toBe(
      staffPost,
    );
  });

  test("nama jabatan unik per unit, termasuk di dalam batch", async () => {
    const create: OrgChartChange = {
      op: "createPosition",
      tempId: "tmp:dup-pos",
      name: name("Jabatan"),
      departmentId,
      level: "L2",
    };
    await expectRejected([create], 409);
    const fresh: OrgChartChange = { ...create, name: name("Jabatan duplikat") };
    await expectRejected([fresh, { ...fresh, tempId: "tmp:dup-pos2" }], 409);
    expect(await prisma.position.count({ where: { name: name("Jabatan duplikat") } })).toBe(0);
  });

  test("jabatan/unit arsip ditolak dan penempatan menghormati PT/korporat/status aktif", async () => {
    const archivedPosition = await prisma.position.create({
      data: { name: name("Arsip"), departmentId, deletedAt: new Date() },
    });
    await expectRejected([newPost("tmp:archived-position", { positionId: archivedPosition.id })]);
    const archivedUnit = await prisma.department.create({
      data: { name: name("Unit arsip"), companyId, deletedAt: new Date() },
    });
    departments.push(archivedUnit.id);
    await expectRejected([
      {
        op: "createPosition",
        tempId: "tmp:unit-archived",
        name: name("Arsip baru"),
        departmentId: archivedUnit.id,
        level: "L2",
      },
    ]);

    const personId = await employee("cross-placement");
    const otherPost = await prisma.orgPost.create({ data: { positionId: otherPositionId } });
    await expectRejected([{ op: "placeEmployee", employeeId: personId, postId: otherPost.id }]);
    expect(
      (
        await batch([{ op: "placeEmployee", employeeId: personId, postId: corporatePost }], {
          headers: hr.headers,
        })
      ).status,
    ).toBe(403);
    expect(
      (await batch([{ op: "placeEmployee", employeeId: personId, postId: corporatePost }])).status,
    ).toBe(200);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: personId } })).positionId).toBe(
      corporatePositionId,
    );
    expect(
      (await batch([{ op: "placeEmployee", employeeId: personId, postId: null }])).status,
    ).toBe(200);
    await prisma.employee.update({ where: { id: personId }, data: { isActive: false } });
    await expectRejected([{ op: "placeEmployee", employeeId: personId, postId: null }]);
    await expectRejected(
      [{ op: "placeEmployee", employeeId: crypto.randomUUID(), postId: null }],
      404,
    );
  });

  test("arsip: pos berisi atau berbawahan ditolak; pos kosong diarsipkan", async () => {
    await expectRejected([{ op: "archivePost", postId: staffPost }]);
    const parent = (await prisma.orgPost.create({ data: { positionId } })).id;
    const child = (
      await prisma.orgPost.create({ data: { positionId, functionalReportsToId: parent } })
    ).id;
    await expectRejected([{ op: "archivePost", postId: parent }]);
    expect(
      (
        await batch([
          { op: "archivePost", postId: child },
          { op: "archivePost", postId: parent },
        ])
      ).status,
    ).toBe(200);
    expect(
      (await prisma.orgPost.findUniqueOrThrow({ where: { id: parent } })).deletedAt,
    ).toBeInstanceOf(Date);
  });
});

describe("ORG-D2 preview dan D-053", () => {
  test("preview merangkum manager/pengajuan dan membatalkan seluruh tulisan", async () => {
    const baseRevision = await revision();
    const counts = [
      await prisma.orgPost.count(),
      await prisma.position.count(),
      await prisma.employmentHistory.count(),
      await prisma.auditLog.count(),
    ];
    const unplaced = await employee("preview-person");
    const response = await batch(
      [
        { op: "updatePost", postId: staffPost, reportsToId: bossPostB, sortOrder: 2 },
        {
          op: "createPosition",
          tempId: "tmp:preview-position",
          name: name("Pratinjau"),
          departmentId,
          level: "L2",
        },
        newPost("tmp:preview-post", { positionId: "tmp:preview-position" }),
        { op: "placeEmployee", employeeId: unplaced, postId: "tmp:preview-post" },
      ],
      { headers: hr.headers, preview: true, baseRevision },
    );
    expect(response.status).toBe(200);
    const preview = orgChartChangePreviewSchema.parse(await data(response));
    expect(preview.revision).toBe(baseRevision);
    expect(preview.managerChanges).toContainEqual({
      employee: { id: staff, fullName: name("staff") },
      fromManager: { id: bossA, fullName: name("boss-a") },
      toManager: { id: bossB, fullName: name("boss-b") },
    });
    expect(preview.pendingRequests).toContainEqual({
      employee: { id: staff, fullName: name("staff") },
      subjectType: "LEAVE",
      count: 1,
    });
    expect(preview.createdPositions).toEqual([{ name: name("Pratinjau"), unitName: name("Unit") }]);
    expect(preview.placements).toHaveLength(1);
    expect(preview.posts[0]?.details.join(" ")).toContain("Atasan:");
    expect(preview.posts[0]?.details.join(" ")).toContain("Urutan: 0 → 2");
    expect(preview.posts[1]?.postId).toBe("tmp:preview-post");
    expect([
      await prisma.orgPost.count(),
      await prisma.position.count(),
      await prisma.employmentHistory.count(),
      await prisma.auditLog.count(),
    ]).toEqual(counts);
    expect(await revision()).toBe(baseRevision);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: staff } })).managerId).toBe(
      bossA,
    );
    expect(
      (await prisma.employee.findUniqueOrThrow({ where: { id: unplaced } })).orgPostId,
    ).toBeNull();
  });

  test("apply menyinkron manager sekali dan mempertahankan penyetuju pengajuan berjalan", async () => {
    const response = await batch([{ op: "updatePost", postId: staffPost, reportsToId: bossPostB }]);
    expect(response.status).toBe(200);
    expect((await result(response)).managersUpdated).toBeGreaterThanOrEqual(1);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: staff } })).managerId).toBe(
      bossB,
    );
    expect(
      (await prisma.approvalRequest.findUniqueOrThrow({ where: { id: requestId } }))
        .managerEmployeeId,
    ).toBe(bossA);
  });

  test("/org-posts: HR berizin dapat create/update/archive/restore/delete/sync; masing-masing revisi +1", async () => {
    let baseRevision = await revision();
    const created = await call("POST", "/org-posts", hr.headers, { positionId });
    expect(created.status).toBe(201);
    const id = ((await data(created)) as { id: string }).id;
    expect(await revision()).toBe(++baseRevision);
    for (const [method, path, body] of [
      ["PATCH", `/org-posts/${id}`, { headcount: 2 }],
      ["POST", `/org-posts/${id}/archive`, undefined],
      ["POST", `/org-posts/${id}/restore`, undefined],
      ["DELETE", `/org-posts/${id}`, undefined],
      ["POST", "/org-posts/sync-managers", undefined],
    ] as const) {
      expect((await call(method, path, hr.headers, body)).status).toBe(200);
      expect(await revision()).toBe(++baseRevision);
    }
    expect(
      (await call("POST", "/org-posts", hr.headers, { positionId: corporatePositionId })).status,
    ).toBe(403);
    expect(
      (await call("PATCH", `/org-posts/${corporatePost}`, hr.headers, { headcount: 2 })).status,
    ).toBe(403);
    expect((await call("DELETE", `/org-posts/${corporatePost}`, hr.headers)).status).toBe(403);
    expect((await call("POST", `/org-posts/${corporatePost}/archive`, hr.headers)).status).toBe(
      403,
    );
    expect((await call("POST", "/org-posts", hrOther.headers, { positionId })).status).toBe(403);
    expect(await revision()).toBe(baseRevision);
  });
});
