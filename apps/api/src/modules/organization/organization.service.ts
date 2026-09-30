import type { EmploymentCategory } from "@hris/shared";
import type { Actor } from "../../core/access/index.ts";
import { ForbiddenError } from "../../core/errors.ts";
import * as policy from "./organization.policy.ts";
import * as repository from "./organization.repository.ts";
import type {
  DepartmentDto,
  EmploymentStatusDto,
  GradeDto,
  PositionDto,
  WorkLocationDto,
} from "./organization.schema.ts";

type Row<T> = T & { deletedAt: Date | null };

/**
 * Peta master data untuk modul lain (lewat index.ts). Baris yang di-soft delete tetap ada
 * (`deleted: true`) supaya data lama tetap punya nama, tapi tidak boleh dipilih untuk data baru.
 */
export interface MasterLookup {
  departments: Map<string, DepartmentDto & { deleted: boolean }>;
  positions: Map<string, PositionDto & { deleted: boolean }>;
  statuses: Map<string, EmploymentStatusDto & { deleted: boolean }>;
  grades: Map<string, GradeDto & { deleted: boolean }>;
  locations: Map<string, WorkLocationDto & { deleted: boolean }>;
}

function toMap<T extends { id: string }>(rows: Row<T>[]) {
  return new Map(
    rows.map(({ deletedAt, ...rest }) => [rest.id, { ...rest, deleted: deletedAt !== null }]),
  ) as unknown as Map<string, T & { deleted: boolean }>;
}

export async function getMasterLookup(): Promise<MasterLookup> {
  const data = await repository.loadMasterData();
  return {
    departments: toMap(data.departments),
    positions: toMap(data.positions),
    statuses: toMap(data.statuses),
    grades: toMap(data.grades),
    locations: toMap(data.locations),
  };
}

/** Id status kepegawaian (termasuk yang di-soft delete) untuk kategori navigasi (D-035, grup D-038). */
export function statusIdsForCategories(
  lookup: MasterLookup,
  categories: readonly EmploymentCategory[],
): string[] {
  return [...lookup.statuses.values()]
    .filter((s) => s.category !== null && categories.includes(s.category))
    .map((s) => s.id);
}

export function positionIdsInDepartment(lookup: MasterLookup, departmentId: string): string[] {
  return [...lookup.positions.values()]
    .filter((p) => p.departmentId === departmentId)
    .map((p) => p.id);
}

const active = <T extends { deleted: boolean }>(map: Map<string, T>) =>
  [...map.values()].filter((row) => !row.deleted).map(({ deleted: _deleted, ...rest }) => rest);

function assertCanRead(actor: Actor) {
  if (!policy.canReadMasterData(actor)) throw new ForbiddenError();
}

export async function listMasterData(actor: Actor) {
  assertCanRead(actor);
  const lookup = await getMasterLookup();
  return {
    departments: active(lookup.departments),
    positions: active(lookup.positions),
    employmentStatuses: active(lookup.statuses),
    grades: active(lookup.grades),
    workLocations: active(lookup.locations),
  };
}
