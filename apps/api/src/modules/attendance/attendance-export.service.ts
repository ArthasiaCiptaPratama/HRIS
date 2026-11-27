import {
  ATTENDANCE_DAY_STATUS_LABELS,
  ATTENDANCE_EXPORT_COLUMN_GROUPS,
  ATTENDANCE_EXPORT_DEFAULT_COLUMN_GROUPS,
  ATTENDANCE_EXPORT_MAX_BASE64_BYTES,
  ATTENDANCE_EXPORT_MAX_ROWS,
  ATTENDANCE_EXPORT_STATUSES,
  ATTENDANCE_EXPORT_TOO_LARGE,
  ATTENDANCE_LABEL_TEXT,
  type AttendanceExportColumnGroup,
  type AttendanceExportInput,
  type AttendanceExportStatus,
  attendanceExportEmployeeMode,
  attendanceExportFileName,
  buildWorkbook,
  formatClockTime,
  googleMapsUrl,
  PUNCH_KIND_LABELS,
  sheetName,
  type XlsxCell,
  type XlsxFormat,
  type XlsxSheet,
} from "@hris/shared";
import { hiddenFilter } from "../../core/access/index.ts";
import { writeAudit } from "../../core/audit.ts";
import { BusinessRuleError, ForbiddenError } from "../../core/errors.ts";
import type { Prisma } from "../../generated/prisma/client.ts";
import * as policy from "./attendance.policy.ts";
import * as repository from "./attendance.repository.ts";
import { localDate, offsetMinutes, type ShiftTimes, shiftWindow } from "./attendance-engine.ts";
import { type RequestContext, readTimeSettings, toDate, toIso } from "./calendar.service.ts";
import * as directory from "./directory.ts";
import * as roster from "./roster.repository.ts";

// TM-D31: ekspor Excel data absen — DETAIL (Ringkasan + satu sheet per crew, crew menurut keanggotaan pada
// tanggal itu) dan FLASH (7 kolom, urut tanggal). Baca-saja (tidak menandai Alpha), tanpa selfie/koordinat.
// TM-D34: DETAIL — mode karyawan (crew / karyawan tertentu / filter halaman), kelompok kolom, filter baris.

const LIMIT = `Data terlalu banyak untuk satu file (maks. ${ATTENDANCE_EXPORT_MAX_ROWS.toLocaleString("id-ID")} baris)`;
const TOO_MANY = `${LIMIT} — persempit rentang atau pilih lebih sedikit crew.`;
const TOO_MANY_FLASH = `${LIMIT} — persempit rentang atau pilih satu PT.`;
/** Hari roster dibaca paling banyak sekian sebelum disaring crew (pengaman memori). */
const ROSTER_READ_CAP = ATTENDANCE_EXPORT_MAX_ROWS * 5;
const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const NO_CREW = "Tanpa crew";
const SUMMARY = "Ringkasan";

const dmy = (iso: string) => iso.split("-").reverse().join("/");

// ── Bagian murni (diuji unit) ──────────────────────────────────────────────────

export interface ExportPunch {
  kind: string;
  at: Date;
  latitude: Prisma.Decimal | number | null;
  longitude: Prisma.Decimal | number | null;
  distanceM: number | null;
  workLocationId: string | null;
  insideGeofence: boolean;
  labels: string[];
  status: string;
  source: string;
  /** TM-D34: alasan karyawan/HR pada absen ini (kolom Alasan). */
  reason?: string | null;
}

/** Teks lokasi dari data sistem (tanpa layanan luar, tanpa angka koordinat). */
export function locationText(p: ExportPunch, siteName: (id: string) => string | undefined): string {
  const site = p.workLocationId ? siteName(p.workLocationId) : undefined;
  if (p.source === "MANUAL") return site ? `Input manual HR (${site})` : "Input manual HR";
  if (p.latitude === null || p.longitude === null) return "Tanpa lokasi";
  if (p.labels.includes("OTHER_LOCATION") && site) return `${site} (lokasi lain)`;
  if (p.insideGeofence && site) return `${site} (dalam radius)`;
  if (p.labels.includes("OUTSIDE_RADIUS")) {
    return site && p.distanceM !== null
      ? `${p.distanceM.toLocaleString("id-ID")} m dari ${site} (di luar radius)`
      : "Di luar radius";
  }
  // TM-D1 bebas lokasi: tidak pernah berlabel di luar radius; di luar semua site → tanpa site.
  return site ? site : "Bebas lokasi (di luar site)";
}

/** Sel "Peta": tautan Google Maps bila koordinat tercatat (URL saja; server tidak memanggil Google). */
export function mapCell(p: ExportPunch | undefined): XlsxCell {
  if (!p || p.latitude === null || p.longitude === null) return null;
  return {
    value: "Buka di Google Maps",
    link: googleMapsUrl(Number(p.latitude), Number(p.longitude)),
  };
}

export interface CrewRef {
  id: string;
  name: string;
  companyId: string;
  deleted: boolean;
}

/**
 * Label crew (kolom Crew) & nama sheet: crew dihapus diberi " (dihapus)"; nama kembar antar-PT diberi kode
 * PT; nama sheet ≤ 31 karakter, tanpa karakter terlarang, unik (tanpa beda huruf besar/kecil) dan tidak
 * memakai nama "Ringkasan" / "Tanpa crew".
 */
