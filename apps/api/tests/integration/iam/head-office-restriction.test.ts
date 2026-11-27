import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { strFromU8, unzipSync } from "fflate";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { listActionable } from "../../../src/modules/approval/index.ts";
import { canClosePeriod } from "../../../src/modules/attendance/period.service.ts";
import { remindContracts } from "../../../src/modules/employee/index.ts";
import { loadActor } from "../../../src/modules/iam/index.ts";
import { deleteAttendanceData } from "../../helpers/attendance.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { createTestCompany } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

const RUN = crypto.randomUUID().slice(0, 8).toUpperCase();
const prisma = getPrisma();
const auth = createAuthFixture(`ho-${RUN.toLowerCase()}`);
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
  storage: createFakeStorage().storage,
});
let companyId = "";
const ids = {
  ho: "",
  site: "",
  empty: "",
  hoLocation: "",
  siteLocation: "",
  position: "",
  department: "",
  status: "",
  restricted: "",
  open: "",
  contractStatus: "",
  assetCategory: "",
  violationType: "",
  leaveType: "",
};
const children = {
  days: new Map<string, string>(),
  assets: new Map<string, string>(),
  letters: new Map<string, string>(),
  accounts: new Map<string, string>(),
  leaves: new Map<string, string>(),
};
const performanceIds: string[] = [];
let h: Record<"restricted" | "open" | "sa", Record<string, string>>;
const call = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: { ...headers, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
beforeAll(async () => {
  companyId = await createTestCompany(`HO${RUN.slice(0, 5)}`, `HO ${RUN}`);
  ids.status = (await prisma.employmentStatus.create({ data: { name: `HO ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `HO ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `HO ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.hoLocation = (
    await prisma.workLocation.create({ data: { name: `HO ${RUN}`, isHeadOffice: true } })
  ).id;
  ids.siteLocation = (await prisma.workLocation.create({ data: { name: `Site ${RUN}` } })).id;
  for (const kind of ["ho", "site", "empty"] as const) {
    ids[kind] = (
      await prisma.employee.create({
        data: {
          fullName: `${kind} ${RUN}`,
          employeeNumber: `${kind.toUpperCase()}-${RUN}`,
          companyId,
          employmentStatusId: ids.status,
          positionId: ids.position,
          joinDate: new Date("2024-01-01"),
          workLocationId:
            kind === "ho" ? ids.hoLocation : kind === "site" ? ids.siteLocation : null,
        },
      })
    ).id;
  }
  const grants = (
    [
      "PAYROLL_PERIOD_PREPARE",
      "EMPLOYEE_PERSONAL_READ",
      "EMPLOYEE_PERSONAL_WRITE",
      "EMPLOYEE_BANK_READ",
      "EMPLOYEE_BANK_WRITE",
      "EMPLOYEE_DOCUMENTS_READ",
      "EMPLOYEE_DOCUMENTS_WRITE",
      "CONTRACT_MANAGE",
      "ASSET_MANAGE",
      "EMPLOYEE_DISCIPLINE_READ",
      "EMPLOYEE_DISCIPLINE_WRITE",
      "EMPLOYEE_ONBOARDING_REVIEW",
      "EMPLOYEE_CHANGES_REVIEW",
    ] as const
  ).map((permission) => ({ permission }));
  const restricted = await auth.loginAs("HR_ADMIN", { companies: [companyId], grants });
  ids.restricted = restricted.account.id;
  await prisma.account.update({
    where: { id: ids.restricted },
    data: { restrictHeadOffice: true },
  });
  const open = await auth.loginAs("HR_ADMIN", { companies: [companyId], grants });
  ids.open = open.account.id;
  h = {
    restricted: restricted.headers,
    open: open.headers,
    sa: (await auth.loginAs("SUPER_ADMIN")).headers,
  };
  ids.contractStatus = (
    await prisma.employmentStatus.findUniqueOrThrow({ where: { category: "PKWT" } })
  ).id;
  ids.assetCategory = (
    await prisma.assetCategory.create({ data: { code: `H${RUN.slice(0, 4)}`, name: `HO ${RUN}` } })
  ).id;
  ids.violationType = (
    await prisma.violationType.create({ data: { code: `H${RUN.slice(0, 4)}`, name: `HO ${RUN}` } })
  ).id;
  ids.leaveType = (
    await prisma.leaveType.create({
      data: { code: `H${RUN}`, name: `HO ${RUN}`, category: "PERMIT" },
    })
  ).id;
  for (const kind of ["ho", "site", "empty"] as const) {
    const employeeId = ids[kind];
    children.accounts.set(employeeId, (await auth.loginAs("EMPLOYEE", { employeeId })).account.id);
    const day = await prisma.attendanceDay.create({
      data: {
        employeeId,
        companyId,
        workDate: new Date("2025-01-01"),
        status: "PENDING",
        labels: [],
        punches: {
          create: {
            kind: "IN",
            at: new Date("2025-01-01T00:00:00Z"),
            insideGeofence: true,
            labels: [],
          },
        },
      },
    });
    children.days.set(employeeId, day.id);
    await prisma.overtimeRequest.create({
      data: {
        dayId: day.id,
        employeeId,
        companyId,
        workDate: day.workDate,
        dayType: "WORKDAY",
        formula: "SIX_DAY",
        rawMin: 60,
        debtMin: 0,
        regularMin: 0,
        proposedMin: 60,
        equivalentHours: 1.5,
        flags: [],
      },
    });
    await prisma.approvalRequest.create({
      data: {
        subjectType: "ATTENDANCE_DAY",
        subjectId: day.id,
        requesterEmployeeId: employeeId,
        companyId,
        mode: "PARALLEL",
        steps: { create: { kind: "HR" } },
      },
    });
    children.leaves.set(
      employeeId,
      (
        await prisma.leaveRequest.create({
          data: {
            employeeId,
            companyId,
            leaveTypeId: ids.leaveType,
            category: "PERMIT",
            startDate: day.workDate,
            endDate: day.workDate,
            workDates: [day.workDate],
            days: 1,
            reason: "Uji IAM-D3",
            createdByEmployeeId: employeeId,
          },
        })
      ).id,
    );
    children.assets.set(
      employeeId,
      (
        await prisma.asset.create({
          data: {
            name: `${kind} ${RUN}`,
            code: `A-${kind}-${RUN}`,
            companyId,
            categoryId: ids.assetCategory,
            status: "ASSIGNED",
            assignments: {
              create: {
                employeeId,
                assignedAt: day.workDate,
                conditionOut: "GOOD",
                assignedBy: ids.open,
              },
            },
          },
        })
      ).id,
    );
    children.letters.set(
      employeeId,
      (
        await prisma.warningLetter.create({
          data: {
            employeeId,
            companyId,
            violationTypeId: ids.violationType,
            level: "SP1",
            description: "Uji IAM-D3",
            status: "ISSUED",
            number: `SP-${kind}-${RUN}`,
            issuedBy: ids.open,
            suggestedLevel: "SP1",
            issuedAt: day.workDate,
            effectiveUntil: new Date("2027-12-31"),
            createdBy: ids.open,
          },
        })
      ).id,
    );
  }
});
afterAll(async () => {
  const allEmployees = [ids.ho, ids.site, ids.empty, ...performanceIds];
  await deleteAttendanceData(allEmployees);
  await prisma.leaveRequest.deleteMany({ where: { employeeId: { in: allEmployees } } });
  await prisma.leaveLedger.deleteMany({ where: { employeeId: { in: allEmployees } } });
  await prisma.assetAssignment.deleteMany({ where: { employeeId: { in: allEmployees } } });
  await prisma.asset.deleteMany({ where: { id: { in: [...children.assets.values()] } } });
  await prisma.warningLetter.deleteMany({ where: { employeeId: { in: allEmployees } } });
  await prisma.importJob.deleteMany({
    where: { actorAccountId: { in: [ids.restricted, ids.open] } },
  });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: allEmployees } } });
  await prisma.workLocation.deleteMany({
    where: { id: { in: [ids.hoLocation, ids.siteLocation] } },
  });
  if (ids.position) await prisma.position.delete({ where: { id: ids.position } });
  if (ids.department) await prisma.department.delete({ where: { id: ids.department } });
  if (ids.status) await prisma.employmentStatus.delete({ where: { id: ids.status } });

  if (ids.assetCategory) await prisma.assetCategory.delete({ where: { id: ids.assetCategory } });
  if (ids.violationType) await prisma.violationType.delete({ where: { id: ids.violationType } });
  if (ids.leaveType) await prisma.leaveType.delete({ where: { id: ids.leaveType } });
  if (companyId) await prisma.company.delete({ where: { id: companyId } });
  await disconnectPrisma();
});
describe("IAM-D3: Tanpa akses karyawan Head Office", () => {
  test("daftar membuang HO, mempertahankan Site & lokasi kosong; akun bebas melihat semua", async () => {
    for (const who of ["restricted", "open"] as const) {
      const res = await call("GET", `/employees?q=${RUN}`, h[who]);
      expect(res.status).toBe(200);
      const rows = (await res.json()) as { data: { id: string }[]; meta: { total: number } };
      expect(rows.data.map((e) => e.id).sort()).toEqual(
        (who === "restricted" ? [ids.site, ids.empty] : [ids.site, ids.empty, ids.ho]).sort(),
      );
      expect(rows.meta.total).toBe(who === "restricted" ? 2 : 3);
    }
  });
  test("input manual karyawan HO ditolak sebelum aturan tanggal", async () => {
    expect(
      (
        await call("POST", "/attendance/manual", h.restricted, {
          employeeId: ids.ho,
          workDate: "2025-01-01",
          kind: "IN",
          time: "08:00",
          reason: "Uji batas Head Office",
        })
      ).status,
    ).toBe(404);
  });
  test("tutup periode dibatasi meski punya grant", async () => {
    expect(
      (
        await call("POST", "/attendance/periods/close", h.restricted, {
          companyId,
          month: "2025-01",
        })
      ).status,
    ).toBe(403);
  });
});

const responseData = async <T>(res: Response): Promise<T> => {
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: T }).data;
};
async function xlsxText(res: Response) {
  const data = await responseData<{ contentBase64: string }>(res);
  return Object.values(unzipSync(Buffer.from(data.contentBase64, "base64")))
    .map((v) => strFromU8(v))
    .join("\n");
}

describe("IAM-D3: matriks API", () => {
  test("detail & seluruh tab HO 404; akun bebas tetap membaca", async () => {
    for (const tail of ["", "/contracts", "/documents", "/field-changes", "/homebases"]) {
      expect((await call("GET", `/employees/${ids.ho}${tail}`, h.restricted)).status).toBe(404);
      expect((await call("GET", `/employees/${ids.ho}${tail}`, h.open)).status).toBe(200);
    }
    expect(
      (
        await call("PATCH", `/employees/${ids.ho}`, h.restricted, {
          fullName: "Tidak boleh berubah",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call("POST", `/employees/${ids.ho}/status-change`, h.restricted, {
          employmentStatusId: ids.contractStatus,
          effectiveDate: "2025-01-01",
        })
      ).status,
    ).toBe(404);
    for (const profile of [
      { personal: { birthPlace: "Rahasia" } },
      { bank: { bankName: "Bank Uji", accountNumber: "1234567890" } },
    ]) {
      expect(
        (await call("PATCH", `/employees/${ids.ho}/profile`, h.restricted, profile)).status,
      ).toBe(404);
    }
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: ids.ho } })).fullName).toBe(
      `ho ${RUN}`,
    );
  });
  test("pindah Site ke HO dan membuat karyawan HO ditolak 422", async () => {
    const res = await call("PATCH", `/employees/${ids.site}`, h.restricted, {
      workLocationId: ids.hoLocation,
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      error: { message: "Lokasi kerja ini di luar cakupan Anda." },
    });
    const created = await call("POST", "/employees", h.restricted, {
      fullName: `Baru ${RUN}`,
      employeeNumber: `NEW-${RUN}`,
      companyId,
      positionId: ids.position,
      employmentStatusId: ids.status,
      joinDate: "2024-01-01",
      workLocationId: ids.hoLocation,
    });
    expect(created.status).toBe(422);
  });
  test("export karyawan & absensi tidak berisi HO, termasuk pilihan id langsung", async () => {
    for (const who of ["restricted", "open"] as const) {
      const employeeXml = await xlsxText(
        await call("POST", "/employees/export", h[who], { filter: { q: RUN }, sections: [] }),
      );
      expect(employeeXml.includes(`HO-${RUN}`)).toBe(who === "open");
      expect(employeeXml).toContain(`SITE-${RUN}`);
      const attendanceXml = await xlsxText(
        await call("POST", "/attendance/days/export", h[who], {
          kind: "FLASH",
          companyId,
          from: "2025-01-01",
          to: "2025-01-01",
        }),
      );
      expect(attendanceXml.includes(`ho ${RUN}`)).toBe(who === "open");
      expect(attendanceXml).toContain(`site ${RUN}`);
    }
    const only = await responseData<{ rows: number }>(
      await call("POST", "/employees/export", h.restricted, {
        employeeIds: [ids.ho, ids.site],
        sections: [],
      }),
    );
    expect(only.rows).toBe(1);
    const hidden = await call("POST", "/attendance/days/export", h.restricted, {
      kind: "DETAIL",
      companyId,
      from: "2025-01-01",
      to: "2025-01-01",
      employeeIds: [ids.ho],
    });
    expect(hidden.status).toBe(422);
  });
  test("absensi people, days, detail; cuti, saldo, lembur & inbox approval", async () => {
    for (const who of ["restricted", "open"] as const) {
      const expected = (
        who === "restricted" ? [ids.site, ids.empty] : [ids.site, ids.empty, ids.ho]
      ).sort();
      const people = await responseData<{ id: string }[]>(
        await call("GET", `/attendance/people?companyId=${companyId}&q=${RUN}`, h[who]),
      );
      expect(people.map((e) => e.id).sort()).toEqual(expected);
      for (const endpoint of ["attendance/days", "overtime", "leave-requests"]) {
        const rows = await responseData<{ employee: { id: string } }[]>(
          await call(
            "GET",
            `/${endpoint}?scope=all&companyId=${companyId}&from=2025-01-01&to=2025-01-01`,
            h[who],
          ),
        );
        expect(rows.map((e) => e.employee.id).sort()).toEqual(expected);
      }
      const actor = await loadActor(
        (
          await prisma.account.findUniqueOrThrow({
            where: { id: who === "restricted" ? ids.restricted : ids.open },
          })
        ).authUserId,
      );
      if (!actor) throw new Error("Akun uji tidak dimuat");
      const approvals = await listActionable(actor, "ATTENDANCE_DAY", { includeOverride: true });
      expect(
        approvals
          .map((a) => a.subjectId)
          .filter((id) => [...children.days.values()].includes(id))
          .sort(),
      ).toEqual(expected.map((id) => children.days.get(id) ?? "").sort());
    }
    expect(
      (await call("GET", `/attendance/days/${children.days.get(ids.ho)}`, h.restricted)).status,
    ).toBe(404);
    expect(
      (await call("GET", `/leave-requests/${children.leaves.get(ids.ho)}`, h.restricted)).status,
    ).toBe(404);
    expect(
      (await call("GET", `/leave-balances/employees/${ids.ho}?year=2025`, h.restricted)).status,
    ).toBe(404);
  });
  test("laporan, dashboard, analitik & picker atasan hanya menghitung yang terlihat", async () => {
    for (const who of ["restricted", "open"] as const) {
      const expected = who === "restricted" ? 2 : 3;
      const pick = await responseData<{ id: string }[]>(
        await call("GET", "/employees/manager-options", h[who]),
      );
      expect(pick.some((e) => e.id === ids.ho)).toBe(who === "open");
      const analytics = await responseData<{ headcount: { end: number } }>(
        await call("GET", `/dashboard/analytics?month=2025-01&companyId=${companyId}`, h[who]),
      );
      expect(analytics.headcount.end).toBe(expected);
      const report = await responseData<{ employees: number }>(
        await call("GET", `/reports/completeness?companyId=${companyId}`, h[who]),
      );
      expect(JSON.stringify(report).includes(ids.ho)).toBe(who === "open");
      const dashboard = await responseData<{ active: number }>(
        await call("GET", "/dashboard", h[who]),
      );
      expect(JSON.stringify(dashboard)).toContain(String(expected));
    }
  });
  test("aset pemegang HO, SP & akun tertaut disembunyikan", async () => {
    for (const who of ["restricted", "open"] as const) {
      for (const [endpoint, hiddenId] of [
        ["assets", children.assets.get(ids.ho)],
        ["warning-letters", children.letters.get(ids.ho)],
        ["accounts", children.accounts.get(ids.ho)],
      ] as const) {
        const rows = await responseData<{ id: string }[]>(
          await call("GET", `/${endpoint}?companyId=${companyId}&pageSize=100`, h[who]),
        );
        expect(rows.some((r) => r.id === hiddenId)).toBe(who === "open");
        expect((await call("GET", `/${endpoint}/${hiddenId}`, h[who])).status).toBe(
          who === "open" ? 200 : 404,
        );
      }
    }
  });
  test("import update HO ditolak per baris; Site tetap diproses; tujuan HO ditolak", async () => {
    const input = {
      fileName: "iam-d3.xlsx",
      fileSha256: "a".repeat(64),
      mode: "UPSERT",
      companyId,
      rows: [
        { sourceRow: 2, raw: { employeeNumber: `HO-${RUN}`, fullName: "Tidak berubah" } },
        { sourceRow: 3, raw: { employeeNumber: `SITE-${RUN}`, fullName: `Site Baru ${RUN}` } },
      ],
    };
    const preview = await responseData<{
      previewHash: string;
      rows: { action: string; issues: { code: string }[] }[];
    }>(await call("POST", "/employee-imports/preview", h.restricted, input));
    expect(preview.rows[0]?.action).toBe("ERROR");
    expect(preview.rows[0]?.issues.some((i) => i.code === "EXISTING_OUT_OF_SCOPE")).toBe(true);
    expect(preview.rows[1]?.action).toBe("UPDATE");
    const commit = await call("POST", "/employee-imports", h.restricted, {
      ...input,
      previewHash: preview.previewHash,
    });
    expect(commit.status).toBe(201);
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: ids.ho } })).fullName).toBe(
      `ho ${RUN}`,
    );
    expect((await prisma.employee.findUniqueOrThrow({ where: { id: ids.site } })).fullName).toBe(
      `Site Baru ${RUN}`,
    );
    const location = await responseData<{ rows: { action: string; issues: { code: string }[] }[] }>(
      await call("POST", "/employee-imports/preview", h.restricted, {
        ...input,
        rows: [
          { sourceRow: 2, raw: { employeeNumber: `SITE-${RUN}`, workLocationName: `HO ${RUN}` } },
        ],
      }),
    );
    expect(location.rows[0]?.action).toBe("ERROR");
    expect(location.rows[0]?.issues.some((i) => i.code === "LOCATION_OUT_OF_SCOPE")).toBe(true);
  });
  test("lokasi saat ini dimuat ulang setiap request setelah SA memindahkan Site ke HO lalu kembali", async () => {
    expect(
      (await call("PATCH", `/employees/${ids.site}`, h.sa, { workLocationId: ids.hoLocation }))
        .status,
    ).toBe(200);
    expect((await call("GET", `/employees/${ids.site}`, h.restricted)).status).toBe(404);
    expect((await call("GET", `/employees/${ids.site}`, h.open)).status).toBe(200);
    expect(
      (await call("PATCH", `/employees/${ids.site}`, h.sa, { workLocationId: ids.siteLocation }))
        .status,
    ).toBe(200);
    expect((await call("GET", `/employees/${ids.site}`, h.restricted)).status).toBe(200);
  });
  test("pengingat kontrak HO mengecualikan HR dibatasi, kontrak Site diterima kedua HR", async () => {
    for (const id of [ids.ho, ids.site])
      await prisma.employee.update({
        where: { id },
        data: {
          employmentStatusId: ids.contractStatus,
          contractEndDate: new Date("2030-01-20"),
          contractStage: 1,
        },
      });
    await remindContracts(new Date("2030-01-01T01:00:00Z"));
    const notifications = await prisma.notification.findMany({
      where: { recipientAccountId: { in: [ids.restricted, ids.open] }, type: "contract.expiring" },
    });
    expect(
      notifications.some(
        (n) => n.recipientAccountId === ids.restricted && (n.body ?? "").includes(`ho ${RUN}`),
      ),
    ).toBe(false);
    expect(
      notifications.some(
        (n) => n.recipientAccountId === ids.open && (n.body ?? "").includes(`ho ${RUN}`),
      ),
    ).toBe(true);
    for (const recipient of [ids.restricted, ids.open])
      expect(
        notifications.some(
          (n) => n.recipientAccountId === recipient && (n.body ?? "").includes(`Site Baru ${RUN}`),
        ),
      ).toBe(true);
    for (const id of [ids.ho, ids.site])
      await prisma.employee.update({
        where: { id },
        data: { employmentStatusId: ids.status, contractEndDate: null, contractStage: null },
      });
  });
  test("100 karyawan HO: daftar tersaring tetap di bawah 1500 ms", async () => {
    performanceIds.push(...Array.from({ length: 100 }, () => crypto.randomUUID()));
    await prisma.employee.createMany({
      data: performanceIds.map((id, i) => ({
        id,
        fullName: `Perf ${RUN} ${i}`,
        employeeNumber: `PERF-${RUN}-${i}`,
        companyId,
        positionId: ids.position,
        employmentStatusId: ids.status,
        workLocationId: ids.hoLocation,
        joinDate: new Date("2024-01-01"),
      })),
    });
    // IAM-D3: ambang absolut 1500 ms menghindari rasio rapuh pada request bebas yang sangat cepat.
    const start = performance.now();
    const rows = await responseData<{ id: string }[]>(
      await call("GET", `/employees?q=${RUN}&pageSize=100`, h.restricted),
    );
    expect(performance.now() - start).toBeLessThan(1500);
    expect(rows).toHaveLength(2);
    const open = await call("GET", `/employees?q=${RUN}&pageSize=100`, h.open);
    expect(open.status).toBe(200);
    expect(((await open.json()) as { meta: { total: number } }).meta.total).toBe(103);
  });
});

describe("IAM-D3: pengaturan SA & layanan diri", () => {
  test("SA mengatur opsi lewat PUT /accounts/:id/companies (audit); ganti role non-HR mematikannya", async () => {
    // Ganti role ke MANAGER butuh akun tertaut karyawan (ONB-D2).
    const linked = await prisma.employee.create({
      data: {
        fullName: `hr ${RUN}`,
        employeeNumber: `HRX-${RUN}`,
        companyId,
        employmentStatusId: ids.status,
        positionId: ids.position,
        joinDate: new Date("2024-01-01"),
        workLocationId: ids.siteLocation,
      },
    });
    performanceIds.push(linked.id);
    const hr = await auth.loginAs("HR_ADMIN", { companies: [companyId], employeeId: linked.id });
    const put = await call("PUT", `/accounts/${hr.account.id}/companies`, h.sa, {
      companyIds: [companyId],
      restrictHeadOffice: true,
    });
    expect((await responseData<{ restrictHeadOffice: boolean }>(put)).restrictHeadOffice).toBe(
      true,
    );
    expect(
      await prisma.auditLog.count({
        where: { action: "iam.account.restrict_head_office", entityId: hr.account.id },
      }),
    ).toBe(1);
    const list = (await (await call("GET", `/employees?q=${RUN}`, hr.headers)).json()) as {
      data: { id: string }[];
    };
    expect(list.data.map((e) => e.id)).not.toContain(ids.ho);
    // Tanpa field → tidak berubah; HR biasa tidak boleh mengatur.
    await call("PUT", `/accounts/${hr.account.id}/companies`, h.sa, { companyIds: [companyId] });
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { id: hr.account.id } })).restrictHeadOffice,
    ).toBe(true);
    expect(
      (
        await call("PUT", `/accounts/${hr.account.id}/companies`, h.open, {
          companyIds: [companyId],
          restrictHeadOffice: false,
        })
      ).status,
    ).toBe(403);
    expect(
      (await call("PATCH", `/accounts/${hr.account.id}/role`, h.sa, { role: "MANAGER" })).status,
    ).toBe(200);
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { id: hr.account.id } })).restrictHeadOffice,
    ).toBe(false);
  });

  test("akun dibatasi yang karyawannya sendiri di HO tetap melihat datanya sendiri", async () => {
    const own = await prisma.employee.create({
      data: {
        fullName: `own ${RUN}`,
        employeeNumber: `OWN-${RUN}`,
        companyId,
        employmentStatusId: ids.status,
        positionId: ids.position,
        joinDate: new Date("2024-01-01"),
        workLocationId: ids.hoLocation,
      },
    });
    performanceIds.push(own.id);
    const hr = await auth.loginAs("HR_ADMIN", { companies: [companyId], employeeId: own.id });
    await prisma.account.update({
      where: { id: hr.account.id },
      data: { restrictHeadOffice: true },
    });
    const actor = await loadActor(hr.account.authUserId);
    expect(actor?.hiddenEmployeeIds?.has(own.id)).toBe(false);
    expect(actor?.hiddenEmployeeIds?.has(ids.ho)).toBe(true);
    expect((await call("GET", `/employees/${own.id}`, hr.headers)).status).toBe(200);
    expect((await call("GET", `/employees/${ids.ho}`, hr.headers)).status).toBe(404);
  });

  test("tutup periode ditolak untuk akun dibatasi walau tidak ada karyawan HO saat ini", () => {
    const actor = {
      accountId: "a",
      authUserId: "u",
      email: "x@example.test",
      role: "HR_ADMIN" as const,
      employeeId: null,
      isPrimarySuperAdmin: false,
      grants: new Set(["payroll.period.prepare" as const]),
      companyIds: new Set([companyId]),
    };
    expect(canClosePeriod(actor, companyId)).toBe(true);
    expect(canClosePeriod({ ...actor, hiddenEmployeeIds: new Set<string>() }, companyId)).toBe(
      false,
    );
  });
});

describe("IAM-D3: temuan review", () => {
  test("karyawan HO tidak bisa dipilih sebagai atasan (pesan sama dengan tidak ada)", async () => {
    const res = await call("PATCH", `/employees/${ids.site}`, h.restricted, { managerId: ids.ho });
    expect(res.status).toBe(422);
    expect(JSON.stringify(await res.json())).toContain("Atasan harus karyawan aktif.");
  });

  test("pola & crew yang dipakai karyawan HO tidak bisa diubah/diarsipkan akun dibatasi", async () => {
    const pattern = await prisma.rosterPattern.create({
      data: { companyId, name: `HO ${RUN}`, steps: ["OFF"] },
    });
    const crew = await prisma.crew.create({
      data: {
        companyId,
        workLocationId: ids.siteLocation,
        name: `HO ${RUN}`,
        patternId: pattern.id,
        cycleStartDate: new Date("2026-01-01"),
      },
    });
    await prisma.crewMember.create({
      data: { crewId: crew.id, employeeId: ids.ho, startDate: new Date("2026-01-01") },
    });
    try {
      for (const [method, path, body] of [
        [
          "PUT",
          `/roster-patterns/${pattern.id}`,
          { companyId, name: `HO2 ${RUN}`, steps: ["OFF"] },
        ],
        ["DELETE", `/crews/${crew.id}`, undefined],
      ] as const) {
        const res = await call(method, path, h.restricted, body);
        expect(res.status).toBe(422);
        expect(JSON.stringify(await res.json())).toContain("di luar cakupan Anda");
      }
      expect((await prisma.crew.findUniqueOrThrow({ where: { id: crew.id } })).deletedAt).toBe(
        null,
      );
    } finally {
      await prisma.crewMember.deleteMany({ where: { crewId: crew.id } });
      await prisma.crew.delete({ where: { id: crew.id } });
      await prisma.rosterPattern.delete({ where: { id: pattern.id } });
    }
  });
});
