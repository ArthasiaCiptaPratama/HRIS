import {
  ATTENDANCE_DAY_STATUS_LABELS,
  ATTENDANCE_EXPORT_MAX_ROWS,
  ATTENDANCE_LABEL_TEXT,
  type AttendanceExportInput,
  attendanceExportFileName,
  buildWorkbook,
  formatClockTime,
  googleMapsUrl,
  sheetName,
  type XlsxCell,
  type XlsxSheet,
} from "@hris/shared";
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
// tanggal itu) dan FLASH (5 kolom, urut tanggal). Baca-saja (tidak menandai Alpha), tanpa selfie/koordinat.

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
  const employees = await directory.employeesInCompanies(companyIds);
  if (employees === null) {
    throw new BusinessRuleError(
      `Karyawan dalam cakupan lebih dari ${directory.EMPLOYEE_LIST_CAP.toLocaleString("id-ID")} orang — pilih satu PT.`,
    );
  }
  return {
    companyIds,
    employees,
    dayWhere: { ...range, ...(companyIds ? { companyId: { in: companyIds } } : {}) },
    teamOnly: false,
  };
}

async function readDays(scope: Scope, tooMany = TOO_MANY) {
  const days = await repository.exportDays(scope.dayWhere, ATTENDANCE_EXPORT_MAX_ROWS + 1);
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

async function detailRows(input: DetailInput, scope: Scope, s: Settings) {
  await assertCrews(input, scope);
  const from = toDate(input.from);
  const to = toDate(input.to);
  const days = await readDays(scope);
  const rosterIds = scope.employees.map((e) => e.id);
  const allIds = [...new Set([...rosterIds, ...days.map((d) => d.employeeId)])];
  const memberships = allIds.length ? await roster.crewMembershipsForExport(allIds, from, to) : [];
  const crewOf = (employeeId: string, date: string) => {
    let best: (typeof memberships)[number] | undefined;
    for (const m of memberships) {
      if (m.employeeId !== employeeId) continue;
      if (toIso(m.startDate) > date || (m.endDate && toIso(m.endDate) < date)) continue;
      // Keanggotaan tumpang-tindih (data rusak): yang mulai paling akhir menang.
      if (!best || m.startDate > best.startDate) best = m;
    }
    return best?.crew ?? null;
  };
  const chosen = input.crewIds ? new Set(input.crewIds) : null;
  const keep = (crewId: string | null) =>
    crewId === null ? input.includeNoCrew === true : chosen === null || chosen.has(crewId);
  // Baris roster hanya untuk karyawan yang punya keanggotaan pada crew terpilih (atau semua bila Tanpa crew).
  const rosterCandidates =
    chosen && !input.includeNoCrew
      ? rosterIds.filter((id) =>
          memberships.some((m) => m.employeeId === id && chosen.has(m.crew.id)),
        )
      : rosterIds;
  const rosterDays = rosterCandidates.length
    ? await roster.rosterDaysForExport(rosterCandidates, from, to, ROSTER_READ_CAP + 1)
    : [];
  if (rosterDays.length > ROSTER_READ_CAP) throw new BusinessRuleError(TOO_MANY);

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

  const selected = [...cells.values()]
    .map((cell) => ({ cell, crew: crewOf(cell.employeeId, cell.date) }))
    .filter(({ crew }) => keep(crew?.id ?? null));
  if (selected.length > ATTENDANCE_EXPORT_MAX_ROWS) throw new BusinessRuleError(TOO_MANY);

  const [persons, companies, locations] = await Promise.all([
    people(
      scope,
      selected.map((x) => x.cell.employeeId),
    ),
    directory.companyNames(),
    directory.locationsByIds(
      selected.flatMap(({ cell }) =>
        (cell.day?.punches ?? []).flatMap((p) => (p.workLocationId ? [p.workLocationId] : [])),
      ),
    ),
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

  const rows: DetailRow[] = selected.map(({ cell, crew }) => {
    const person = persons.get(cell.employeeId);
    const { day, roster: r } = cell;
    const shift = r?.shift ?? null;
    const window = shift ? shiftWindow(cell.date, shift as ShiftTimes, s.timezone) : null;
    const pin = day?.punches.find((p) => p.kind === "IN");
    const pout = day?.punches.find((p) => p.kind === "OUT");
    const codes = day
      ? [...new Set([...day.labels, ...(pin?.labels ?? []), ...(pout?.labels ?? [])])]
      : [];
    const extra = [
      ...(pin?.status === "REJECTED" ? ["Clock In ditolak"] : []),
      ...(pout?.status === "REJECTED" ? ["Clock Out ditolak"] : []),
    ];
    const work = shift !== null;
    return {
      employeeId: cell.employeeId,
      nip: person?.employeeNumber ?? "",
      name: person?.fullName ?? "—",
      date: cell.date,
      crewId: crew?.id ?? null,
      crewLabel: crew ? (names.get(crew.id)?.label ?? crew.name) : NO_CREW,
      shift: day?.shiftCode ?? shift?.code ?? (r ? (r.timeOff ? "TO" : "OFF") : ""),
      scheduledIn: clock(day?.scheduledStart ?? window?.start, cell.date),
      scheduledOut: clock(day?.scheduledEnd ?? window?.end, cell.date),
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
      work,
      dayStatus: day?.status ?? null,
      labelCodes: codes,
    };
  });
  return { rows, names, crewRefs };
}

const DETAIL_HEADER = [
  "NIP",
  "Nama",
  "Crew",
  "Tanggal",
  "Hari",
  "Shift",
  "Jadwal Masuk",
  "Jadwal Pulang",
  "Clock In",
  "Lokasi Clock In",
  "Peta In",
  "Clock Out",
  "Lokasi Clock Out",
  "Peta Out",
  "Status",
  "Label",
];
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
): XlsxSheet[] {
  const groups = new Map<string, DetailRow[]>();
  for (const r of rows) {
    const key = `${r.employeeId}|${r.crewId ?? ""}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  const summaryRows = [...groups.values()]
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
      DETAIL_HEADER,
      ...[...list]
        .sort((a, b) => byName(a, b) || a.date.localeCompare(b.date))
        .map((r) => [
          r.nip,
          r.name,
          r.crewLabel,
          toDate(r.date),
          DAY_NAMES[toDate(r.date).getUTCDay()],
          r.shift,
          r.scheduledIn,
          r.scheduledOut,
          r.clockIn,
          r.locationIn,
          r.mapIn,
          r.clockOut,
          r.locationOut,
          r.mapOut,
          r.status,
          r.label,
        ]),
    ],
    formats: ["text", "text", "text", "date"],
    freezeColumns: 2,
  });
  const sheets = [summary];
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
  return sheets;
}

// ── FLASH ──────────────────────────────────────────────────────────────────────

async function flashSheet(scope: Scope, s: Settings, info: string[]) {
  const days = await readDays(scope, TOO_MANY_FLASH);
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
  if (input.kind === "DETAIL") {
    const detail = await detailRows(input, scope, s);
    const order = [...detail.names.entries()]
      .sort((a, b) => a[1].sheet.localeCompare(b[1].sheet, "id"))
      .map(([id]) => id);
    sheets = detailSheets(
      detail.rows,
      detail.names,
      order,
      input.includeNoCrew === true,
      info,
      s.today,
    );
    rows = detail.rows.length;
    crewCount = order.length;
  } else {
    const flash = await flashSheet(scope, s, info);
    sheets = [flash.sheet];
    rows = flash.rows;
  }
  const bytes = buildWorkbook(sheets, { title: "Data Absen", creator: "HRIS Arthasia" }, now);
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
    },
  });
  return {
    fileName: attendanceExportFileName(input),
    rows,
    contentBase64: Buffer.from(bytes).toString("base64"),
  };
}