export function crewSheetNames(
  crews: CrewRef[],
  companyCode: (companyId: string) => string | undefined,
): Map<string, { label: string; sheet: string }> {
  const sameName = new Map<string, number>();
  for (const c of crews) {
    const key = c.name.trim().toLowerCase();
    sameName.set(key, (sameName.get(key) ?? 0) + 1);
  }
  const used = new Set([SUMMARY.toLowerCase(), NO_CREW.toLowerCase()]);
  const out = new Map<string, { label: string; sheet: string }>();
  const sorted = [...crews].sort(
    (a, b) => a.name.localeCompare(b.name, "id") || a.id.localeCompare(b.id),
  );
  for (const c of sorted) {
    const code =
      (sameName.get(c.name.trim().toLowerCase()) ?? 0) > 1 ? companyCode(c.companyId) : "";
    const base = code ? `${c.name} - ${code}` : c.name;
    const suffix = c.deleted ? " (dihapus)" : "";
    const label = `${base}${suffix}`;
    const fit = (tail: string) => `${sheetName(base).slice(0, 31 - tail.length)}${tail}`;
    let sheet = fit(suffix);
    for (let n = 2; used.has(sheet.toLowerCase()); n++) sheet = fit(`${suffix} (${n})`);
    used.add(sheet.toLowerCase());
    out.set(c.id, { label, sheet });
  }
  return out;
}

/** Baris DETAIL (satu karyawan × tanggal) sebelum menjadi sel Excel. */
export interface DetailRow {
  employeeId: string;
  nip: string;
  name: string;
  /** Jabatan & divisi SAAT INI (Identitas, TM-D34); tanpa data → "—". */
  position: string;
  division: string;
  date: string;
  crewId: string | null;
  crewLabel: string;
  shift: string;
  scheduledIn: string;
  scheduledOut: string;
  clockIn: string;
  locationIn: string;
  mapIn: XlsxCell;
  clockOut: string;
  locationOut: string;
  mapOut: XlsxCell;
  status: string;
  label: string;
  /** TM-D34: Persetujuan Clock In/Out (kosong bila tidak ada absen). */
  approvalIn: string;
  approvalOut: string;
  /** TM-D34: Mulai/Selesai istirahat (TM-D7). */
  breakStart: string;
  breakEnd: string;
  /** TM-D34: menit telat (berlabel LATE) / pulang cepat (berlabel EARLY_LEAVE); null = kosong. */
  lateMin: number | null;
  earlyMin: number | null;
  /** TM-D34: alasan per absen, "Clock In: …; Clock Out: …". */
  reason: string;
  /** TM-D34: kelompok status (filter baris). */
  bucket: AttendanceExportStatus;
  /** Untuk Ringkasan. */
  work: boolean;
  dayStatus: string | null;
  labelCodes: string[];
}

export interface SummaryCounts {
  workDays: number;
  present: number;
  pending: number;
  rejected: number;
  late: number;
  earlyLeave: number;
  alpha: number;
  leave: number;
  noRecord: number;
}

/**
 * Hitungan Ringkasan, sejalan dengan Rekap bulanan (`period.service` monthlyRecap): Hari kerja = hari roster
 * ber-shift; Hadir = hari DISETUJUI; Menunggu = OPEN/PENDING; Telat/Pulang cepat = berlabel; Tanpa absen = hari
 * kerja tanpa catatan absen sebelum hari ini (zona TM).
 */
export function summarize(rows: DetailRow[], today: string): SummaryCounts {
  const count = (fn: (r: DetailRow) => boolean) => rows.filter(fn).length;
  return {
    workDays: count((r) => r.work),
    present: count((r) => r.dayStatus === "APPROVED"),
    pending: count((r) => r.dayStatus === "OPEN" || r.dayStatus === "PENDING"),
    rejected: count((r) => r.dayStatus === "REJECTED"),
    late: count((r) => r.labelCodes.includes("LATE")),
    earlyLeave: count((r) => r.labelCodes.includes("EARLY_LEAVE")),
    alpha: count((r) => r.dayStatus === "ALPHA"),
    leave: count((r) => r.dayStatus === "LEAVE"),
    noRecord: count((r) => r.work && r.dayStatus === null && r.date < today),
  };
}

/** Status baris hari roster tanpa catatan absen. */
export function rosterOnlyStatus(
  day: { work: boolean; timeOff: boolean; date: string },
  today: string,
): string {
  if (!day.work) return day.timeOff ? "Time off" : "OFF";
  if (day.date < today) return "Tanpa absen";
  return day.date === today ? "Belum absen" : "Terjadwal";
}

/**
 * TM-D34: kelompok status baris (filter baris). Hari absen: OPEN/PENDING → PENDING, selebihnya sama;
 * tanpa hari absen: hari roster ber-shift → NO_RECORD (tanpa absen / belum absen / terjadwal), lainnya → OFF.
 */
export function statusBucket(dayStatus: string | null, work: boolean): AttendanceExportStatus {
  if (dayStatus === null) return work ? "NO_RECORD" : "OFF";
  if (dayStatus === "OPEN" || dayStatus === "PENDING") return "PENDING";
  return dayStatus as AttendanceExportStatus;
}

