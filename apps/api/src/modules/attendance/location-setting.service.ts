import type {
  AttendanceLocationInput,
  AttendanceLocationMode,
  AttendanceLocationSource,
} from "@hris/shared";
import { writeAudit } from "../../core/audit.ts";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../../core/errors.ts";
import * as policy from "./attendance.policy.ts";
import { type RequestContext, readTimeSettings, toDate } from "./calendar.service.ts";
import * as directory from "./directory.ts";
import * as repository from "./location-setting.repository.ts";

// TM-D1 — lokasi absen per karyawan. Prioritas site absen:
//   1. bebas lokasi (PLAN §5.4) → geofence tidak dicek, koordinat tetap dicatat;
//   2. lokasi absen khusus → mengalahkan lokasi crew & lokasi kerja;
//   3. bawaan: lokasi crew pada tanggal kerja → lokasi kerja karyawan.

export interface ResolvedLocation {
  locationId: string | null;
  anywhere: boolean;
  source: AttendanceLocationSource;
}

function resolve(
  setting: repository.LocationSettingRow | undefined | null,
  crewLocationId: string | undefined,
  employeeLocationId: string | null,
): ResolvedLocation {
  if (setting?.anywhere) return { locationId: null, anywhere: true, source: "ANYWHERE" };
  if (setting?.workLocationId) {
    return { locationId: setting.workLocationId, anywhere: false, source: "CUSTOM" };
  }
  if (crewLocationId) return { locationId: crewLocationId, anywhere: false, source: "CREW" };
  if (employeeLocationId) {
    return { locationId: employeeLocationId, anywhere: false, source: "EMPLOYEE" };
  }
  return { locationId: null, anywhere: false, source: "NONE" };
}

/** Site absen yang berlaku untuk seorang karyawan pada tanggal kerja (dipakai mesin absen). */
export async function resolveAttendanceLocation(
  employee: Pick<directory.DirectoryEmployee, "id" | "workLocationId">,
  workDate: string,
): Promise<ResolvedLocation> {
  const [setting, crews] = await Promise.all([
    repository.findSetting(employee.id),
    repository.crewLocationsOn([employee.id], toDate(workDate)),
  ]);
  return resolve(setting, crews.get(employee.id)?.workLocationId, employee.workLocationId);
}

const modeOf = (setting: repository.LocationSettingRow | undefined): AttendanceLocationMode =>
  setting?.anywhere ? "ANYWHERE" : setting?.workLocationId ? "LOCATION" : "DEFAULT";

const todayIn = (timezone: string, now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);

export interface LocationOption {
  id: string;
  name: string;
  city: string | null;
  radiusM: number | null;
}

export interface EmployeeLocationRow {
  employeeId: string;
  fullName: string;
  employeeNumber: string | null;
  mode: AttendanceLocationMode;
  /** Lokasi absen khusus (mode LOCATION). */
  customLocation: { id: string; name: string } | null;
  /** Site yang berlaku hari ini beserta asalnya. */
  effective: {
    source: AttendanceLocationSource;
    location: { id: string; name: string; hasGeofence: boolean } | null;
    crewName: string | null;
  };
  updatedAt: string | null;
}

export interface LocationSettingsView {
  date: string;
  /** Pilihan lokasi absen khusus: hanya lokasi aktif dengan geofence lengkap. */
  locations: LocationOption[];
  employees: EmployeeLocationRow[];
}

