import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { deleteAttendanceData } from "../../helpers/attendance.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { createTestCompany } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// Audit keamanan 3 & 4: setiap jalur HR harus menjaga pemisahan tugas, SA dikecualikan.
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const prisma = getPrisma();
const auth = createAuthFixture(RUN);
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
  storage: createFakeStorage().storage,
});
const ids = {
  company: "",
  status: "",
  department: "",
  position: "",
  shift: "",
  violation: "",
  location: "",
};
const employees = { hr: "", sa: "", other: "", mgr: "", outside: "" };
let h: Record<"hr" | "sa" | "employee" | "mgr", Record<string, string>>;
const number = (name: string) => `SEC-${RUN}-${name}`;
const D = (date: string) => new Date(`${date}T00:00:00Z`);
const PAST = "2026-10-06";
const FUTURE = "2098-06-10";
const call = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: { ...headers, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const data = async <T>(res: Response) => ((await res.json()) as { data: T }).data;

beforeAll(async () => {
  ids.company = await createTestCompany(`X${RUN}`, `Security ${RUN}`);
  ids.status = (await prisma.employmentStatus.create({ data: { name: `SEC ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `SEC ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `SEC ${RUN}`, departmentId: ids.department } })
  ).id;
  for (const name of ["mgr", "hr", "sa", "other", "outside"] as const) {
    employees[name] = (
      await prisma.employee.create({
        data: {
          companyId: ids.company,
          employeeNumber: number(name),
          fullName: `Security ${RUN} ${name}`,
          joinDate: D("2024-01-01"),
          employmentStatusId: ids.status,
          positionId: ids.position,
          managerId: name === "other" ? employees.mgr : null,
        },
      })
    ).id;
  }
  h = {
    hr: (
      await auth.loginAs("HR_ADMIN", {
        employeeId: employees.hr,
        companies: [ids.company],
        grants: [{ permission: "EMPLOYEE_DISCIPLINE_WRITE" }],
      })
    ).headers,
    sa: (await auth.loginAs("SUPER_ADMIN", { employeeId: employees.sa })).headers,
    employee: (await auth.loginAs("EMPLOYEE", { employeeId: employees.other })).headers,
    mgr: (await auth.loginAs("MANAGER", { employeeId: employees.mgr })).headers,
  };
  ids.location = (await prisma.workLocation.create({ data: { name: `SEC ${RUN}` } })).id;
  ids.shift = (
    await prisma.shift.create({
      data: {
        companyId: ids.company,
        code: `S${RUN}`,
        name: `SEC ${RUN}`,
        startMinute: 420,
        endMinute: 1020,
      },
    })
  ).id;
  ids.violation = (
    await prisma.violationType.create({ data: { code: `S${RUN}`, name: `SEC ${RUN}` } })
  ).id;
});

afterAll(async () => {
  const employeeIds = Object.values(employees);
  await prisma.warningLetter.deleteMany({ where: { employeeId: { in: employeeIds } } });
  await prisma.violationType.deleteMany({ where: { id: ids.violation } });
  await prisma.leaveLedger.deleteMany({ where: { employeeId: { in: employeeIds } } });
  await prisma.employeeLocationSetting.deleteMany({ where: { employeeId: { in: employeeIds } } });
  await prisma.approvalRequest.deleteMany({ where: { requesterEmployeeId: { in: employeeIds } } });
  await prisma.rosterEditRequest.deleteMany({ where: { employeeId: { in: employeeIds } } });
  await deleteAttendanceData(employeeIds);
  await prisma.rosterDay.deleteMany({ where: { employeeId: { in: employeeIds } } });
  await prisma.crewMember.deleteMany({ where: { employeeId: { in: employeeIds } } });
  await prisma.crew.deleteMany({ where: { companyId: ids.company } });
  await prisma.rosterPattern.deleteMany({ where: { companyId: ids.company } });
  await prisma.shift.deleteMany({ where: { id: ids.shift } });
  await auth.cleanup();
  await prisma.employee.updateMany({
    where: { id: { in: employeeIds } },
    data: { managerId: null },
  });
  await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
  await prisma.position.deleteMany({ where: { id: ids.position } });
  await prisma.department.deleteMany({ where: { id: ids.department } });
  await prisma.employmentStatus.deleteMany({ where: { id: ids.status } });
  await prisma.workLocation.deleteMany({ where: { id: ids.location } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
  await disconnectPrisma();
});

describe("audit 3: Data Absen Harian", () => {
  const count = () =>
    prisma.attendanceDay.count({ where: { employeeId: { in: Object.values(employees) } } });
  const range = `from=${PAST}&to=${PAST}`;
  test("EMPLOYEE default inbox / all / employeeId tidak membuat attendance-day atau ALPHA", async () => {
    await prisma.rosterDay.createMany({
      data: [employees.other, employees.outside].map((employeeId) => ({
        employeeId,
        workDate: D(PAST),
        shiftId: ids.shift,
        source: "MANUAL",
      })),
    });
    for (const query of [range, `${range}&scope=all`, `${range}&employeeId=${employees.other}`]) {
      const before = await count();
      const res = await call("GET", `/attendance/days?${query}`, h.employee);
      expect(res.status).toBe(403);
      expect(await count()).toBe(before);
    }
  });
  test("manager: target di luar tim ditolak tanpa marking; daftar umum tidak marking", async () => {
    await prisma.attendanceDay.deleteMany({
      where: { employeeId: { in: Object.values(employees) } },
    });
    expect(
      (
        await call(
          "GET",
          `/attendance/days?scope=all&${range}&employeeId=${employees.outside}`,
          h.mgr,
        )
      ).status,
    ).toBe(403);
    expect((await call("GET", `/attendance/days?scope=all&${range}`, h.mgr)).status).toBe(200);
    expect(await count()).toBe(0);
  });
  test("manager / HR: target dalam scope tetap melihat Alpha, karyawan lain tidak ditandai", async () => {
    for (const who of [h.mgr, h.hr]) {
      await prisma.attendanceDay.deleteMany({
        where: { employeeId: { in: Object.values(employees) } },
      });
      const res = await call(
        "GET",
        `/attendance/days?scope=all&${range}&employeeId=${employees.other}`,
        who,
      );
      expect(res.status).toBe(200);
      const rows = await data<{ employee: { id: string }; status: string }[]>(res);
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            employee: expect.objectContaining({ id: employees.other }),
            status: "ALPHA",
          }),
        ]),
      );
      expect(await count()).toBe(1);
    }
  });
  test("HR perusahaan lain dan companyId di luar scope tidak memicu marking", async () => {
    const outsider = await auth.loginAs("HR_ADMIN", { companies: [] });
    await prisma.attendanceDay.deleteMany({
      where: { employeeId: { in: Object.values(employees) } },
    });
    for (const scope of ["all", "inbox"]) {
      expect(
        (
          await call(
            "GET",
            `/attendance/days?scope=${scope}&${range}&employeeId=${employees.other}`,
            outsider.headers,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await call(
            "GET",
            `/attendance/days?scope=${scope}&${range}&companyId=${crypto.randomUUID()}&employeeId=${employees.other}`,
            h.hr,
          )
        ).status,
      ).toBe(403);
    }
    expect(await count()).toBe(0);
  });
});