/** TM-D34: selisih menit bulat ke bawah, minimal 0. */
export const minutesBetween = (from: Date, to: Date) =>
  Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60_000));

/**
 * TM-D34 "Telat & pulang cepat": Telat = Clock In − jadwal masuk bila baris berlabel LATE (label diberi mesin
 * absen setelah toleransi shift; menit dihitung dari jam masuk jadwal, bukan dari batas toleransi); Pulang
 * cepat = jadwal pulang − Clock Out bila berlabel EARLY_LEAVE. Jadwal = jadwal terkunci hari absen (atau
 * roster). Tanpa label / tanpa absen / tanpa jadwal → null.
 */
export function lateEarly(input: {
  codes: string[];
  clockIn: Date | null | undefined;
  clockOut: Date | null | undefined;
  scheduledStart: Date | null | undefined;
  scheduledEnd: Date | null | undefined;
}): { lateMin: number | null; earlyMin: number | null } {
  const { codes, clockIn, clockOut, scheduledStart, scheduledEnd } = input;
  return {
    lateMin:
      codes.includes("LATE") && clockIn && scheduledStart
        ? minutesBetween(scheduledStart, clockIn)
        : null,
    earlyMin:
      codes.includes("EARLY_LEAVE") && clockOut && scheduledEnd
        ? minutesBetween(clockOut, scheduledEnd)
        : null,
  };
}

/** TM-D34: penjaga ukuran file (DETAIL & FLASH) — base64 melebihi batas → 422, tanpa mengubah data. */
export function assertExportSize(base64Length: number, max = ATTENDANCE_EXPORT_MAX_BASE64_BYTES) {
  if (base64Length > max) throw new BusinessRuleError(ATTENDANCE_EXPORT_TOO_LARGE);
}

const PUNCH_ORDER = ["IN", "BREAK_START", "BREAK_END", "OUT"] as const;
/** TM-D34: sel Alasan — alasan tiap absen yang terisi, urut Clock In → istirahat → Clock Out. */
export function reasonText(punches: { kind: string; reason?: string | null }[]): string {
  return PUNCH_ORDER.flatMap((kind) => {
    const reason = punches
      .find((p) => p.kind === kind)
      ?.reason?.replace(/\s+/g, " ")
      .trim();
    return reason ? [`${PUNCH_KIND_LABELS[kind]}: ${reason}`] : [];
  }).join("; ");
}

const PUNCH_STATUS_TEXT: Record<string, string> = {
  PENDING: "Menunggu",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
};
const punchStatusText = (status: string) => PUNCH_STATUS_TEXT[status] ?? status;

const labelText = (code: string) => (ATTENDANCE_LABEL_TEXT as Record<string, string>)[code] ?? code;
const statusText = (status: string) =>
  (ATTENDANCE_DAY_STATUS_LABELS as Record<string, string>)[status] ?? status;

// ── Pengambilan data ───────────────────────────────────────────────────────────

interface Scope {
  /** PT cakupan; null = semua PT (SA tanpa companyId). */
  companyIds: string[] | null;
  /** Karyawan untuk baris roster (MANAGER: tim langsung; HR/SA: karyawan PT cakupan). */
  employees: directory.DirectoryEmployee[];
  dayWhere: Prisma.AttendanceDayWhereInput;
  teamOnly: boolean;
}

async function resolveScope(ctx: RequestContext, input: AttendanceExportInput): Promise<Scope> {
  const actor = ctx.actor;
  if (!policy.canExportAttendance(actor, input.companyId)) throw new ForbiddenError();
  const range = { workDate: { gte: toDate(input.from), lte: toDate(input.to) } };
  if (actor.role === "MANAGER" && actor.employeeId) {
    const team = await directory.employeesByIds(await directory.teamIds(actor.employeeId));
    const employees = [...team.values()].filter(
      (e) => !input.companyId || e.companyId === input.companyId,
    );
    return {
      companyIds: input.companyId ? [input.companyId] : [...(actor.companyIds ?? [])],
      employees,
      dayWhere: {
        ...range,
        employeeId: { in: [...team.keys()] },
        ...(input.companyId ? { companyId: input.companyId } : {}),
      },
      teamOnly: true,
    };
  }
  const companyIds =
    actor.role === "SUPER_ADMIN"
      ? input.companyId
        ? [input.companyId]
        : null
      : input.companyId
        ? [input.companyId]
        : [...(actor.companyIds ?? [])];
  const employees = await directory.employeesInCompanies(ctx.actor, companyIds);
  if (employees === null) {
    throw new BusinessRuleError(
      `Karyawan dalam cakupan lebih dari ${directory.EMPLOYEE_LIST_CAP.toLocaleString("id-ID")} orang — pilih satu PT.`,
    );
  }
  return {
    companyIds,
    employees,
    dayWhere: {
      ...range,
      ...hiddenFilter(actor, "employeeId"),
      ...(companyIds ? { companyId: { in: companyIds } } : {}),
    },
    teamOnly: false,
  };
}

