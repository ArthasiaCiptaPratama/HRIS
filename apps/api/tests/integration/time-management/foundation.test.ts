import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import {
  createApprovalRequest,
  type FinalStatus,
  registerApprovalHandler,
} from "../../../src/modules/approval/index.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";

// Time Management Tahap A: mesin approval paralel (PLAN §5.2, D-067) + kalender libur & pengaturan.
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

// Handler status final yang dicatat (pengganti modul pemilik subjek).
const finals: { subjectId: string; status: FinalStatus }[] = [];
registerApprovalHandler("ATTENDANCE_DAY", async (_tx, event) => {
  finals.push({ subjectId: event.subjectId, status: event.status });
});

const ids = {
  status: "",
  department: "",
  position: "",
  employees: [] as string[],
  holidays: [] as string[],
};
let companyId = "";
let mgrEmp = "";
let empEmp = "";
let h: Record<"sa" | "hr" | "hr2" | "mgr" | "emp" | "otherMgr", Record<string, string>>;

async function newRequest(managerEmployeeId: string | null = mgrEmp) {
  const subjectId = crypto.randomUUID();
  const row = await prisma.$transaction((tx) =>
    createApprovalRequest(tx, {
      subjectType: "ATTENDANCE_DAY",
      subjectId,
      requesterEmployeeId: empEmp,
      companyId,
      managerEmployeeId,
    }),
  );
  return { id: row.id, subjectId };
}
const decide = (who: Record<string, string>, id: string, body: object) =>
  call("POST", `/approvals/${id}/decision`, who, body);

beforeAll(async () => {
  companyId = await acpCompanyId();
  ids.status = (await prisma.employmentStatus.create({ data: { name: `TM ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `TM ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `TM ${RUN}`, departmentId: ids.department } })
  ).id;
  const mk = async (n: string) =>
    (
      await prisma.employee.create({
        data: {
          employeeNumber: `TM-${RUN}-${n}`,
          fullName: `TM ${RUN} ${n}`,
          joinDate: new Date("2024-01-01T00:00:00Z"),
          companyId,
          employmentStatusId: ids.status,
          positionId: ids.position,
        },
      })
    ).id;
  mgrEmp = await mk("MGR");
  empEmp = await mk("EMP");
  const otherMgr = await mk("OTH");
  ids.employees.push(mgrEmp, empEmp, otherMgr);
  h = {
    sa: (await auth.loginAs("SUPER_ADMIN")).headers,
    hr: (await auth.loginAs("HR_ADMIN")).headers,
    hr2: (await auth.loginAs("HR_ADMIN")).headers,
    mgr: (await auth.loginAs("MANAGER", { employeeId: mgrEmp })).headers,
    emp: (await auth.loginAs("EMPLOYEE", { employeeId: empEmp })).headers,
    otherMgr: (await auth.loginAs("MANAGER", { employeeId: otherMgr })).headers,
  };
});