/** Daftar karyawan aktif PT + pengaturan & site efektif hari ini (SA, HR PT). */
export async function listLocationSettings(
  ctx: RequestContext,
  companyId: string,
  q?: string,
): Promise<LocationSettingsView> {
  if (!policy.canManageAttendanceLocation(ctx.actor, companyId)) throw new ForbiddenError();
  const settings = await readTimeSettings();
  const date = todayIn(settings.timezone);
  const employees = await directory.activeEmployeesInCompany(companyId, q?.trim() || undefined);
  const ids = employees.map((e) => e.id);
  const [settingMap, crews, geofenced] = await Promise.all([
    repository.settingsFor(ids),
    repository.crewLocationsOn(ids, toDate(date)),
    directory.geofencedLocations(),
  ]);

  const resolved = employees.map((e) => ({
    employee: e,
    setting: settingMap.get(e.id),
    crew: crews.get(e.id),
  }));
  const locationIds = resolved.flatMap(({ employee, setting, crew }) =>
    [setting?.workLocationId, crew?.workLocationId, employee.workLocationId].filter(
      (id): id is string => typeof id === "string",
    ),
  );
  const names = await directory.locationsByIds(locationIds);
  const named = (id: string | null | undefined) => {
    const loc = id ? names.get(id) : undefined;
    return loc ? { id: loc.id, name: loc.name } : null;
  };

  return {
    date,
    locations: geofenced
      .map((l) => ({ id: l.id, name: l.name, city: l.city, radiusM: l.radiusM }))
      .sort((a, b) => a.name.localeCompare(b.name, "id")),
    employees: resolved.map(({ employee, setting, crew }) => {
      const effective = resolve(setting, crew?.workLocationId, employee.workLocationId);
      const loc = effective.locationId ? names.get(effective.locationId) : undefined;
      return {
        employeeId: employee.id,
        fullName: employee.fullName,
        employeeNumber: employee.employeeNumber,
        mode: modeOf(setting),
        customLocation: named(setting?.workLocationId),
        effective: {
          source: effective.source,
          location: loc
            ? {
                id: loc.id,
                name: loc.name,
                hasGeofence:
                  loc.latitude !== null && loc.longitude !== null && loc.radiusM !== null,
              }
            : null,
          crewName: effective.source === "CREW" ? (crew?.crewName ?? null) : null,
        },
        updatedAt: setting ? setting.updatedAt.toISOString() : null,
      };
    }),
  };
}

/** Terapkan mode lokasi absen ke banyak karyawan (SA, HR PT). Satu audit per karyawan yang berubah. */
export async function setLocationSettings(
  ctx: RequestContext,
  input: AttendanceLocationInput,
): Promise<{ updated: number }> {
  const ids = [...new Set(input.employeeIds)];
  const employees = await directory.employeesByIds(ids);
  if (employees.size !== ids.length) throw new NotFoundError("Sebagian karyawan tidak ditemukan.");
  for (const employee of employees.values()) {
    if (!policy.canManageAttendanceLocation(ctx.actor, employee.companyId)) {
      throw new ForbiddenError();
    }
  }

  let value: { workLocationId: string | null; anywhere: boolean } | null = null;
  if (input.mode === "ANYWHERE") value = { workLocationId: null, anywhere: true };
  if (input.mode === "LOCATION") {
    const location = (await directory.geofencedLocations()).find(
      (l) => l.id === input.workLocationId,
    );
    if (!location) {
      throw new BusinessRuleError(
        "Lokasi tidak ditemukan atau belum punya titik & radius geofence (atur di Master Data › Lokasi Kerja).",
      );
    }
    value = { workLocationId: location.id, anywhere: false };
  }

  const before = await repository.settingsFor(ids);
  await repository.applySettings(ids, value, ctx.actor.accountId);

  const snapshot = (s: { workLocationId: string | null; anywhere: boolean } | null | undefined) =>
    s ? { mode: s.anywhere ? "ANYWHERE" : "LOCATION", workLocationId: s.workLocationId } : null;
  let updated = 0;
  for (const id of ids) {
    const prev = snapshot(before.get(id));
    const next = snapshot(value);
    if (JSON.stringify(prev) === JSON.stringify(next)) continue;
    updated += 1;
    await writeAudit({
      actorAccountId: ctx.actor.accountId,
      action: "attendance.location_setting.update",
      entityType: "attendance.employee_location_setting",
      entityId: id,
      before: prev ?? { mode: "DEFAULT" },
      after: next ?? { mode: "DEFAULT" },
      requestId: ctx.requestId ?? null,
      ip: ctx.ip ?? null,
    });
  }
  return { updated };
}