async function readDays(where: Prisma.AttendanceDayWhereInput, tooMany = TOO_MANY) {
  const days = await repository.exportDays(where, ATTENDANCE_EXPORT_MAX_ROWS + 1);
  if (days.length > ATTENDANCE_EXPORT_MAX_ROWS) throw new BusinessRuleError(tooMany);
  return days;
}

/** Nama & NIP semua karyawan yang muncul (karyawan cakupan + pemilik hari absen, termasuk yang keluar). */
async function people(scope: Scope, extraIds: string[]) {
  const map = new Map(scope.employees.map((e) => [e.id, e]));
  const missing = [...new Set(extraIds)].filter((id) => !map.has(id));
  for (const [id, e] of await directory.employeesByIds(missing)) map.set(id, e);
  return map;
}

interface Settings {
  timezone: string;
  offset: number;
  today: string;
}

async function settings(now: Date): Promise<Settings> {
  const { timezone } = await readTimeSettings();
  return { timezone, offset: offsetMinutes(timezone), today: localDate(now, timezone) };
}

/** Judul & baris keterangan (tanpa data pribadi pengekspor). */
async function header(
  input: AttendanceExportInput,
  scope: Scope,
  s: Settings,
  now: Date,
): Promise<string[]> {
  const companies = await directory.companyNames();
  const pt = scope.companyIds
    ? scope.companyIds.map((id) => companies.get(id)?.name ?? "—").join(", ") || "—"
    : "Semua PT";
  const generated = formatClockTime(now, localDate(now, s.timezone), s.offset);
  return [
    `PT: ${pt}${scope.teamOnly ? " · Cakupan: bawahan langsung" : ""}`,
    `Periode: ${dmy(input.from)} – ${dmy(input.to)} · Jam dalam zona ${s.timezone}`,
    `Dibuat: ${dmy(localDate(now, s.timezone))} ${generated}`,
  ];
}

// ── DETAIL ─────────────────────────────────────────────────────────────────────

type DetailInput = Extract<AttendanceExportInput, { kind: "DETAIL" }>;

async function assertCrews(input: DetailInput, scope: Scope) {
  if (!input.crewIds) return;
  const ids = [...new Set(input.crewIds)];
  const found = await roster.crewsForExport(ids);
  const ok =
    found.length === ids.length &&
    found.every(
      (c) =>
        c.deletedAt === null &&
        (scope.companyIds === null || scope.companyIds.includes(c.companyId)),
    );
  if (!ok) {
    throw new BusinessRuleError("Crew yang dipilih tidak ditemukan atau di luar cakupan Anda.");
  }
}

const OUT_OF_SCOPE_EMPLOYEES = "Karyawan yang dipilih tidak ditemukan atau di luar cakupan Anda.";

/**
 * TM-D34: karyawan terpilih (null = tidak dibatasi). EMPLOYEES: setiap id harus karyawan cakupan atau punya
 * ≥1 hari absen dalam cakupan & rentang (karyawan pindah PT), selain itu satu 422 tanpa nama. PAGE_FILTER:
 * pencocokan nama/NIK sama dengan `listDays` `q`; cakupan tetap dari `scope`.
 */
async function pickedEmployees(input: DetailInput, scope: Scope): Promise<Set<string> | null> {
  const mode = attendanceExportEmployeeMode(input);
  if (mode === "EMPLOYEES") {
    const ids = [...new Set(input.employeeIds)];
    const known = new Set(scope.employees.map((e) => e.id));
    const rest = ids.filter((id) => !known.has(id));
    const owners = await repository.exportDayOwners(scope.dayWhere, rest);
    if (owners.length !== rest.length) throw new BusinessRuleError(OUT_OF_SCOPE_EMPLOYEES);
    return new Set(ids);
  }
  if (mode === "PAGE_FILTER") {
    const q = input.q?.trim();
    return q ? new Set(await directory.employeeIdsMatching(q)) : null;
  }
  return null;
}

