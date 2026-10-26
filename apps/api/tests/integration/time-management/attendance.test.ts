import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApp } from "../../../src/app.ts";
import { disconnectPrisma, getPrisma } from "../../../src/core/db.ts";
import { createLogger } from "../../../src/core/logger.ts";
import {
  closeOverdueDays,
  purgeSelfies,
  readTimeSettings,
} from "../../../src/modules/attendance/index.ts";
import { deleteAttendanceData } from "../../helpers/attendance.ts";
import { createAuthFixture, testVerifier } from "../../helpers/auth.ts";
import { createFakeAuthAdmin } from "../../helpers/auth-admin.ts";
import { acpCompanyId } from "../../helpers/company.ts";
import { createFakeStorage } from "../../helpers/storage.ts";

// Time Management Tahap C/D — absen PWA (D-067, D-070) & approval hari absen (D-068).
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();
const auth = createAuthFixture(RUN.toLowerCase());
const prisma = getPrisma();
const fake = createFakeStorage();
const app = createApp({
  logger: createLogger("error", () => {}),
  tokenVerifier: testVerifier,
  authAdmin: createFakeAuthAdmin().admin,
  appUrl: "http://localhost:5173",
  storage: fake.storage,
});
const call = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: { ...headers, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const data = async <T>(res: Response) => ((await res.json()) as { data: T }).data;
const BUCKET = "attendance-selfies";
const SITE = { latitude: -3.85, longitude: 115.3 };
const FAR = { latitude: -3.7, longitude: 115.3 }; // ± 16 km dari site

// Waktu WITA (pengaturan bawaan Asia/Makassar) supaya shift uji selalu sedang berlangsung.
// Zona waktu jam shift mengikuti pengaturan Time Management yang sedang aktif (WIB/WITA/WIT).
const OFFSET_H: Record<string, number> = {
  "Asia/Jakarta": 7,
  "Asia/Makassar": 8,
  "Asia/Jayapura": 9,
};
const offsetH = OFFSET_H[(await readTimeSettings()).timezone] ?? 8;
/** "HH:mm" lokal pada tanggal → ISO UTC. */
const localToIso = (date: string, hhmm: string) =>
  new Date(Date.parse(`${date}T${hhmm}:00.000Z`) - offsetH * 3600_000).toISOString();
const nowWita = new Date(Date.now() + offsetH * 3600_000);
const witaMinute = nowWita.getUTCHours() * 60 + nowWita.getUTCMinutes();
const todayWita = nowWita.toISOString().slice(0, 10);

const ids = { status: "", department: "", position: "", location: "", employees: [] as string[] };
let companyId = "";
const emp = { mgr: "", a: "", b: "" };
let h: Record<"hr" | "mgr" | "a" | "b" | "otherEmp", Record<string, string>>;
let dayId = "";

async function selfie(headers: Record<string, string>) {
  const upload = await data<{ path: string }>(
    await call("POST", "/attendance/selfie-upload", headers, { contentType: "image/jpeg" }),
  );
  fake.putObject(BUCKET, upload.path, { size: 150_000, contentType: "image/jpeg" });
  return upload.path;
}

beforeAll(async () => {
  companyId = await acpCompanyId();
  ids.status = (await prisma.employmentStatus.create({ data: { name: `AT ${RUN}` } })).id;
  ids.department = (await prisma.department.create({ data: { name: `AT ${RUN}` } })).id;
  ids.position = (
    await prisma.position.create({ data: { name: `AT ${RUN}`, departmentId: ids.department } })
  ).id;
  ids.location = (
    await prisma.workLocation.create({
      data: { name: `Site AT ${RUN}`, city: "Tanah Laut", ...SITE, radiusM: 500 },
    })
  ).id;
  const mk = async (n: string, managerId: string | null = null) =>
    (
      await prisma.employee.create({
        data: {
          employeeNumber: `AT-${RUN}-${n}`,
          fullName: `Absen ${RUN} ${n}`,
          joinDate: new Date("2024-01-01T00:00:00Z"),
          companyId,
          employmentStatusId: ids.status,
          positionId: ids.position,
          managerId,
          workLocationId: ids.location,
        },
      })
    ).id;
  emp.mgr = await mk("MGR");
  emp.a = await mk("A", emp.mgr);
  emp.b = await mk("B", emp.mgr);
  ids.employees.push(emp.a, emp.b, emp.mgr);

  // Shift mulai 10 menit lagi (jendela absen masuk sudah buka) & berlangsung 8 jam.
  const shift = await prisma.shift.create({
    data: {
      companyId,
      code: `T${RUN.slice(0, 5)}`,
      name: `Uji ${RUN}`,
      startMinute: (witaMinute + 10) % 1440,
      endMinute: (witaMinute + 8 * 60) % 1440,
    },
  });
  const pattern = await prisma.rosterPattern.create({
    data: { companyId, name: `P ${RUN}`, steps: [shift.code] },
  });
  const crew = await prisma.crew.create({
    data: {
      companyId,
      workLocationId: ids.location,
      name: `C ${RUN}`,
      patternId: pattern.id,
      cycleStartDate: new Date(`${todayWita}T00:00:00Z`),
    },
  });
  await prisma.crewMember.create({
    data: { crewId: crew.id, employeeId: emp.a, startDate: new Date("2024-01-01T00:00:00Z") },
  });
  for (const offset of [-1, 0, 1]) {
    const d = new Date(Date.parse(`${todayWita}T00:00:00Z`) + offset * 86_400_000);
    await prisma.rosterDay.create({
      data: {
        employeeId: emp.a,
        workDate: d,
        shiftId: shift.id,
        crewId: crew.id,
        source: "PATTERN",
      },
    });
  }

  h = {
    hr: (await auth.loginAs("HR_ADMIN")).headers,
    mgr: (await auth.loginAs("MANAGER", { employeeId: emp.mgr, companies: [companyId] })).headers,
    a: (await auth.loginAs("EMPLOYEE", { employeeId: emp.a, companies: [companyId] })).headers,
    b: (await auth.loginAs("EMPLOYEE", { employeeId: emp.b, companies: [companyId] })).headers,
    otherEmp: (await auth.loginAs("EMPLOYEE")).headers,
  };
});

afterAll(async () => {
  await deleteAttendanceData(ids.employees);
  await prisma.rosterDay.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.crewMember.deleteMany({ where: { employeeId: { in: ids.employees } } });
  await prisma.crew.deleteMany({ where: { name: `C ${RUN}` } });
  await prisma.rosterPattern.deleteMany({ where: { name: `P ${RUN}` } });
  await prisma.shift.deleteMany({ where: { name: `Uji ${RUN}` } });
  await auth.cleanup();
  await prisma.employee.deleteMany({ where: { id: { in: ids.employees } } });
  await prisma.position.delete({ where: { id: ids.position } });
  await prisma.department.delete({ where: { id: ids.department } });
  await prisma.workLocation.delete({ where: { id: ids.location } });
  await prisma.employmentStatus.delete({ where: { id: ids.status } });
  await disconnectPrisma();
});

describe("absen PWA", () => {
  test("hari ini: roster terbaca, langkah berikutnya absen masuk; akun tanpa karyawan 403", async () => {
    const today = await data<{
      next: string;
      roster: { code: string }[];
      location: { name: string };
    }>(await call("GET", "/attendance/me/today", h.a));
    expect(today.next).toBe("IN");
    expect(today.roster.some((r) => r.code === `T${RUN.slice(0, 5)}`)).toBe(true);
    expect(today.location.name).toBe(`Site AT ${RUN}`);
    expect((await call("GET", "/attendance/me/today", h.hr)).status).toBe(403);
  });

  test("masuk di site sesuai roster: tanpa label; selfie wajib terunggah & milik sendiri; ganda 409", async () => {
    const pre = await data<{ labels: string[]; insideGeofence: boolean; reasonRequired: boolean }>(
      await call("POST", "/attendance/precheck", h.a, { kind: "IN", ...SITE, accuracyM: 15 }),
    );
    expect(pre).toMatchObject({ labels: [], insideGeofence: true, reasonRequired: false });

    const notUploaded = `attendance/${emp.a}/${crypto.randomUUID()}.jpg`;
    expect(
      (
        await call("POST", "/attendance/punch", h.a, {
          kind: "IN",
          ...SITE,
          accuracyM: 15,
          selfiePath: notUploaded,
        })
      ).status,
    ).toBe(422);
    const othersPath = await selfie(h.b);
    expect(
      (
        await call("POST", "/attendance/punch", h.a, {
          kind: "IN",
          ...SITE,
          accuracyM: 15,
          selfiePath: othersPath,
        })
      ).status,
    ).toBe(422);

    const res = await call("POST", "/attendance/punch", h.a, {
      kind: "IN",
      ...SITE,
      accuracyM: 15,
      selfiePath: await selfie(h.a),
    });
    expect(res.status).toBe(200);
    const day = await data<{ id: string; status: string; punches: { selfieUrl: string | null }[] }>(
      res,
    );
    dayId = day.id;
    expect(day.status).toBe("OPEN");
    expect(day.punches[0]?.selfieUrl).toContain("storage.test");
    expect(
      (
        await call("POST", "/attendance/punch", h.a, {
          kind: "IN",
          ...SITE,
          accuracyM: 15,
          selfiePath: await selfie(h.a),
        })
      ).status,
    ).toBe(409);
  });

  test("pulang lebih awal: peringatan salah pencet wajib dikonfirmasi; label + alasan; tiap absen punya approval", async () => {
    const pre = await data<{ labels: string[]; suspicion: string; minutesFromEnd: number }>(
      await call("POST", "/attendance/precheck", h.a, { kind: "OUT", ...FAR, accuracyM: 15 }),
    );
    expect(pre.labels).toEqual(expect.arrayContaining(["EARLY_LEAVE", "OUTSIDE_RADIUS"]));
    expect(pre.suspicion).toBe("OUT_BEFORE_END");
    expect(pre.minutesFromEnd).toBeLessThan(0);
    const path = await selfie(h.a);
    const body = { kind: "OUT", ...FAR, accuracyM: 15, selfiePath: path };
    // Belum dikonfirmasi → ditolak (mungkin salah pencet).
    expect((await call("POST", "/attendance/punch", h.a, { ...body, reason: "x" })).status).toBe(
      422,
    );
    // Dikonfirmasi tapi tanpa alasan → ditolak.
    expect(
      (await call("POST", "/attendance/punch", h.a, { ...body, confirmed: true })).status,
    ).toBe(422);
    const day = await data<{
      status: string;
      labels: string[];
      approval: unknown;
      punches: { kind: string; status: string; approval: { status: string } }[];
    }>(
      await call("POST", "/attendance/punch", h.a, {
        ...body,
        confirmed: true,
        reason: "Dipanggil ke workshop",
      }),
    );
    expect(day.status).toBe("PENDING");
    expect(day.labels).toEqual(expect.arrayContaining(["OUTSIDE_RADIUS"]));
    expect(day.approval).toBeNull();
    expect(day.punches.map((p) => [p.kind, p.status, p.approval.status])).toEqual([
      ["IN", "PENDING", "PENDING"],
      ["OUT", "PENDING", "PENDING"],
    ]);
  });

  // Absen masuk hanya sekali per hari (pemilik projek 2026-10-19): setelah masuk & pulang, aplikasi
  // tidak lagi menawarkan Clock In dan server menolak absen masuk kedua sejak pra-cek.
  test("sudah Clock In & Clock Out hari ini → langkah DONE; Clock In kedua ditolak", async () => {
    const today = await data<{ next: string }>(await call("GET", "/attendance/me/today", h.a));
    expect(today.next).toBe("DONE");
    const pre = await data<{ alreadyCheckedIn: boolean }>(
      await call("POST", "/attendance/precheck", h.a, { kind: "IN", ...SITE, accuracyM: 15 }),
    );
    expect(pre.alreadyCheckedIn).toBe(true);
    const again = await call("POST", "/attendance/punch", h.a, {
      kind: "IN",
      ...SITE,
      accuracyM: 15,
      selfiePath: await selfie(h.a),
      confirmed: true,
      reason: "Coba absen lagi",
    });
    expect(again.status).toBe(409);
  });

  test("tanpa roster: label NO_ROSTER; salah pencet bisa dibatalkan sendiri lalu absen ulang", async () => {
    const pre = await data<{ labels: string[] }>(
      await call("POST", "/attendance/precheck", h.b, { kind: "IN", ...SITE, accuracyM: 10 }),
    );
    expect(pre.labels).toContain("NO_ROSTER");
    const first = await data<{ id: string; punches: { id: string; canCancel: boolean }[] }>(
      await call("POST", "/attendance/punch", h.b, {
        kind: "IN",
        ...SITE,
        accuracyM: 10,
        selfiePath: await selfie(h.b),
        reason: "Lembur darurat",
      }),
    );
    const punchId = first.punches[0]?.id as string;
    expect(first.punches[0]?.canCancel).toBe(true);
    expect((await call("POST", `/attendance/punches/${punchId}/cancel`, h.a)).status).toBe(404);
    expect((await call("POST", `/attendance/punches/${punchId}/cancel`, h.b)).status).toBe(200);
    expect((await call("GET", `/attendance/days/${first.id}`, h.b)).status).toBe(404);
    const day = await data<{ status: string; labels: string[] }>(
      await call("POST", "/attendance/punch", h.b, {
        kind: "IN",
        ...SITE,
        accuracyM: 10,
        selfiePath: await selfie(h.b),
        reason: "Lembur darurat",
      }),
    );
    expect(day).toMatchObject({ status: "OPEN", labels: ["NO_ROSTER"] });
    // Masih Clock In → menekan Clock In lagi dianggap salah pencet.
    const again = await data<{ suspicion: string }>(
      await call("POST", "/attendance/precheck", h.b, { kind: "IN", ...SITE, accuracyM: 10 }),
    );
    expect(again.suspicion).toBe("IN_WHILE_OPEN");
  });
});

describe("approval per absen & data harian", () => {
  test("inbox atasan & HR memuat hari itu; karyawan lain tidak bisa melihat detail", async () => {
    const range = `from=${addDays(todayWita, -2)}&to=${addDays(todayWita, 2)}`;
    const mgrInbox = await data<{ id: string }[]>(
      await call("GET", `/attendance/days?scope=inbox&${range}`, h.mgr),
    );
    expect(mgrInbox.some((d) => d.id === dayId)).toBe(true);
    const hrInbox = await data<{ id: string }[]>(
      await call("GET", `/attendance/days?scope=inbox&labeledOnly=true&${range}`, h.hr),
    );
    expect(hrInbox.some((d) => d.id === dayId)).toBe(true);
    expect((await call("GET", `/attendance/days/${dayId}`, h.otherEmp)).status).toBe(404);
    expect((await call("GET", `/attendance/days/${dayId}`, h.a)).status).toBe(200);
  });

  test("masuk disetujui → hari tetap menunggu; pulang disetujui → APPROVED; roster terkunci", async () => {
    const approvalOf = async (kind: string) =>
      (
        await data<{ punches: { kind: string; approval: { id: string } }[] }>(
          await call("GET", `/attendance/days/${dayId}`, h.mgr),
        )
      ).punches.find((p) => p.kind === kind)?.approval.id as string;
    const approveBoth = async (requestId: string) => {
      for (const who of [h.mgr, h.hr]) {
        const r = await call("POST", `/approvals/${requestId}/decision`, who, {
          decision: "APPROVED",
        });
        expect(r.status).toBe(200);
      }
    };
    await approveBoth(await approvalOf("IN"));
    const mid = await data<{ status: string; punches: { kind: string; status: string }[] }>(
      await call("GET", `/attendance/days/${dayId}`, h.a),
    );
    expect(mid.status).toBe("PENDING");
    expect(mid.punches.find((p) => p.kind === "IN")?.status).toBe("APPROVED");
    await approveBoth(await approvalOf("OUT"));
    const after = await data<{ status: string; workDate: string }>(
      await call("GET", `/attendance/days/${dayId}`, h.a),
    );
    expect(after.status).toBe("APPROVED");
    const locked = await call("PUT", "/roster/cells", h.hr, {
      companyId,
      cells: [{ employeeId: emp.a, date: after.workDate, code: "OFF" }],
    });
    expect(locked.status).toBe(422);
  });

  test("autentikasi manual HR: jam masuk & pulang kemarin; langkah HR otomatis, atasan memutuskan", async () => {
    const yesterday = addDays(todayWita, -1);
    // Jam pulang manual membawa lokasi pilihan HR; jam masuk tanpa lokasi (kompatibel API lama).
    const manual = (who: Record<string, string>, kind: string, time: string) =>
      call("POST", "/attendance/manual", who, {
        employeeId: emp.a,
        workDate: yesterday,
        kind,
        time,
        reason: "HP rusak, absen dicatat pos jaga",
        ...(kind === "OUT" ? { workLocationId: ids.location } : {}),
      });
    expect((await manual(h.a, "IN", "07:00")).status).toBe(403);
    expect((await manual(h.hr, "OUT", "19:00")).status).toBe(422);
    expect((await manual(h.hr, "IN", "07:05")).status).toBe(200);
    const day = await data<{
      id: string;
      status: string;
      labels: string[];
      punches: {
        kind: string;
        source: string;
        at: string;
        location: { id: string; name: string } | null;
        latitude: number | null;
        insideGeofence: boolean;
        approval: { id: string; steps: { kind: string; decision: string }[] };
      }[];
    }>(await manual(h.hr, "OUT", "19:10"));
    const out = day.punches.find((p) => p.kind === "OUT");
    expect(out?.location).toEqual({ id: ids.location, name: `Site AT ${RUN}` });
    expect(out).toMatchObject({ latitude: SITE.latitude, insideGeofence: true });
    expect(day.punches.find((p) => p.kind === "IN")?.location).toBeNull();
    expect(day.status).toBe("PENDING");
    expect(day.labels).toContain("MANUAL");
    expect(day.punches.map((p) => p.source)).toEqual(["MANUAL", "MANUAL"]);
    expect(day.punches[0]?.at).toBe(localToIso(yesterday, "07:05"));
    for (const p of day.punches) {
      expect(p.approval.steps.find((s) => s.kind === "HR")?.decision).toBe("APPROVED");
      await call("POST", `/approvals/${p.approval.id}/decision`, h.mgr, { decision: "APPROVED" });
    }
    const after = await data<{ status: string }>(
      await call("GET", `/attendance/days/${day.id}`, h.a),
    );
    expect(after.status).toBe("APPROVED");
  });
});

describe("cron harian", () => {
  test("tanpa absen pulang lewat batas → NO_CHECKOUT, menunggu koreksi/input manual", async () => {
    await closeOverdueDays(new Date(Date.now() + 3 * 86_400_000), ids.employees);
    const days = await data<{ employee: { id: string }; status: string; labels: string[] }[]>(
      await call(
        "GET",
        `/attendance/me/history?from=${addDays(todayWita, -2)}&to=${addDays(todayWita, 2)}`,
        h.b,
      ),
    );
    expect(days[0]).toMatchObject({ status: "PENDING" });
    expect(days[0]?.labels).toContain("NO_CHECKOUT");
  });

  // Tanpa cron (lokal / cron belum terjadwal): hari lama yang menggantung tidak boleh tampil sebagai
  // absen yang sedang berjalan — dibuka aplikasi → ditutup NO_CHECKOUT, tombol kembali ke Clock In.
  test("hari OPEN lama lewat batas ditutup saat aplikasi dibuka; langkah berikutnya Clock In", async () => {
    const stale = await prisma.attendanceDay.create({
      data: {
        employeeId: emp.mgr,
        companyId,
        workDate: new Date(`${addDays(todayWita, -4)}T00:00:00Z`),
        status: "OPEN",
        labels: [],
        checkOutDeadline: new Date(Date.now() - 3 * 86_400_000),
      },
    });
    const today = await data<{ next: string; openDay: unknown }>(
      await call("GET", "/attendance/me/today", h.mgr),
    );
    expect(today).toMatchObject({ next: "IN", openDay: null });
    const after = await prisma.attendanceDay.findUnique({ where: { id: stale.id } });
    expect(after).toMatchObject({ status: "PENDING" });
    expect(after?.labels).toContain("NO_CHECKOUT");
  });

  test("selfie > masa simpan dihapus dari storage; data absen tetap", async () => {
    const result = await purgeSelfies(new Date(Date.now() + 400 * 86_400_000), ids.employees);
    expect(result.purged).toBeGreaterThanOrEqual(3);
    const day = await data<{ punches: { selfiePurged: boolean; selfieUrl: string | null }[] }>(
      await call("GET", `/attendance/days/${dayId}`, h.a),
    );
    expect(day.punches.every((p) => p.selfiePurged && p.selfieUrl === null)).toBe(true);
  });
});

function addDays(iso: string, n: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