afterAll(async () => {
  await prisma.approvalRequest.deleteMany({
    where: { requesterEmployeeId: { in: ids.employees } },
  });
  await prisma.holiday.deleteMany({ where: { id: { in: ids.holidays } } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await disconnectPrisma();
});

describe("approval paralel (PLAN §5.2, D-067)", () => {
  test("atasan + HR setuju → APPROVED, handler dipanggil sekali", async () => {
    const r = await newRequest();
    const first = await decide(h.mgr, r.id, { decision: "APPROVED" });
    expect(first.status).toBe(200);
    expect((await data<{ status: string }>(first)).status).toBe("PENDING");
    const second = await decide(h.hr, r.id, { decision: "APPROVED" });
    expect((await data<{ status: string }>(second)).status).toBe("APPROVED");
    expect(finals.filter((f) => f.subjectId === r.subjectId)).toEqual([
      { subjectId: r.subjectId, status: "APPROVED" },
    ]);
    // Sudah final → 409.
    expect((await decide(h.hr2, r.id, { decision: "REJECTED", note: "x" })).status).toBe(409);
  });

  test("salah satu menolak → REJECTED final walau pihak lain setuju; tolak wajib alasan", async () => {
    const r = await newRequest();
    expect((await decide(h.hr, r.id, { decision: "APPROVED" })).status).toBe(200);
    expect((await decide(h.mgr, r.id, { decision: "REJECTED" })).status).toBe(400);
    const res = await decide(h.mgr, r.id, { decision: "REJECTED", note: "Foto tidak jelas" });
    expect((await data<{ status: string }>(res)).status).toBe("REJECTED");
    expect(finals.find((f) => f.subjectId === r.subjectId)?.status).toBe("REJECTED");
  });

  test("akses: pengaju 403, manager lain 404; HR PT lain 404; pemutus yang sama tak boleh dua langkah", async () => {
    const r = await newRequest();
    // Pengaju boleh melihat pengajuannya → 403 (bukan 404) saat mencoba memutuskan.
    expect((await decide(h.emp, r.id, { decision: "APPROVED" })).status).toBe(403);
    expect((await decide(h.otherMgr, r.id, { decision: "APPROVED" })).status).toBe(404);
    expect((await decide(h.mgr, r.id, { decision: "APPROVED" })).status).toBe(200);
    expect((await decide(h.mgr, r.id, { decision: "APPROVED" })).status).toBe(403);
    expect((await call("GET", `/approvals/${r.id}`, h.emp)).status).toBe(200);
    expect((await call("GET", `/approvals/${r.id}`, h.otherMgr)).status).toBe(404);
  });

  test("override langkah atasan oleh HR wajib alasan & tercatat", async () => {
    const r = await newRequest();
    expect((await decide(h.hr, r.id, { decision: "APPROVED" })).status).toBe(200);
    // HR lain: langkah HR sudah diputuskan → hanya bisa override atasan, wajib alasan.
    expect((await decide(h.hr2, r.id, { decision: "APPROVED" })).status).toBe(422);
    const res = await decide(h.hr2, r.id, { decision: "APPROVED", note: "Atasan cuti" });
    expect((await data<{ status: string }>(res)).status).toBe("APPROVED");
    const view = await data<{ steps: { kind: string; isOverride: boolean }[] }>(
      await call("GET", `/approvals/${r.id}`, h.sa),
    );
    expect(view.steps.find((s) => s.kind === "MANAGER")?.isOverride).toBe(true);
  });

  test("tanpa atasan → SA memutuskan langkah atasan tanpa alasan", async () => {
    const r = await newRequest(null);
    expect((await decide(h.sa, r.id, { decision: "APPROVED" })).status).toBe(200);
    const res = await decide(h.hr, r.id, { decision: "APPROVED" });
    expect((await data<{ status: string }>(res)).status).toBe("APPROVED");
  });

  test("persetujuan massal: hasil per pengajuan, yang tak berhak tidak menggagalkan lainnya", async () => {
    const a = await newRequest();
    const b = await newRequest();
    const res = await call("POST", "/approvals/decisions", h.mgr, {
      requestIds: [a.id, b.id, crypto.randomUUID()],
      decision: "APPROVED",
    });
    const items = await data<{ requestId: string; status?: string; error?: string }[]>(res);
    expect(items.filter((i) => i.status === "PENDING")).toHaveLength(2);
    expect(items.filter((i) => i.error)).toHaveLength(1);
  });
});

describe("kalender libur & pengaturan", () => {
  test("SA kelola; HR/karyawan hanya lihat; tanggal ganda 409", async () => {
    const body = { date: "2099-08-17", name: `HUT RI ${RUN}`, kind: "NATIONAL" };
    expect((await call("POST", "/holidays", h.hr, body)).status).toBe(403);
    const created = await call("POST", "/holidays", h.sa, body);
    expect(created.status).toBe(201);
    const holiday = await data<{ id: string }>(created);
    ids.holidays.push(holiday.id);
    expect((await call("POST", "/holidays", h.sa, body)).status).toBe(409);
    const list = await data<{ name: string }[]>(await call("GET", "/holidays?year=2099", h.emp));
    expect(list.some((x) => x.name === body.name)).toBe(true);
    const updated = await call("PUT", `/holidays/${holiday.id}`, h.sa, {
      ...body,
      kind: "COLLECTIVE_LEAVE",
    });
    expect((await data<{ kind: string }>(updated)).kind).toBe("COLLECTIVE_LEAVE");
    expect((await call("GET", "/holidays?year=2099", {})).status).toBe(401);
  });

  test("libur resmi SKB 3 Menteri: tahun tersedia terbaca semua akun; impor hanya SA", async () => {
    const years = await data<number[]>(await call("GET", "/holidays/official-years", h.emp));
    expect(years).toEqual(expect.arrayContaining([2026, 2027]));
    expect((await call("POST", "/holidays/import-official", h.hr, { year: 2026 })).status).toBe(
      403,
    );
    expect((await call("POST", "/holidays/import-official", h.sa, { year: 2090 })).status).toBe(
      404,
    );
  });

  test("pengaturan: bawaan terbaca; SA ubah, HR tidak; validasi rentang", async () => {
    const current = await data<{ gpsAccuracyMaxM: number; timezone: string }>(
      await call("GET", "/time-settings", h.hr),
    );
    expect(current.gpsAccuracyMaxM).toBeGreaterThan(0);
    // Semua akun membaca (zona waktu jam shift); hanya SA yang mengubah.
    expect((await call("GET", "/time-settings", h.emp)).status).toBe(200);
    const next = {
      timezone: current.timezone,
      gpsAccuracyMaxM: 80,
      selfieRetentionMonths: 12,
      approvalDueDays: 2,
      rosterHorizonDays: 92,
    };
    expect((await call("PUT", "/time-settings", h.hr, next)).status).toBe(403);
    expect(
      (await call("PUT", "/time-settings", h.sa, { ...next, gpsAccuracyMaxM: 5 })).status,
    ).toBe(400);
    expect((await call("PUT", "/time-settings", h.sa, next)).status).toBe(200);
    // Kembalikan nilai sebelumnya supaya test lain tidak terpengaruh.
    await call("PUT", "/time-settings", h.sa, current);
  });
});