async function detailRows(input: DetailInput, scope: Scope, s: Settings) {
  await assertCrews(input, scope);
  const byCrew = attendanceExportEmployeeMode(input) === "CREW";
  const pick = await pickedEmployees(input, scope);
  const from = toDate(input.from);
  const to = toDate(input.to);
  const days = await readDays(
    pick ? { AND: [scope.dayWhere, { employeeId: { in: [...pick] } }] } : scope.dayWhere,
  );
  const rosterIds = scope.employees.map((e) => e.id).filter((id) => !pick || pick.has(id));
  const allIds = [...new Set([...rosterIds, ...days.map((d) => d.employeeId)])];
  const allMemberships = allIds.length
    ? await roster.crewMembershipsForExport(allIds, from, to)
    : [];
  type Membership = (typeof allMemberships)[number];
  const inScope = (companyId: string) =>
    scope.companyIds === null || scope.companyIds.includes(companyId);
  // Keanggotaan crew di luar PT cakupan dibuang (karyawan pindah PT: nama crew PT lama tidak bocor).
  const memberships = allMemberships.filter((m) => inScope(m.crew.companyId));
  const pickCrew = (list: Membership[], employeeId: string, date: string) => {
    let best: Membership | undefined;
    for (const m of list) {
      if (m.employeeId !== employeeId) continue;
      if (toIso(m.startDate) > date || (m.endDate && toIso(m.endDate) < date)) continue;
      // Keanggotaan tumpang-tindih (data rusak): yang mulai paling akhir menang.
      if (!best || m.startDate > best.startDate) best = m;
    }
    return best?.crew ?? null;
  };
  const crewOf = (employeeId: string, date: string) => pickCrew(memberships, employeeId, date);
  const chosen = input.crewIds ? new Set(input.crewIds) : null;
  // Mode karyawan tertentu / filter halaman: semua crew & tanpa crew.
  const keep = (crewId: string | null) =>
    !byCrew ||
    (crewId === null ? input.includeNoCrew === true : chosen === null || chosen.has(crewId));
  // Baris roster hanya untuk karyawan yang punya keanggotaan pada crew terpilih (atau semua bila Tanpa crew).
  const rosterCandidates =
    chosen && !input.includeNoCrew
      ? rosterIds.filter((id) =>
          memberships.some((m) => m.employeeId === id && chosen.has(m.crew.id)),
        )
      : rosterIds;
  const rosterRaw = rosterCandidates.length
    ? await roster.rosterDaysForExport(rosterCandidates, from, to, ROSTER_READ_CAP + 1)
    : [];
  if (rosterRaw.length > ROSTER_READ_CAP) throw new BusinessRuleError(TOO_MANY);
  // Baris roster di luar PT cakupan dibuang (shift/crew PT lama milik karyawan yang pindah PT).
  const crewCompany = new Map<string, string>();
  if (scope.companyIds !== null) {
    const crewIds = [...new Set(rosterRaw.flatMap((r) => (r.crewId ? [r.crewId] : [])))];
    if (crewIds.length) {
      for (const c of await roster.crewsForExport(crewIds)) crewCompany.set(c.id, c.companyId);
    }
  }
  const rosterDays = rosterRaw.filter((r) => {
    if (scope.companyIds === null) return true;
    if (r.shift) return inScope(r.shift.companyId);
    if (r.crewId) {
      const company = crewCompany.get(r.crewId);
      return company !== undefined && inScope(company);
    }
    // Tanpa shift & crew (OFF/Time off manual): dibuang hanya bila keanggotaan crew pada tanggal itu di luar PT.
    const covering = pickCrew(allMemberships, r.employeeId, toIso(r.workDate));
    return covering === null || inScope(covering.companyId);
  });

  type Cell = {
    employeeId: string;
    date: string;
    roster?: (typeof rosterDays)[number];
    day?: (typeof days)[number];
  };
  const cells = new Map<string, Cell>();
  const cellOf = (employeeId: string, date: string) => {
    const key = `${employeeId}|${date}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = { employeeId, date };
      cells.set(key, cell);
    }
    return cell;
  };
  for (const r of rosterDays) cellOf(r.employeeId, toIso(r.workDate)).roster = r;
  for (const d of days) cellOf(d.employeeId, toIso(d.workDate)).day = d;

  const facts = (cell: Cell) => {
    const pin = cell.day?.punches.find((p) => p.kind === "IN");
    const pout = cell.day?.punches.find((p) => p.kind === "OUT");
    const codes = cell.day
      ? [...new Set([...cell.day.labels, ...(pin?.labels ?? []), ...(pout?.labels ?? [])])]
      : [];
    const extra = [
      ...(pin?.status === "REJECTED" ? ["Clock In ditolak"] : []),
      ...(pout?.status === "REJECTED" ? ["Clock Out ditolak"] : []),
    ];
    const work = (cell.roster?.shift ?? null) !== null;
    return { pin, pout, codes, extra, work, bucket: statusBucket(cell.day?.status ?? null, work) };
  };
  // TM-D34 filter baris: status (bawaan semua) & hanya berlabel (= sel Label tidak kosong).
  const wanted = new Set<AttendanceExportStatus>(input.statuses ?? ATTENDANCE_EXPORT_STATUSES);
  const selected = [...cells.values()]
    .map((cell) => ({ cell, crew: crewOf(cell.employeeId, cell.date), ...facts(cell) }))
    .filter(
      (x) =>
        keep(x.crew?.id ?? null) &&
        wanted.has(x.bucket) &&
        (!input.labeledOnly || x.codes.length + x.extra.length > 0),
    );
  if (selected.length > ATTENDANCE_EXPORT_MAX_ROWS) throw new BusinessRuleError(TOO_MANY);

  const employeeIds = [...new Set(selected.map((x) => x.cell.employeeId))];
  const [persons, companies, locations, placements] = await Promise.all([
    people(scope, employeeIds),
    directory.companyNames(),
    directory.locationsByIds(
      selected.flatMap(({ pin, pout }) =>
        [pin, pout].flatMap((p) => (p?.workLocationId ? [p.workLocationId] : [])),
      ),
    ),
    // Jabatan & divisi = penempatan SAAT INI (sama dengan Flash).
    directory.positionPlacementByEmployee(employeeIds),
  ]);
  const crewRefs = new Map<string, CrewRef>();
  for (const { crew } of selected) {
    if (crew) {
      crewRefs.set(crew.id, {
        id: crew.id,
        name: crew.name,
        companyId: crew.companyId,
        deleted: crew.deletedAt !== null,
      });
    }
  }
  // Crew terpilih tetap mendapat sheet walau kosong.
  if (chosen) {
    for (const m of memberships) {
      if (chosen.has(m.crew.id) && !crewRefs.has(m.crew.id)) {
        crewRefs.set(m.crew.id, {
          id: m.crew.id,
          name: m.crew.name,
          companyId: m.crew.companyId,
          deleted: m.crew.deletedAt !== null,
        });
      }
    }
  }
  const names = crewSheetNames([...crewRefs.values()], (id) => companies.get(id)?.code);
  const siteName = (id: string) => locations.get(id)?.name;
  const clock = (at: Date | null | undefined, date: string) =>
    at ? formatClockTime(at, date, s.offset) : "";

  const rows: DetailRow[] = selected.map(
    ({ cell, crew, pin, pout, codes, extra, work, bucket }) => {
      const person = persons.get(cell.employeeId);
      const place = placements.get(cell.employeeId);
      const { day, roster: r } = cell;
      const shift = r?.shift ?? null;
      const window = shift ? shiftWindow(cell.date, shift as ShiftTimes, s.timezone) : null;
      const scheduledStart = day?.scheduledStart ?? window?.start;
      const scheduledEnd = day?.scheduledEnd ?? window?.end;
      const punches = day?.punches ?? [];
      const breakStart = punches.find((p) => p.kind === "BREAK_START");
      const breakEnd = punches.find((p) => p.kind === "BREAK_END");
      return {
        employeeId: cell.employeeId,
        nip: person?.employeeNumber ?? "",
        name: person?.fullName ?? "—",
        position: place?.position ?? "—",
        division: place?.division ?? "—",
        date: cell.date,
        crewId: crew?.id ?? null,
        crewLabel: crew ? (names.get(crew.id)?.label ?? crew.name) : NO_CREW,
        shift: day?.shiftCode ?? shift?.code ?? (r ? (r.timeOff ? "TO" : "OFF") : ""),
        scheduledIn: clock(scheduledStart, cell.date),
        scheduledOut: clock(scheduledEnd, cell.date),
        clockIn: clock(pin?.at, cell.date),
        locationIn: pin ? locationText(pin, siteName) : "",
        mapIn: mapCell(pin),
        clockOut: clock(pout?.at, cell.date),
        locationOut: pout ? locationText(pout, siteName) : "",
        mapOut: mapCell(pout),
        status: day
          ? statusText(day.status)
          : rosterOnlyStatus({ work, timeOff: r?.timeOff ?? false, date: cell.date }, s.today),
        label: [...codes.map(labelText), ...extra].join(", "),
        approvalIn: pin ? punchStatusText(pin.status) : "",
        approvalOut: pout ? punchStatusText(pout.status) : "",
        breakStart: clock(breakStart?.at, cell.date),
        breakEnd: clock(breakEnd?.at, cell.date),
        ...lateEarly({
          codes,
          clockIn: pin?.at,
          clockOut: pout?.at,
          scheduledStart,
          scheduledEnd,
        }),
        reason: reasonText(punches),
        bucket,
        work,
        dayStatus: day?.status ?? null,
        labelCodes: codes,
      };
    },
  );
  return { rows, names, crewRefs };
}

type ColumnGroup = AttendanceExportColumnGroup | "IDENTITY";
interface DetailColumn {
  header: string;
  group: ColumnGroup;
  format?: XlsxFormat;
  cell: (r: DetailRow) => XlsxCell;
}
/**
 * Kolom sheet crew (TM-D34): Identitas selalu, kelompok lain sesuai pilihan. Kelompok bawaan menghasilkan
 * kolom Detail TM-D31 (+ Jabatan & Divisi) dengan urutan yang sama.
 */
const DETAIL_COLUMNS: DetailColumn[] = [
  { header: "NIP", group: "IDENTITY", format: "text", cell: (r) => r.nip },
  { header: "Nama", group: "IDENTITY", format: "text", cell: (r) => r.name },
  { header: "Jabatan", group: "IDENTITY", format: "text", cell: (r) => r.position },
  { header: "Divisi", group: "IDENTITY", format: "text", cell: (r) => r.division },
  { header: "Crew", group: "IDENTITY", format: "text", cell: (r) => r.crewLabel },
  { header: "Tanggal", group: "IDENTITY", format: "date", cell: (r) => toDate(r.date) },
  { header: "Hari", group: "IDENTITY", cell: (r) => DAY_NAMES[toDate(r.date).getUTCDay()] },
  { header: "Shift", group: "SCHEDULE", cell: (r) => r.shift },
  { header: "Jadwal Masuk", group: "SCHEDULE", cell: (r) => r.scheduledIn },
  { header: "Jadwal Pulang", group: "SCHEDULE", cell: (r) => r.scheduledOut },
  { header: "Clock In", group: "CLOCK", cell: (r) => r.clockIn },
  { header: "Lokasi Clock In", group: "LOCATION", cell: (r) => r.locationIn },
  { header: "Peta In", group: "LOCATION", cell: (r) => r.mapIn },
  { header: "Persetujuan Clock In", group: "APPROVAL", cell: (r) => r.approvalIn },
  { header: "Mulai istirahat", group: "BREAK", cell: (r) => r.breakStart },
  { header: "Selesai istirahat", group: "BREAK", cell: (r) => r.breakEnd },
  { header: "Clock Out", group: "CLOCK", cell: (r) => r.clockOut },
  { header: "Lokasi Clock Out", group: "LOCATION", cell: (r) => r.locationOut },
  { header: "Peta Out", group: "LOCATION", cell: (r) => r.mapOut },
  { header: "Persetujuan Clock Out", group: "APPROVAL", cell: (r) => r.approvalOut },
  { header: "Telat (menit)", group: "LATE_EARLY", format: "int", cell: (r) => r.lateMin },
  { header: "Pulang cepat (menit)", group: "LATE_EARLY", format: "int", cell: (r) => r.earlyMin },
  { header: "Status", group: "CLOCK", cell: (r) => r.status },
  { header: "Label", group: "LABEL", cell: (r) => r.label },
  { header: "Alasan", group: "REASON", cell: (r) => r.reason },
];

/** Kolom sheet crew untuk kelompok terpilih (Identitas selalu). */
export function detailColumns(groups: ReadonlySet<AttendanceExportColumnGroup>): DetailColumn[] {
  return DETAIL_COLUMNS.filter((c) => c.group === "IDENTITY" || groups.has(c.group));
}

const DEFAULT_GROUPS: ReadonlySet<AttendanceExportColumnGroup> = new Set(
  ATTENDANCE_EXPORT_DEFAULT_COLUMN_GROUPS,
);
const EMPTY_SHEET = "Data Absen";
const SUMMARY_HEADER = [
  "NIP",
  "Nama",
  "Crew",
  "Hari kerja",
  "Hadir (disetujui)",
  "Menunggu",
  "Ditolak",
  "Telat",
  "Pulang cepat",
  "Alpha",
  "Cuti/izin/sakit",
  "Tanpa absen",
];
const SUMMARY_NOTES = [
  "Definisi sama dengan Rekap bulanan: Hari kerja = hari roster ber-shift; Hadir = hari absen disetujui; Menunggu = belum absen pulang / menunggu persetujuan;",
  "Telat & Pulang cepat = hari berlabel; Tanpa absen = hari kerja tanpa catatan absen sebelum hari ini. Bedanya: ekspor tidak menandai Alpha baru dan ikut menghitung karyawan yang sudah keluar.",
  "Karyawan yang pindah crew di tengah rentang tampil sekali per crew.",
];

const byName = (a: DetailRow, b: DetailRow) =>
  a.name.localeCompare(b.name, "id") ||
  a.nip.localeCompare(b.nip) ||
  a.employeeId.localeCompare(b.employeeId);

export function detailSheets(
  rows: DetailRow[],
  names: Map<string, { label: string; sheet: string }>,
  crewOrder: string[],
  includeNoCrew: boolean,
  info: string[],
  today: string,
  groups: ReadonlySet<AttendanceExportColumnGroup> = DEFAULT_GROUPS,
): XlsxSheet[] {
  const columns = detailColumns(groups);
  const perEmployeeCrew = new Map<string, DetailRow[]>();
  for (const r of rows) {
    const key = `${r.employeeId}|${r.crewId ?? ""}`;
    const list = perEmployeeCrew.get(key) ?? [];
    list.push(r);
    perEmployeeCrew.set(key, list);
  }
  const summaryRows = [...perEmployeeCrew.values()]
    .map((list) => ({ first: list[0] as DetailRow, counts: summarize(list, today) }))
    .sort(
      (a, b) =>
        byName(a.first, b.first) || a.first.crewLabel.localeCompare(b.first.crewLabel, "id"),
    );
  const summary: XlsxSheet = {
    name: SUMMARY,
    title: "Ringkasan Data Absen",
    info,
    rows: [
      SUMMARY_HEADER,
      ...summaryRows.map(({ first, counts: c }) => [
        first.nip,
        first.name,
        first.crewLabel,
        c.workDays,
        c.present,
        c.pending,
        c.rejected,
        c.late,
        c.earlyLeave,
        c.alpha,
        c.leave,
        c.noRecord,
      ]),
    ],
    formats: ["text", "text", "text", ...Array(9).fill("int")],
    freezeColumns: 2,
    notes: SUMMARY_NOTES,
  };
  const sheetOf = (title: string, name: string, list: DetailRow[]): XlsxSheet => ({
    name,
    title,
    info,
    rows: [
      columns.map((c) => c.header),
      ...[...list]
        .sort((a, b) => byName(a, b) || a.date.localeCompare(b.date))
        .map((r) => columns.map((c) => c.cell(r))),
    ],
    formats: columns.map((c) => c.format),
    freezeColumns: 2,
  });
  const sheets = groups.has("SUMMARY") ? [summary] : [];
  for (const crewId of crewOrder) {
    const n = names.get(crewId);
    if (!n) continue;
    sheets.push(
      sheetOf(
        `Data Absen — Crew ${n.label}`,
        n.sheet,
        rows.filter((r) => r.crewId === crewId),
      ),
    );
  }
  if (includeNoCrew) {
    sheets.push(
      sheetOf(
        `Data Absen — ${NO_CREW}`,
        NO_CREW,
        rows.filter((r) => r.crewId === null),
      ),
    );
  }
  // Tanpa Ringkasan dan tanpa baris sama sekali: tetap satu sheet berisi header.
  if (sheets.length === 0) sheets.push(sheetOf("Data Absen", EMPTY_SHEET, []));
  return sheets;
}

// ── FLASH ──────────────────────────────────────────────────────────────────────

async function flashSheet(scope: Scope, s: Settings, info: string[]) {
  const days = await readDays(scope.dayWhere, TOO_MANY_FLASH);
  const persons = await people(
    scope,
    days.map((d) => d.employeeId),
  );
  // Jabatan & divisi = penempatan SAAT INI (bukan riwayat); tanpa divisi → "—".
  const placements = await directory.positionPlacementByEmployee(days.map((d) => d.employeeId));
  const rows = days
    .map((d) => {
      const date = toIso(d.workDate);
      const place = placements.get(d.employeeId);
      const pin = d.punches.find((p) => p.kind === "IN");
      const pout = d.punches.find((p) => p.kind === "OUT");
      return {
        name: persons.get(d.employeeId)?.fullName ?? "—",
        id: d.employeeId,
        position: place?.position ?? "—",
        division: place?.division ?? "—",
        date,
        clockIn: pin ? formatClockTime(pin.at, date, s.offset) : "",
        clockOut: pout ? formatClockTime(pout.at, date, s.offset) : "",
        status: statusText(d.status),
      };
    })
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.name.localeCompare(b.name, "id") ||
        a.id.localeCompare(b.id),
    );
  const sheet: XlsxSheet = {
    name: "Absensi",
    title: "Data Absen (Flash)",
    info,
    rows: [
      ["Nama", "Jabatan", "Divisi", "Tanggal", "Clock In", "Clock Out", "Status"],
      ...rows.map((r) => [
        r.name,
        r.position,
        r.division,
        toDate(r.date),
        r.clockIn,
        r.clockOut,
        r.status,
      ]),
    ],
    formats: ["text", "text", "text", "date", "text", "text", "text"],
    freezeColumns: 1,
  };
  return { sheet, rows: rows.length };
}

// ── Endpoint ───────────────────────────────────────────────────────────────────

export interface AttendanceExportFile {
  fileName: string;
  rows: number;
  contentBase64: string;
}

export async function exportAttendance(
  ctx: RequestContext,
  input: AttendanceExportInput,
  now = new Date(),
): Promise<AttendanceExportFile> {
  const scope = await resolveScope(ctx, input);
  const s = await settings(now);
  const info = await header(input, scope, s, now);
  let sheets: XlsxSheet[];
  let rows: number;
  let crewCount = 0;
  let detailAudit: Record<string, unknown> = {};
  if (input.kind === "DETAIL") {
    const detail = await detailRows(input, scope, s);
    const order = [...detail.names.entries()]
      .sort((a, b) => a[1].sheet.localeCompare(b[1].sheet, "id"))
      .map(([id]) => id);
    const mode = attendanceExportEmployeeMode(input);
    const groups = new Set(input.columnGroups ?? ATTENDANCE_EXPORT_DEFAULT_COLUMN_GROUPS);
    sheets = detailSheets(
      detail.rows,
      detail.names,
      order,
      // Mode crew: sheet "Tanpa crew" sesuai pilihan; mode lain: hanya bila ada barisnya.
      mode === "CREW" ? input.includeNoCrew === true : detail.rows.some((r) => r.crewId === null),
      info,
      s.today,
      groups,
    );
    rows = detail.rows.length;
    crewCount = order.length;
    const statuses = new Set(input.statuses ?? ATTENDANCE_EXPORT_STATUSES);
    // Tanpa data pribadi: tanpa q (bisa memuat NIK) dan tanpa id karyawan.
    detailAudit = {
      mode,
      columnGroups: ATTENDANCE_EXPORT_COLUMN_GROUPS.filter((g) => groups.has(g)),
      statuses: ATTENDANCE_EXPORT_STATUSES.filter((x) => statuses.has(x)),
      labeledOnly: input.labeledOnly === true,
      employeeCount: new Set(detail.rows.map((r) => r.employeeId)).size,
    };
  } else {
    const flash = await flashSheet(scope, s, info);
    sheets = [flash.sheet];
    rows = flash.rows;
  }
  const bytes = buildWorkbook(sheets, { title: "Data Absen", creator: "HRIS Arthasia" }, now);
  const contentBase64 = Buffer.from(bytes).toString("base64");
  // Sebelum audit: file yang ditolak tidak tercatat sebagai ekspor.
  assertExportSize(contentBase64.length);
  // Audit tanpa data pribadi: hanya parameter & jumlah.
  await writeAudit({
    actorAccountId: ctx.actor.accountId,
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
    action: "attendance.export",
    entityType: "attendance.day",
    entityId: null,
    after: {
      kind: input.kind,
      from: input.from,
      to: input.to,
      companyId: input.companyId ?? null,
      crewCount,
      rows,
      ...detailAudit,
    },
  });
  return {
    fileName: attendanceExportFileName(input),
    rows,
    contentBase64,
  };
}
