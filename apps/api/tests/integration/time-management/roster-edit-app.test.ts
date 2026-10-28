import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { settingsToday } from "../../../src/modules/attendance/calendar.service.ts";
import { patternCodeOn } from "../../../src/modules/attendance/roster-engine.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";

// TM-D24 untuk app mobile: detail pengajuan (akses K3), data tambahan (crew, shift, pengaju, hari mundur),
// keputusan lewat /approvals/{id}/decision, dan notifikasi pengajuan baru ke pemutusnya (K6).
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const auth = createAuthFixture(RUN.toLowerCase());
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
});
const call = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: { ...headers, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const data = async <T>(res: Response) => ((await res.json()) as { data: T }).data;
const plusDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const code = (c: string) => `${c}${RUN.slice(0, 4)}`;

type Edit = {
  id: string;
  kind: string;
  status: string;
  employee: { id: string };
  preview: { date: string; from: string | null; to: string | null }[];
  approval: { id: string; canDecide: boolean } | null;
  crew: { action: string; fromCrewName: string | null; toCrewName: string | null } | null;
  shifts: { code: string; name: string; startMinute: number; endMinute: number }[];
  submittedBy: { name: string };
  backdated: { alphaDays: number; keptDays: number } | null;
};
const ids = {
  status: "",
  department: "",
  position: "",
  location: "",
  shifts: [] as string[],
  emp: {} as Record<"mgr" | "budi" | "cici" | "dodi" | "eko" | "hrPerson", string>,
};
let companyId = "";
let today = "";
let t1 = "";
let t2 = "";
let crew1Name = "";
const editIds: string[] = [];
let h: Record<"hr1" | "hr2" | "hrOther" | "mgr" | "sa" | "budi", Record<string, string>>;
let acc: Record<"hr1" | "hr2" | "mgr" | "sa", string>;

const assign = (templateId: string, employeeIds: string[], effectiveDate: string) =>
  call("POST", `/roster-custom-templates/${templateId}/assign`, h.hr1, {
    workLocationId: ids.location,
    employeeIds,
    effectiveDate,
  });
const pendingOf = async (employeeId: string) => {
  const row = await prisma.rosterEditRequest.findFirst({
    where: { employeeId, status: "PENDING" },
  });
  if (row) editIds.push(row.id);
  return row;
};
const notesOf = (accountId: string) =>
  prisma.notification.findMany({
    where: { recipientAccountId: accountId, type: "attendance.roster_edit_new" },
    orderBy: { createdAt: "asc" },
  });

beforeAll(async () => {
  today = await settingsToday();
  companyId = await acpCompanyId();
  ids.status = (await prisma.employmentStatus.create({ data: { name: `REA ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `REA ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `REA ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.location = (
    await prisma.workLocation.create({
      data: {
        name: `Site REA ${RUN}`,
        city: "Tanah Laut",
        latitude: -3.6,
        longitude: 115.1,
        radiusM: 300,
      },
    })
  ).id;
  for (const [c, start, end] of [
    ["D", 420, 1140],
    ["N", 1140, 420],
  ] as const) {
    ids.shifts.push(
      (
        await prisma.shift.create({
          data: {
            companyId,
            code: code(c),
            name: `Uji REA ${RUN} ${c}`,
            startMinute: start,
            endMinute: end,
          },
        })
      ).id,
    );
  }
  const mk = async (n: string, managerId: string | null) =>
    (
      await prisma.employee.create({
        data: {
          employeeNumber: `REA-${RUN}-${n}`,
          fullName: `${n} ${RUN}`,
          joinDate: new Date("2024-01-01T00:00:00Z"),
          companyId,
          employmentStatusId: ids.status,
          positionId: ids.position,
          managerId,
        },
      })
    ).id;
  ids.emp.mgr = await mk("Mgr", null);
  for (const n of ["budi", "cici", "dodi"] as const) ids.emp[n] = await mk(n, ids.emp.mgr);
  ids.emp.eko = await mk("eko", null);
  ids.emp.hrPerson = await mk("HrSatu", null);
  const hr1 = await auth.loginAs("HR_ADMIN", {
    companies: [companyId],
    employeeId: ids.emp.hrPerson,
  });
  const hr2 = await auth.loginAs("HR_ADMIN", { companies: [companyId] });
  const mgr = await auth.loginAs("MANAGER", { employeeId: ids.emp.mgr, companies: [companyId] });
  const sa = await auth.loginAs("SUPER_ADMIN");
  h = {
    hr1: hr1.headers,
    hr2: hr2.headers,
    hrOther: (await auth.loginAs("HR_ADMIN", { companies: [] })).headers,
    mgr: mgr.headers,
    sa: sa.headers,
    budi: (await auth.loginAs("EMPLOYEE", { employeeId: ids.emp.budi })).headers,
  };
  acc = { hr1: hr1.account.id, hr2: hr2.account.id, mgr: mgr.account.id, sa: sa.account.id };
  const mkTemplate = async (name: string, steps: string[]) =>
    (
      await data<{ id: string }>(
        await call("POST", "/roster-custom-templates", h.hr1, {
          companyId,
          name,
          steps,
          crewCount: 1,
          crewOffsetDays: 0,
        }),
      )
    ).id;
  t1 = await mkTemplate(`Siang ${RUN}`, [code("D"), code("D"), "OFF"]);
  t2 = await mkTemplate(`Malam ${RUN}`, [code("N"), code("N"), "OFF", "OFF"]);
  // Semua karyawan uji ber-crew sejak 5 hari lalu (tanpa crew → langsung berlaku, tanpa pengajuan).
  const first = await data<{ approvalCount: number }>(
    await assign(t1, [ids.emp.budi, ids.emp.cici, ids.emp.dodi, ids.emp.eko], plusDays(today, -5)),
  );
  expect(first.approvalCount).toBe(0);
  crew1Name =
    (
      await prisma.crewMember.findFirst({
        where: { employeeId: ids.emp.budi },
        include: { crew: true },
      })
    )?.crew.name ?? "";
});

afterAll(async () => {
  const employees = Object.values(ids.emp);
  const edits = await prisma.rosterEditRequest.findMany({
    where: { employeeId: { in: employees } },
    select: { id: true },
  });
  const all = edits.map((e) => e.id);
  // Notifikasi pengajuan baru juga sampai ke akun HR/SA asli di DB lokal → hapus berdasarkan id pengajuan.
  const notes = await prisma.notification.findMany({
    where: { type: "attendance.roster_edit_new" },
    select: { id: true, dedupeKey: true },
  });
  await prisma.notification.deleteMany({
    where: {
      id: { in: notes.filter((n) => all.some((id) => n.dedupeKey?.includes(id))).map((n) => n.id) },
    },
  });
  await prisma.approvalRequest.deleteMany({ where: { subjectId: { in: all } } });
  await prisma.rosterEditRequest.deleteMany({ where: { id: { in: all } } });
  const templates = await prisma.rosterTemplate.findMany({
    where: { name: { contains: RUN } },
    select: { patterns: { select: { id: true } } },
  });
  const patternIds = templates.flatMap((t) => t.patterns.map((p) => p.id));
  await prisma.attendanceDay.deleteMany({ where: { employeeId: { in: employees } } });
  await prisma.rosterDay.deleteMany({ where: { employeeId: { in: employees } } });
  await prisma.crewMember.deleteMany({ where: { employeeId: { in: employees } } });
  await prisma.crew.deleteMany({ where: { patternId: { in: patternIds } } });
  await prisma.rosterPattern.deleteMany({ where: { id: { in: patternIds } } });
  await prisma.rosterTemplate.deleteMany({ where: { name: { contains: RUN } } });
  await prisma.shift.deleteMany({ where: { id: { in: ids.shifts } } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: employees } } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await prisma.workLocation.delete({ where: { id: ids.location } });
  await disconnectPrisma();
});

describe("perubahan roster oleh HR dari app mobile (TM-D24)", () => {
  let budiEdit = "";

  test("kuas 1 karyawan: notifikasi ke atasan & HR lain (target ROSTER_EDIT), bukan ke pengaju", async () => {
    const date = plusDays(today, 3);
    const res = await call("PUT", "/roster/cells", h.hr1, {
      companyId,
      cells: [{ employeeId: ids.emp.budi, date, code: code("N") }],
    });
    expect(res.status).toBe(200);
    budiEdit = (await pendingOf(ids.emp.budi))?.id as string;
    expect(budiEdit).toBeTruthy();

    for (const who of [acc.mgr, acc.hr2]) {
      const notes = await notesOf(who);
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({
        targetType: "ROSTER_EDIT",
        targetId: budiEdit,
        link: "/absen/approval",
      });
      expect(notes[0]?.title).toContain(`budi ${RUN}`);
    }
    expect(await notesOf(acc.hr1)).toHaveLength(0);
    // Karyawan punya atasan → SA tidak diberi tahu.
    expect(await notesOf(acc.sa)).toHaveLength(0);
  });

  test("inbox atasan: data tambahan (shift dalam menit, pengaju, crew null untuk CELLS)", async () => {
    const inbox = await data<Edit[]>(await call("GET", "/roster-edits?scope=inbox", h.mgr));
    const edit = inbox.find((e) => e.id === budiEdit);
    expect(edit?.kind).toBe("CELLS");
    expect(edit?.approval?.canDecide).toBe(true);
    expect(edit?.crew).toBeNull();
    expect(edit?.backdated).toBeNull();
    expect(edit?.submittedBy).toEqual({ name: `HrSatu ${RUN}` });
    // Hanya kode yang muncul di preview (OFF tidak), lengkap dengan jam dalam menit.
    const used = [...new Set(edit?.preview.flatMap((d) => [d.from, d.to]))].filter(
      (c): c is string => c !== null && c !== "OFF",
    );
    expect(edit?.shifts.map((s) => s.code).sort()).toEqual(used.sort());
    expect(edit?.shifts.find((s) => s.code === code("N"))).toMatchObject({
      name: `Uji REA ${RUN} N`,
      startMinute: 1140,
      endMinute: 420,
    });
  });

  test("GET /roster-edits/{id}: matriks akses (K3)", async () => {
    const path = `/roster-edits/${budiEdit}`;
    for (const [who, status] of [
      ["mgr", 200],
      ["hr1", 200],
      ["hr2", 200],
      ["sa", 200],
      ["hrOther", 404],
      ["budi", 404],
    ] as const) {
      expect([who, (await call("GET", path, h[who])).status]).toEqual([who, status]);
    }
    expect((await app.request(`/api/v1${path}`)).status).toBe(401);
    expect((await call("GET", `/roster-edits/${crypto.randomUUID()}`, h.mgr)).status).toBe(404);
  });

  test("keputusan dari app: tolak tanpa catatan 400, pengaju 403, atasan + HR → APPLIED, ulang 409", async () => {
    const edit = await data<Edit>(await call("GET", `/roster-edits/${budiEdit}`, h.mgr));
    const decide = (who: keyof typeof h, body: unknown) =>
      call("POST", `/approvals/${edit.approval?.id}/decision`, h[who], body);
    expect((await decide("mgr", { decision: "REJECTED" })).status).toBe(400);
    expect((await decide("hr1", { decision: "APPROVED" })).status).toBe(403);
    expect((await decide("mgr", { decision: "APPROVED" })).status).toBe(200);
    expect((await decide("hr2", { decision: "APPROVED" })).status).toBe(200);
    const after = await data<Edit>(await call("GET", `/roster-edits/${budiEdit}`, h.hr1));
    expect(after.status).toBe("APPLIED");
    expect((await decide("hr2", { decision: "APPROVED" })).status).toBe(409);
  });

  test("isi template 2 karyawan: satu notifikasi per penerima (APPROVAL_QUEUE); crew asal → tujuan", async () => {
    const before = (await notesOf(acc.mgr)).length;
    const res = await assign(t2, [ids.emp.cici, ids.emp.dodi], plusDays(today, 4));
    expect((await data<{ approvalCount: number }>(res)).approvalCount).toBe(2);
    const cici = (await pendingOf(ids.emp.cici))?.id as string;
    await pendingOf(ids.emp.dodi);

    const notes = await notesOf(acc.mgr);
    expect(notes).toHaveLength(before + 1);
    expect(notes.at(-1)).toMatchObject({ targetType: "APPROVAL_QUEUE", targetId: today });
    expect(notes.at(-1)?.title).toContain("2 perubahan jadwal");

    const detail = await data<Edit>(await call("GET", `/roster-edits/${cici}`, h.hr2));
    expect(detail.kind).toBe("TEMPLATE");
    expect(detail.crew?.action).toBe("join");
    expect(detail.crew?.fromCrewName).toBe(crew1Name);
    expect(detail.crew?.toCrewName).toContain(`Malam ${RUN}`);
    expect(detail.backdated).toBeNull();
  });

  test("isi template mundur tanpa atasan: SA diberi tahu; detail menghitung hari Alpha (tanpa absen)", async () => {
    const from = plusDays(today, -2);
    const res = await assign(t2, [ids.emp.eko], from);
    expect(res.status).toBe(200);
    const eko = (await pendingOf(ids.emp.eko))?.id as string;
    expect(eko).toBeTruthy();
    expect((await notesOf(acc.sa)).map((n) => n.targetId)).toContain(eko);

    const detail = await data<Edit>(await call("GET", `/roster-edits/${eko}`, h.sa));
    const crew = await prisma.crew.findFirstOrThrow({
      where: { pattern: { template: { name: `Malam ${RUN}` } } },
      include: { pattern: true },
    });
    const cycle = crew.cycleStartDate.toISOString().slice(0, 10);
    const expected = [from, plusDays(from, 1)].filter(
      (d) => patternCodeOn(crew.pattern.steps, cycle, d) !== "OFF",
    ).length;
    expect(detail.backdated).toEqual({ alphaDays: expected, keptDays: 0 });

    expect(detail.approval?.canDecide).toBe(true);
    // Daftar tidak menghitung hari mundur (HR lain: pemutus langkah HR).
    const inbox = await data<Edit[]>(await call("GET", "/roster-edits?scope=inbox", h.hr2));
    const listed = inbox.find((e) => e.id === eko);
    expect(listed?.kind).toBe("TEMPLATE");
    expect(listed?.backdated).toBeNull();
  });
});