describe("audit 4: HR tidak mengubah data sendiri lewat jalur HR", () => {
  for (const scenario of ["HR self", "SA self", "HR other"] as const) {
    const allowed = scenario !== "HR self";
    const target = () =>
      scenario === "SA self"
        ? employees.sa
        : scenario === "HR self"
          ? employees.hr
          : employees.other;
    const headers = () => (scenario === "SA self" ? h.sa : h.hr);
    test(`${scenario}: revoke SP`, async () => {
      const letter = await prisma.warningLetter.create({
        data: {
          employeeId: target(),
          companyId: ids.company,
          violationTypeId: ids.violation,
          number: `SEC-${RUN}-${scenario}`,
          level: "SP1",
          description: "Surat uji keamanan",
          status: "ISSUED",
          issuedAt: D("2026-11-01"),
          effectiveUntil: D("2098-01-01"),
          createdBy: (
            await prisma.account.findFirstOrThrow({ where: { employeeId: employees.sa } })
          ).id,
        },
      });
      const res = await call("POST", `/warning-letters/${letter.id}/revoke`, headers(), {
        reason: "Pencabutan untuk pengujian keamanan",
      });
      expect(res.status).toBe(allowed ? 200 : 403);
      const after = await prisma.warningLetter.findUniqueOrThrow({ where: { id: letter.id } });
      expect(after.status).toBe(allowed ? "REVOKED" : "ISSUED");
      if (!allowed) expect(after).toEqual(letter);
    });
    test(`${scenario}: penyesuaian saldo cuti`, async () => {
      const before = await prisma.leaveLedger.findMany({ where: { employeeId: target() } });
      const res = await call("POST", "/leave-balances/adjust", headers(), {
        employeeId: target(),
        year: 2098,
        days: 2,
        note: "Uji keamanan",
      });
      expect(res.status).toBe(allowed ? 200 : 403);
      const after = await prisma.leaveLedger.findMany({ where: { employeeId: target() } });
      if (allowed) expect(after.length).toBe(before.length + 1);
      else expect(after).toEqual(before);
    });
    test(`${scenario}: geofence (batch ditolak utuh)`, async () => {
      const before = await prisma.employeeLocationSetting.findMany({
        where: { employeeId: { in: [target(), employees.outside] } },
      });
      const res = await call("PUT", "/attendance-locations", headers(), {
        employeeIds: [employees.outside, target()],
        mode: "ANYWHERE",
      });
      expect(res.status).toBe(allowed ? 200 : 403);
      const after = await prisma.employeeLocationSetting.findMany({
        where: { employeeId: { in: [target(), employees.outside] } },
      });
      if (allowed) expect(after.find((r) => r.employeeId === target())?.anywhere).toBe(true);
      else expect(after).toEqual(before);
    });
    test(`${scenario}: data kepegawaian`, async () => {
      const before = await prisma.employee.findUniqueOrThrow({ where: { id: target() } });
      const res = await call("PATCH", `/employees/${target()}`, headers(), {
        workLocationId: ids.location,
      });
      expect(res.status).toBe(allowed ? 200 : 403);
      const after = await prisma.employee.findUniqueOrThrow({ where: { id: target() } });
      if (allowed) expect(after.workLocationId).toBe(ids.location);
      else expect(after).toEqual(before);
    });
    test(`${scenario}: roster tanpa crew (kuas dan import)`, async () => {
      for (const isImport of [false, true]) {
        await prisma.rosterDay.deleteMany({ where: { employeeId: target(), workDate: D(FUTURE) } });
        const body = isImport
          ? {
              companyId: ids.company,
              rows: [
                {
                  employeeNumber: number(
                    scenario === "SA self" ? "sa" : scenario === "HR self" ? "hr" : "other",
                  ),
                  date: FUTURE,
                  code: "OFF",
                },
              ],
            }
          : {
              companyId: ids.company,
              cells: [{ employeeId: target(), date: FUTURE, code: "OFF" }],
            };
        if (isImport) {
          const preview = await data<{ issues: { index: number; message: string }[] }>(
            await call("POST", "/roster/import/preview", headers(), body),
          );
          expect(preview.issues.length).toBe(allowed ? 0 : 1);
          if (!allowed) expect(preview.issues[0]?.index).toBe(0);
        }
        const res = await call(
          isImport ? "POST" : "PUT",
          isImport ? "/roster/import/commit" : "/roster/cells",
          headers(),
          body,
        );
        expect(res.status).toBe(allowed ? 200 : isImport ? 422 : 403);
        expect(
          await prisma.rosterDay.count({ where: { employeeId: target(), workDate: D(FUTURE) } }),
        ).toBe(allowed ? 1 : 0);
      }
    });
  }

  test("import saldo: HR self issue di preview/commit, baris lain tetap tersimpan; SA self boleh", async () => {
    const body = {
      companyId: ids.company,
      year: 2099,
      rows: [
        { employeeNumber: number("other"), balance: 7 },
        { employeeNumber: number("hr"), balance: 50 },
      ],
    };
    for (const mode of ["preview", "commit"]) {
      const res = await call("POST", `/leave-balances/import/${mode}`, h.hr, body);
      expect(res.status).toBe(200);
      const result = await data<{
        saved: number;
        changed: number;
        issues: { index: number; employeeNumber: string; message: string }[];
      }>(res);
      expect(result.issues).toEqual([
        expect.objectContaining({
          index: 1,
          employeeNumber: number("hr"),
          message: expect.stringContaining("sendiri"),
        }),
      ]);
      expect(result.changed).toBe(1);
      expect(result.saved).toBe(mode === "commit" ? 1 : 0);
    }
    expect(
      await prisma.leaveLedger.count({ where: { employeeId: employees.hr, year: 2099 } }),
    ).toBe(0);
    expect(
      (
        await prisma.leaveLedger.aggregate({
          where: { employeeId: employees.other, year: 2099 },
          _sum: { days: true },
        })
      )._sum.days,
    ).toBe(7);
    expect(
      (
        await call("POST", "/leave-balances/import/commit", h.sa, {
          ...body,
          rows: [{ employeeNumber: number("sa"), balance: 9 }],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await prisma.leaveLedger.aggregate({
          where: { employeeId: employees.sa, year: 2099 },
          _sum: { days: true },
        })
      )._sum.days,
    ).toBe(9);
  });

  test("import saldo: kesalahan umum tetap membatalkan batch, import hanya diri sendiri tidak menulis", async () => {
    const ledger = () =>
      prisma.leaveLedger.findMany({
        where: { employeeId: { in: Object.values(employees) }, year: 2100 },
      });
    for (const invalid of [number("missing"), number("other")]) {
      const input = {
        companyId: ids.company,
        year: 2100,
        rows: [
          { employeeNumber: number("other"), balance: 10 },
          { employeeNumber: number("hr"), balance: 50 },
          { employeeNumber: invalid, balance: 11 },
        ],
      };
      expect((await call("POST", "/leave-balances/import/commit", h.hr, input)).status).toBe(422);
      expect(await ledger()).toEqual([]);
    }
    const res = await call("POST", "/leave-balances/import/commit", h.hr, {
      companyId: ids.company,
      year: 2100,
      rows: [{ employeeNumber: number("hr"), balance: 50 }],
    });
    expect(res.status).toBe(200);
    expect(await data<{ saved: number; changed: number; issues: unknown[] }>(res)).toMatchObject({
      saved: 0,
      changed: 0,
      issues: [expect.objectContaining({ index: 0 })],
    });
    expect(await ledger()).toEqual([]);
  });

  test("roster self ber-crew tetap diajukan lewat ROSTER_EDIT, tidak langsung berlaku", async () => {
    const pattern = await prisma.rosterPattern.create({
      data: { companyId: ids.company, name: `SEC ${RUN}`, steps: ["OFF"] },
    });
    const crew = await prisma.crew.create({
      data: {
        companyId: ids.company,
        workLocationId: ids.location,
        name: `SEC ${RUN}`,
        patternId: pattern.id,
        cycleStartDate: D(FUTURE),
      },
    });
    await prisma.crewMember.create({
      data: { crewId: crew.id, employeeId: employees.hr, startDate: D(FUTURE) },
    });
    await prisma.crewMember.create({
      data: { crewId: crew.id, employeeId: employees.other, startDate: D(FUTURE) },
    });
    // HR self di luar masa crew: tolak sebelum splitter membuat ajuan untuk baris orang lain.
    for (const isImport of [false, true]) {
      const mixed = isImport
        ? {
            companyId: ids.company,
            rows: [
              { employeeNumber: number("other"), date: FUTURE, code: "OFF" },
              { employeeNumber: number("hr"), date: "2098-06-09", code: "OFF" },
            ],
          }
        : {
            companyId: ids.company,
            cells: [
              { employeeId: employees.other, date: FUTURE, code: "OFF" },
              { employeeId: employees.hr, date: "2098-06-09", code: "OFF" },
            ],
          };
      if (isImport) {
        const preview = await data<{ issues: { index: number }[] }>(
          await call("POST", "/roster/import/preview", h.hr, mixed),
        );
        expect(preview.issues).toEqual([expect.objectContaining({ index: 1 })]);
      }
      const before = await prisma.rosterDay.findMany({
        where: { employeeId: { in: Object.values(employees) } },
      });
      const res = await call(
        isImport ? "POST" : "PUT",
        isImport ? "/roster/import/commit" : "/roster/cells",
        h.hr,
        mixed,
      );
      expect(res.status).toBe(isImport ? 422 : 403);
      expect(
        await prisma.rosterDay.findMany({
          where: { employeeId: { in: Object.values(employees) } },
        }),
      ).toEqual(before);
      expect(await prisma.rosterEditRequest.count({ where: { companyId: ids.company } })).toBe(0);
      expect(
        await prisma.approvalRequest.count({
          where: {
            requesterEmployeeId: { in: Object.values(employees) },
            subjectType: "ROSTER_EDIT",
          },
        }),
      ).toBe(0);
    }
    for (const isImport of [false, true]) {
      const date = isImport ? "2098-06-12" : "2098-06-11";
      const body = isImport
        ? { companyId: ids.company, rows: [{ employeeNumber: number("hr"), date, code: "OFF" }] }
        : { companyId: ids.company, cells: [{ employeeId: employees.hr, date, code: "OFF" }] };
      const res = await call(
        isImport ? "POST" : "PUT",
        isImport ? "/roster/import/commit" : "/roster/cells",
        h.hr,
        body,
      );
      expect(res.status).toBe(200);
      expect(await data<{ submitted: number }>(res)).toMatchObject({ submitted: 1 });
      expect(
        await prisma.rosterDay.count({ where: { employeeId: employees.hr, workDate: D(date) } }),
      ).toBe(0);
      const edit = await prisma.rosterEditRequest.findFirstOrThrow({
        where: { employeeId: employees.hr, status: "PENDING" },
      });
      const approval = await prisma.approvalRequest.findFirstOrThrow({
        where: { subjectId: edit.id },
      });
      expect(
        (await call("POST", `/approvals/${approval.id}/decision`, h.hr, { decision: "APPROVED" }))
          .status,
      ).toBe(403);
      // Percobaan berikutnya memakai pengajuan baru agar tidak terhalang aturan satu pengajuan menunggu.
      await prisma.approvalRequest.delete({ where: { id: approval.id } });
      await prisma.rosterEditRequest.delete({ where: { id: edit.id } });
    }
  });
});
