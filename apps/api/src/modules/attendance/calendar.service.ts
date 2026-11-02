import {
  DEFAULT_TIME_SETTINGS,
  type HolidayInput,
  OFFICIAL_HOLIDAYS_ID,
  type TimeSettings,
  timeSettingsSchema,
} from "@hris/shared";
import type { Actor } from "../../core/access/index.ts";
import { writeAudit } from "../../core/audit.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "../../core/errors.ts";
import * as policy from "./attendance.policy.ts";
import { localDate } from "./attendance-engine.ts";
import * as repository from "./calendar.repository.ts";

// Tahap A: kalender libur (D-072) & pengaturan Time Management.

export interface RequestContext {
  actor: Actor;
  requestId?: string | undefined;
  ip?: string | undefined;
}

export const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
export const toIso = (date: Date) => date.toISOString().slice(0, 10);

export interface HolidayDto {
  id: string;
  date: string;
  name: string;
  kind: "NATIONAL" | "COLLECTIVE_LEAVE";
}

const toDto = (row: {
  id: string;
  date: Date;
  name: string;
  kind: HolidayDto["kind"];
}): HolidayDto => ({
  id: row.id,
  date: toIso(row.date),
  name: row.name,
  kind: row.kind,
});

type Snapshot = Record<string, unknown> | null;
const audit = (
  ctx: RequestContext,
  action: string,
  entityId: string,
  before: Snapshot,
  after: Snapshot,
) =>
  writeAudit({
    actorAccountId: ctx.actor.accountId,
    action,
    entityType: "attendance.holiday",
    entityId,
    before,
    after,
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
  });

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

export async function listHolidays(ctx: RequestContext, year: number): Promise<HolidayDto[]> {
  if (!policy.canReadHolidays(ctx.actor)) throw new ForbiddenError();
  const rows = await repository.listHolidays(toDate(`${year}-01-01`), toDate(`${year}-12-31`));
  return rows.map(toDto);
}

/** Libur dalam rentang (dipakai roster, absensi, cuti — modul attendance & leave). */
export async function holidaysBetween(from: string, to: string): Promise<Map<string, HolidayDto>> {
  const rows = await repository.listHolidays(toDate(from), toDate(to));
  return new Map(rows.map((row) => [toIso(row.date), toDto(row)]));
}

export async function createHoliday(ctx: RequestContext, input: HolidayInput): Promise<HolidayDto> {
  if (!policy.canManageHolidays(ctx.actor)) throw new ForbiddenError();
  try {
    const row = await repository.createHoliday({ ...input, date: toDate(input.date) });
    await audit(ctx, "attendance.holiday.create", row.id, null, input);
    return toDto(row);
  } catch (error) {
    if (isUniqueViolation(error))
      throw new ConflictError("Tanggal itu sudah ada di kalender libur.");
    throw error;
  }
}

/** Tahun yang punya data libur resmi bawaan (SKB 3 Menteri). */
export const officialHolidayYears = () => Object.keys(OFFICIAL_HOLIDAYS_ID).map(Number);

/** Isi kalender dari data resmi SKB 3 Menteri; tanggal yang sudah diisi SA tidak ditimpa. */
export async function importOfficialHolidays(
  ctx: RequestContext,
  year: number,
): Promise<{ year: number; added: number; skipped: number; total: number }> {
  if (!policy.canManageHolidays(ctx.actor)) throw new ForbiddenError();
  const list = OFFICIAL_HOLIDAYS_ID[year];
  if (!list) throw new NotFoundError(`Belum ada data libur resmi untuk tahun ${year}.`);
  const result = await repository.createHolidays(
    list.map((h) => ({ date: toDate(h.date), name: h.name, kind: h.kind })),
  );
  await audit(ctx, "attendance.holiday.import_official", `official-${year}`, null, {
    year,
    added: result.count,
  });
  return { year, added: result.count, skipped: list.length - result.count, total: list.length };
}

export async function updateHoliday(
  ctx: RequestContext,
  id: string,
  input: HolidayInput,
): Promise<HolidayDto> {
  if (!policy.canManageHolidays(ctx.actor)) throw new ForbiddenError();
  const before = await repository.findHoliday(id);
  if (!before) throw new NotFoundError();
  try {
    const row = await repository.updateHoliday(id, { ...input, date: toDate(input.date) });
    await audit(ctx, "attendance.holiday.update", id, { ...toDto(before) }, input);
    return toDto(row);
  } catch (error) {
    if (isUniqueViolation(error))
      throw new ConflictError("Tanggal itu sudah ada di kalender libur.");
    throw error;
  }
}

export async function deleteHoliday(ctx: RequestContext, id: string): Promise<{ id: string }> {
  if (!policy.canManageHolidays(ctx.actor)) throw new ForbiddenError();
  const before = await repository.findHoliday(id);
  if (!before) throw new NotFoundError();
  await repository.deleteHoliday(id);
  await audit(ctx, "attendance.holiday.delete", id, { ...toDto(before) }, null);
  return { id };
}

// ── Pengaturan ─────────────────────────────────────────────────────────────────

const SETTINGS_KEY = "attendance";

/** Pengaturan efektif (bawaan + yang tersimpan). Nilai tersimpan yang tidak valid diabaikan per kunci. */
export async function readTimeSettings(tx?: repository.CalendarTx): Promise<TimeSettings> {
  const row = await repository.findSetting(SETTINGS_KEY, tx);
  const merged = { ...DEFAULT_TIME_SETTINGS, ...((row?.value as object | null) ?? {}) };
  const parsed = timeSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_TIME_SETTINGS;
}

/** Tanggal "hari ini" (YYYY-MM-DD) di zona pengaturan TM — batas hari roster, periode, koreksi & cuti. */
export async function settingsToday(now = new Date(), tx?: repository.CalendarTx): Promise<string> {
  return localDate(now, (await readTimeSettings(tx)).timezone);
}

export async function getTimeSettings(ctx: RequestContext): Promise<TimeSettings> {
  if (!policy.canReadTimeSettings(ctx.actor)) throw new ForbiddenError();
  return readTimeSettings();
}

export async function updateTimeSettings(
  ctx: RequestContext,
  input: TimeSettings,
): Promise<TimeSettings> {
  if (!policy.canManageTimeSettings(ctx.actor)) throw new ForbiddenError();
  const before = await readTimeSettings();
  await repository.upsertSetting(SETTINGS_KEY, input, ctx.actor.accountId);
  await writeAudit({
    actorAccountId: ctx.actor.accountId,
    action: "attendance.settings.update",
    entityType: "attendance.time_settings",
    entityId: null,
    before,
    after: input,
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
  });
  return input;
}
