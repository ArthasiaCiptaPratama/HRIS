import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { addMonths, type ErrorBody } from "@hris/shared";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import { runDisciplineDaily } from "../../../src/modules/discipline/index.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId, createTestCompany } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// ARS-D7–D13 (Arsip gelombang 2b): surat peringatan — master, draft, terbit (saran tingkat, nomor),
// konfirmasi atasan & karyawan, cabut, scan, PDF, bukti ALPHA, cron kedaluwarsa & pengingat.
const RUN = crypto.randomUUID().slice(0, 4).toUpperCase();
const auth = createAuthFixture(`sp${RUN.toLowerCase()}`);
const prisma = getPrisma();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
  storage: createFakeStorage().storage,
  storagePathPrefix: "",
});

type Headers = Record<string, string>;
type Login = Awaited<ReturnType<typeof auth.loginAs>>;
const call = (method: string, path: string, headers: Headers, payload?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: {
      ...headers,
      ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
const code = async (res: Response) => ((await res.json()) as ErrorBody).error.code;
// biome-ignore lint/suspicious/noExplicitAny: bentuk respons diperiksa per test
const data = async (res: Response) => (await res.json()) as { data: any; meta?: any };
const WRITE = { permission: "EMPLOYEE_DISCIPLINE_WRITE" as const };
const READ = { permission: "EMPLOYEE_DISCIPLINE_READ" as const };
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const dayBefore = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

const ids = {
  acp: "",
  acpCode: "",
  other: "",
  status: "",
  department: "",
  position: "",
  mgr: "",
  emp: "",
  emp2: "",
  mgr2: "",
  hrEmp: "",
  mangkir: "",
  telat: "",
  alphaDay: "",
  sp1: "",
  sp3: "",
};
const startedAt = new Date();
let sa: Login;
let hr: Login;
let hrRead: Login;
let hrPlain: Login;
let hrOther: Login;
let mgr: Login;
let mgrOther: Login;
let emp: Login;
let emp2: Login;

async function employee(n: string, extra: Record<string, unknown> = {}) {
  const row = await prisma.employee.create({
    data: {
      companyId: ids.acp,
      employeeNumber: `SP-${RUN}-${n}`,
      fullName: `Disiplin ${RUN} ${n}`,
      joinDate: new Date("2024-01-02T00:00:00.000Z"),
      employmentStatusId: ids.status,
      positionId: ids.position,
      ...extra,
    },
  });
  return row.id;
}
async function document(employeeId: string, typeCode: string) {
  const type = await prisma.documentType.findUniqueOrThrow({ where: { code: typeCode } });
  const doc = await prisma.employeeDocument.create({
    data: {
      employeeId,
      type: "OTHER",
      documentTypeId: type.id,
      storagePath: `test/${RUN}/${crypto.randomUUID()}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 1000,
      uploadedBy: sa.account.id,
    },
  });
  return doc.id;
}
const draft = (extra: Record<string, unknown> = {}) => ({
  employeeId: ids.emp,
  level: "SP1",
  violationTypeId: ids.telat,
  incidentDate: dayBefore(TODAY, 3),
  description: `Terlambat masuk kerja 4 kali dalam sebulan (${RUN}).`,
  ...extra,
});

beforeAll(async () => {
  ids.acp = await acpCompanyId();
  ids.acpCode = (await prisma.company.findUniqueOrThrow({ where: { id: ids.acp } })).code;
  ids.other = await createTestCompany(`S${RUN}`, `PT Disiplin ${RUN}`);
  ids.status = (await prisma.employmentStatus.create({ data: { name: `SP St ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `SP Dept ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `SP Jab ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.mgr = await employee("M");
  ids.emp = await employee("E", { managerId: ids.mgr });
  ids.emp2 = await employee("F");
  ids.mgr2 = await employee("N");
  ids.hrEmp = await employee("H");
  ids.mangkir = (await prisma.violationType.findUniqueOrThrow({ where: { code: "MANGKIR" } })).id;
  ids.telat = (await prisma.violationType.findUniqueOrThrow({ where: { code: "TELAT" } })).id;
  ids.alphaDay = (
    await prisma.attendanceDay.create({
      data: {
        employeeId: ids.emp,
        companyId: ids.acp,
        workDate: new Date(`${dayBefore(TODAY, 20)}T00:00:00.000Z`),
        status: "ALPHA",
        labels: [],
      },
    })
  ).id;
  sa = await auth.loginAs("SUPER_ADMIN");
  hr = await auth.loginAs("HR_ADMIN", {
    companies: [ids.acp],
    grants: [WRITE],
    employeeId: ids.hrEmp,
  });
  hrRead = await auth.loginAs("HR_ADMIN", { companies: [ids.acp], grants: [READ] });
  hrPlain = await auth.loginAs("HR_ADMIN", { companies: [ids.acp] });
  hrOther = await auth.loginAs("HR_ADMIN", { companies: [ids.other], grants: [WRITE] });
  mgr = await auth.loginAs("MANAGER", { employeeId: ids.mgr });
  mgrOther = await auth.loginAs("MANAGER", { employeeId: ids.mgr2 });
  emp = await auth.loginAs("EMPLOYEE", { employeeId: ids.emp });
  emp2 = await auth.loginAs("EMPLOYEE", { employeeId: ids.emp2 });
});

afterAll(async () => {
  const employees = [ids.mgr, ids.emp, ids.emp2, ids.mgr2, ids.hrEmp].filter(Boolean);
  const accounts = [sa, hr, hrRead, hrPlain, hrOther, mgr, mgrOther, emp, emp2]
    .filter((a): a is Login => a !== undefined)
    .map((a) => a.account.id);
  await prisma.warningLetter.deleteMany({ where: { employeeId: { in: employees } } });
  await prisma.violationType.deleteMany({ where: { name: { contains: RUN } } });
  await prisma.attendanceDay.deleteMany({ where: { employeeId: { in: employees } } });
  await prisma.employeeDocument.deleteMany({ where: { employeeId: { in: employees } } });
  await prisma.notification.deleteMany({ where: { recipientAccountId: { in: accounts } } });
  await prisma.disciplineSetting.update({ where: { id: 1 }, data: { validityMonths: 6 } });
  await auth.cleanup();
  await prisma.auditLog.deleteMany({
    where: {
      occurredAt: { gte: startedAt },
      entityType: { in: ["warning_letter", "violation_type", "discipline_settings"] },
    },
  });
  await prisma.employee.updateMany({ where: { id: { in: employees } }, data: { managerId: null } });
  await prisma.employee.deleteMany({ where: { id: { in: employees } } });
  if (ids.position) await prisma.position.delete({ where: { id: ids.position } });
  if (ids.department) await prisma.department.delete({ where: { id: ids.department } });
  if (ids.status) await prisma.employmentStatus.delete({ where: { id: ids.status } });
  if (ids.other) await prisma.company.delete({ where: { id: ids.other } });
  await disconnectPrisma();
});

describe("master jenis pelanggaran & pengaturan", () => {
  test("SA / HR write kelola; HR read hanya lihat; MANAGER & tanpa grant 403; 400; 409; 401", async () => {
    const type = { code: `X${RUN}`, name: `Pelanggaran ${RUN}`, linksAttendance: false };
    expect((await call("POST", "/violation-types", hrRead.headers, type)).status).toBe(403);
    expect((await call("POST", "/violation-types", mgr.headers, type)).status).toBe(403);
    expect((await call("POST", "/violation-types", {}, type)).status).toBe(401);
    const bad = await call("POST", "/violation-types", hr.headers, { code: "a b", name: "x" });
    expect(bad.status).toBe(400);
    expect(await code(bad)).toBe("VALIDATION_ERROR");
    const created = await call("POST", "/violation-types", hr.headers, type);
    expect(created.status).toBe(201);
    const id = (await data(created)).data.id;
    expect((await call("POST", "/violation-types", sa.headers, type)).status).toBe(409);
    const off = await call("PUT", `/violation-types/${id}`, hr.headers, {
      ...type,
      isActive: false,
    });
    expect((await data(off)).data.isActive).toBe(false);
    const list = await call("GET", "/violation-types", hrRead.headers);
    expect(list.status).toBe(200);
    expect((await data(list)).data.some((t: { code: string }) => t.code === "MANGKIR")).toBe(true);
    expect((await call("GET", "/violation-types", hrPlain.headers)).status).toBe(403);
    expect((await call("GET", "/violation-types", emp.headers)).status).toBe(403);
  });

  test("masa berlaku bawaan 6 bulan; hanya SA yang mengubah (ARS-D8)", async () => {
    const got = await call("GET", "/discipline-settings", hr.headers);
    expect((await data(got)).data.validityMonths).toBe(6);
    expect(
      (await call("PUT", "/discipline-settings", hr.headers, { validityMonths: 12 })).status,
    ).toBe(403);
    expect(
      (await call("PUT", "/discipline-settings", sa.headers, { validityMonths: 0 })).status,
    ).toBe(400);
    const saved = await call("PUT", "/discipline-settings", sa.headers, { validityMonths: 12 });
    expect((await data(saved)).data.validityMonths).toBe(12);
    await call("PUT", "/discipline-settings", sa.headers, { validityMonths: 6 });
  });
});

describe("draft & akses (ARS-D10/ARS-D13)", () => {
  test("HR write buat draft; HR read/PT lain/MANAGER/karyawan 403; uraian pendek 400; diri sendiri 422", async () => {
    expect((await call("POST", "/warning-letters", hrRead.headers, draft())).status).toBe(403);
    expect((await call("POST", "/warning-letters", hrOther.headers, draft())).status).toBe(403);
    expect((await call("POST", "/warning-letters", mgr.headers, draft())).status).toBe(403);
    expect((await call("POST", "/warning-letters", emp.headers, draft())).status).toBe(403);
    const short = await call("POST", "/warning-letters", hr.headers, draft({ description: "x" }));
    expect(short.status).toBe(400);
    const self = await call(
      "POST",
      "/warning-letters",
      hr.headers,
      draft({ employeeId: ids.hrEmp }),
    );
    expect(self.status).toBe(422);
    const created = await call("POST", "/warning-letters", hr.headers, draft());
    expect(created.status).toBe(201);
    const body = (await data(created)).data;
    ids.sp1 = body.id;
    expect(body.state).toBe("DRAFT");
    expect(body.number).toBeNull();
    expect(body.can.issue).toBe(true);
  });

  test("draft tidak terlihat oleh HR read, MANAGER, dan karyawan (404 / tidak masuk daftar)", async () => {
    expect((await call("GET", `/warning-letters/${ids.sp1}`, hrRead.headers)).status).toBe(404);
    expect((await call("GET", `/warning-letters/${ids.sp1}`, mgr.headers)).status).toBe(404);
    expect((await call("GET", `/warning-letters/${ids.sp1}`, emp.headers)).status).toBe(404);
    const list = await data(
      await call("GET", `/warning-letters?employeeId=${ids.emp}`, hrRead.headers),
    );
    expect(list.data).toHaveLength(0);
    const own = await data(await call("GET", "/self/warning-letters", emp.headers));
    expect(own.data).toHaveLength(0);
    const pdf = await call("GET", `/warning-letters/${ids.sp1}/pdf`, hr.headers);
    expect(pdf.status).toBe(200);
    expect(
      Buffer.from((await data(pdf)).data.contentBase64, "base64")
        .subarray(0, 4)
        .toString(),
    ).toBe("%PDF");
  });

  test("hari ALPHA hanya untuk jenis mangkir & milik karyawan yang sama (ARS-D12)", async () => {
    const candidates = await data(
      await call("GET", `/warning-letters/alpha-days/${ids.emp}`, hr.headers),
    );
    expect(candidates.data.map((d: { dayId: string }) => d.dayId)).toContain(ids.alphaDay);
    expect(
      (await call("GET", `/warning-letters/alpha-days/${ids.emp}`, hrRead.headers)).status,
    ).toBe(403);
    const wrongType = await call(
      "POST",
      "/warning-letters",
      hr.headers,
      draft({ alphaDayIds: [ids.alphaDay] }),
    );
    expect(wrongType.status).toBe(422);
    const otherEmp = await call(
      "POST",
      "/warning-letters",
      hr.headers,
      draft({ employeeId: ids.emp2, violationTypeId: ids.mangkir, alphaDayIds: [ids.alphaDay] }),
    );
    expect(otherEmp.status).toBe(422);
    const ok = await call(
      "PUT",
      `/warning-letters/${ids.sp1}`,
      hr.headers,
      draft({ violationTypeId: ids.mangkir, alphaDayIds: [ids.alphaDay] }),
    );
    expect(ok.status).toBe(200);
    const body = (await data(ok)).data;
    expect(body.alphaDays).toHaveLength(1);
    expect(body.alphaEvidence[0].dayId).toBe(ids.alphaDay);
  });
});

describe("terbit, saran tingkat & nomor (ARS-D8/D10/D11)", () => {
  test("tanggal masa depan 422; terbit SP1 → nomor otomatis, berlaku s/d +6 bulan, notifikasi tanpa isi", async () => {
    const future = await call("POST", `/warning-letters/${ids.sp1}/issue`, hr.headers, {
      issuedAt: "2999-01-01",
    });
    expect(future.status).toBe(422);
    // Draft tidak terlihat oleh HR read → 404 (keberadaan tidak dibocorkan).
    expect(
      (await call("POST", `/warning-letters/${ids.sp1}/issue`, hrRead.headers, { issuedAt: TODAY }))
        .status,
    ).toBe(404);
    const issued = await call("POST", `/warning-letters/${ids.sp1}/issue`, hr.headers, {
      issuedAt: TODAY,
    });
    expect(issued.status).toBe(200);
    const body = (await data(issued)).data;
    const month = ROMAN[Number(TODAY.slice(5, 7)) - 1];
    expect(body.number).toMatch(
      new RegExp(`^\\d{3}/SP1/HRD-${ids.acpCode}/${month}/${TODAY.slice(0, 4)}$`),
    );
    expect(body.effectiveUntil).toBe(addMonths(TODAY, 6));
    expect(body.state).toBe("ACTIVE");
    expect(body.suggestedLevel).toBe("SP1");
    const again = await call("POST", `/warning-letters/${ids.sp1}/issue`, hr.headers, {
      issuedAt: TODAY,
    });
    expect(again.status).toBe(422);
    const notes = await prisma.notification.findMany({
      where: {
        recipientAccountId: { in: [emp.account.id, mgr.account.id] },
        type: { startsWith: "discipline.letter" },
      },
    });
    expect(notes.map((n) => n.type).sort()).toEqual([
      "discipline.letter.issued",
      "discipline.letter.to_deliver",
    ]);
    for (const n of notes) expect(`${n.title} ${n.body}`).not.toContain(RUN);
  });

  test("SP3 di atas saran (SP2) wajib alasan; alasan hanya terlihat HR", async () => {
    const created = await call("POST", "/warning-letters", hr.headers, draft({ level: "SP3" }));
    ids.sp3 = (await data(created)).data.id;
    const suggestion = await data(
      await call("GET", `/warning-letters/suggestion/${ids.emp}`, hr.headers),
    );
    expect(suggestion.data.suggestedLevel).toBe("SP2");
    const noReason = await call("POST", `/warning-letters/${ids.sp3}/issue`, hr.headers, {
      issuedAt: TODAY,
    });
    expect(noReason.status).toBe(422);
    await call(
      "PUT",
      `/warning-letters/${ids.sp3}`,
      hr.headers,
      draft({ level: "SP3", escalationReason: "Pelanggaran berat K3 berulang." }),
    );
    const dup = await call("POST", `/warning-letters/${ids.sp3}/issue`, hr.headers, {
      issuedAt: TODAY,
      number: (await data(await call("GET", `/warning-letters/${ids.sp1}`, hr.headers))).data
        .number,
    });
    expect(dup.status).toBe(409);
    const issued = await call("POST", `/warning-letters/${ids.sp3}/issue`, hr.headers, {
      issuedAt: TODAY,
      number: `MANUAL/${RUN}/SP3`,
    });
    expect(issued.status).toBe(200);
    expect((await data(issued)).data.suggestedLevel).toBe("SP2");
    const asEmp = (await data(await call("GET", `/warning-letters/${ids.sp3}`, emp.headers))).data;
    expect(asEmp.escalationReason).toBeNull();
    expect(asEmp.suggestedLevel).toBeNull();
    expect(asEmp.alphaDays).toEqual([]);
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: ids.sp3, action: "discipline.letter.issue" },
    });
    expect(audit?.reason).toBe("Pelanggaran berat K3 berulang.");
  });

  test("SP terbit tidak bisa diubah / dihapus (422)", async () => {
    expect((await call("PUT", `/warning-letters/${ids.sp1}`, hr.headers, draft())).status).toBe(
      422,
    );
    expect((await call("DELETE", `/warning-letters/${ids.sp1}`, hr.headers)).status).toBe(422);
  });
});

describe("lihat & konfirmasi (ARS-D9/D13)", () => {
  test("karyawan melihat miliknya; MANAGER tim; MANAGER lain & HR PT lain 404; tanpa grant 403 di tab", async () => {
    const own = await data(await call("GET", "/self/warning-letters", emp.headers));
    expect(own.data.map((l: { id: string }) => l.id).sort()).toEqual([ids.sp1, ids.sp3].sort());
    expect(
      (await data(await call("GET", "/self/warning-letters", emp2.headers))).data,
    ).toHaveLength(0);
    const team = await data(await call("GET", "/warning-letters", mgr.headers));
    expect(team.data.map((l: { id: string }) => l.id)).toContain(ids.sp1);
    expect((await call("GET", `/warning-letters/${ids.sp1}`, mgrOther.headers)).status).toBe(404);
    expect((await call("GET", `/warning-letters/${ids.sp1}`, hrOther.headers)).status).toBe(404);
    expect(
      (await call("GET", `/warning-letters/employee/${ids.emp}`, hrPlain.headers)).status,
    ).toBe(403);
    expect((await call("GET", `/warning-letters/employee/${ids.emp}`, mgr.headers)).status).toBe(
      200,
    );
    expect((await call("GET", "/warning-letters", hrPlain.headers)).status).toBe(403);
    expect((await call("GET", "/warning-letters", emp.headers)).status).toBe(403);
  });

  test("atasan menyampaikan, karyawan menerima → dikonfirmasi; idempoten; pihak lain ditolak", async () => {
    expect((await call("POST", `/warning-letters/${ids.sp1}/deliver`, emp.headers)).status).toBe(
      403,
    );
    expect((await call("POST", `/warning-letters/${ids.sp1}/deliver`, hr.headers)).status).toBe(
      403,
    );
    expect(
      (await call("POST", `/self/warning-letters/${ids.sp1}/acknowledge`, mgr.headers)).status,
    ).toBe(404);
    const delivered = await call("POST", `/warning-letters/${ids.sp1}/deliver`, mgr.headers);
    expect((await data(delivered)).data.deliveredAt).not.toBeNull();
    const ack = await call("POST", `/self/warning-letters/${ids.sp1}/acknowledge`, emp.headers);
    expect((await data(ack)).data.state).toBe("CONFIRMED");
    const ack2 = await call("POST", `/self/warning-letters/${ids.sp1}/acknowledge`, emp.headers);
    expect(ack2.status).toBe(200);
    expect(
      await prisma.auditLog.count({
        where: { entityId: ids.sp1, action: "discipline.letter.acknowledge" },
      }),
    ).toBe(1);
  });

  test("scan: jenis dokumen salah 422; dokumen WARNING_LETTER karyawan → terlampir", async () => {
    const wrong = await document(ids.emp, "BAST_ASSET");
    expect(
      (await call("POST", `/warning-letters/${ids.sp1}/scan`, hr.headers, { documentId: wrong }))
        .status,
    ).toBe(422);
    const otherEmp = await document(ids.emp2, "WARNING_LETTER");
    expect(
      (await call("POST", `/warning-letters/${ids.sp1}/scan`, hr.headers, { documentId: otherEmp }))
        .status,
    ).toBe(422);
    const scan = await document(ids.emp, "WARNING_LETTER");
    const ok = await call("POST", `/warning-letters/${ids.sp1}/scan`, hr.headers, {
      documentId: scan,
    });
    expect((await data(ok)).data.scanDocumentId).toBe(scan);
  });

  test("PDF untuk karyawan penerima", async () => {
    const pdf = await call("GET", `/warning-letters/${ids.sp1}/pdf`, emp.headers);
    expect(pdf.status).toBe(200);
    expect((await data(pdf)).data.fileName).toStartWith("SP1-");
  });
});

describe("cabut & cron", () => {
  test("cabut: HR read 403; tanpa alasan 400; dicabut tetap terlihat sebagai riwayat", async () => {
    expect(
      (
        await call("POST", `/warning-letters/${ids.sp3}/revoke`, hrRead.headers, {
          reason: "Salah tingkat.",
        })
      ).status,
    ).toBe(403);
    expect((await call("POST", `/warning-letters/${ids.sp3}/revoke`, hr.headers, {})).status).toBe(
      400,
    );
    const revoked = await call("POST", `/warning-letters/${ids.sp3}/revoke`, hr.headers, {
      reason: "Salah tingkat, diterbitkan ulang.",
    });
    expect((await data(revoked)).data.state).toBe("REVOKED");
    expect(
      (
        await call("POST", `/warning-letters/${ids.sp3}/revoke`, hr.headers, {
          reason: "Lagi saja.",
        })
      ).status,
    ).toBe(422);
    const own = await data(await call("GET", "/self/warning-letters", emp.headers));
    expect(own.data.find((l: { id: string }) => l.id === ids.sp3).state).toBe("REVOKED");
    // SP dicabut tidak lagi dihitung untuk saran tingkat.
    const suggestion = await data(
      await call("GET", `/warning-letters/suggestion/${ids.emp}`, hr.headers),
    );
    expect(suggestion.data.suggestedLevel).toBe("SP2");
  });

  test("cron: lewat berlaku s/d → EXPIRED; pengingat konfirmasi sekali (dedupe, tanpa email)", async () => {
    const pending = (
      await data(
        await call(
          "POST",
          "/warning-letters",
          hr.headers,
          draft({ employeeId: ids.emp2, level: "SP1" }),
        ),
      )
    ).data.id;
    await call("POST", `/warning-letters/${pending}/issue`, hr.headers, {
      issuedAt: dayBefore(TODAY, 3),
    });
    await prisma.warningLetter.update({
      where: { id: ids.sp1 },
      data: {
        issuedAt: new Date(`${dayBefore(TODAY, 200)}T00:00:00.000Z`),
        effectiveUntil: new Date(`${dayBefore(TODAY, 1)}T00:00:00.000Z`),
      },
    });
    const first = await runDisciplineDaily();
    expect(first.expired).toBeGreaterThanOrEqual(1);
    expect((await prisma.warningLetter.findUniqueOrThrow({ where: { id: ids.sp1 } })).status).toBe(
      "EXPIRED",
    );
    const reminder = await prisma.notification.findFirst({
      where: { recipientAccountId: emp2.account.id, dedupeKey: `sp-ack:${pending}` },
    });
    expect(reminder).not.toBeNull();
    const second = await runDisciplineDaily();
    expect(second.expired).toBe(0);
    expect(
      await prisma.notification.count({
        where: { recipientAccountId: emp2.account.id, dedupeKey: `sp-ack:${pending}` },
      }),
    ).toBe(1);
    const expiredView = await data(await call("GET", `/warning-letters/${ids.sp1}`, emp.headers));
    expect(expiredView.data.state).toBe("EXPIRED");
  });
});
