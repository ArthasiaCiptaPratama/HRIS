import type { EmploymentCategory } from "@hris/shared";
import type { Actor } from "../../core/access/index.ts";
import { type AuditEntry, writeAudit } from "../../core/audit.ts";
import { ForbiddenError } from "../../core/errors.ts";
import * as policy from "./organization.policy.ts";
import * as repository from "./organization.repository.ts";
import type {
  CompanyDto,
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
  companies: Map<string, CompanyDto & { deleted: boolean }>;
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
    companies: toMap(
      data.companies.map(({ isActive, deletedAt, ...rest }) => ({
        ...rest,
        deletedAt: isActive ? deletedAt : (deletedAt ?? new Date(0)),
      })),
    ),
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
    // D-040: pilihan perusahaan hanya yang dalam cakupan aktor (SUPER_ADMIN semua).
    companies: active(lookup.companies).filter(
      (company) => actor.companyIds === null || actor.companyIds.has(company.id),
    ),
    departments: active(lookup.departments),
    positions: active(lookup.positions),
    employmentStatuses: active(lookup.statuses),
    grades: active(lookup.grades),
    workLocations: active(lookup.locations),
  };
}

// ── D-042: master data untuk import karyawan ──────────────────────────────────
// Nama dicocokkan tanpa peka huruf besar/kecil & spasi. Yang belum ada dibuat (HR boleh MENAMBAH lewat
// import, D-042 poin 4), di dalam transaksi pemanggil, dengan audit per entitas.

export const masterKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
export const positionKey = (department: string, name: string) =>
  `${masterKey(department)}|${masterKey(name)}`;

export interface MasterDataNames {
  departments: string[];
  positions: { department: string; name: string }[];
  grades: string[];
  workLocations: string[];
}

/** Id master data aktif per kunci nama (departemen, jabatan per departemen, grade, lokasi). */
export function masterIndex(lookup: MasterLookup) {
  const live = <T extends { deleted: boolean }>(map: Map<string, T>) =>
    [...map.values()].filter((row) => !row.deleted);
  const departments = new Map(live(lookup.departments).map((d) => [masterKey(d.name), d.id]));
  const departmentName = new Map(live(lookup.departments).map((d) => [d.id, d.name]));
  const positions = new Map(
    live(lookup.positions).map((p) => [
      positionKey(departmentName.get(p.departmentId) ?? "", p.name),
      p.id,
    ]),
  );
  return {
    departments,
    positions,
    grades: new Map(live(lookup.grades).map((g) => [masterKey(g.name), g.id])),
    workLocations: new Map(live(lookup.locations).map((l) => [masterKey(l.name), l.id])),
  };
}

/**
 * D-049: kunci nama yang hanya ada di ARSIP (tidak ada padanan aktif). Import tidak boleh membuat item
 * baru bernama sama (nama unik termasuk arsip) dan tidak boleh diam-diam memulihkannya.
 */
export function archivedMasterIndex(lookup: MasterLookup) {
  const live = masterIndex(lookup);
  const keys = <T extends { name: string; deleted: boolean }>(
    map: Map<string, T>,
    active: Map<string, string>,
    key: (row: T) => string = (row) => masterKey(row.name),
  ) =>
    new Set(
      [...map.values()]
        .filter((row) => row.deleted)
        .map(key)
        .filter((k) => !active.has(k)),
    );
  const departmentName = new Map([...lookup.departments.values()].map((d) => [d.id, d.name]));
  return {
    departments: keys(lookup.departments, live.departments),
    positions: keys(lookup.positions, live.positions, (p) =>
      positionKey(departmentName.get(p.departmentId) ?? "", p.name),
    ),
    grades: keys(lookup.grades, live.grades),
    workLocations: keys(lookup.locations, live.workLocations),
  };
}

/** Nama yang belum ada di master data (unik, bentuk tulisan pertama yang ditemukan dipertahankan). */
export function missingMasterData(lookup: MasterLookup, names: MasterDataNames): MasterDataNames {
  const index = masterIndex(lookup);
  const unique = (values: string[], known: Map<string, string>) => {
    const seen = new Map<string, string>();
    for (const value of values) {
      const key = masterKey(value);
      if (!known.has(key) && !seen.has(key)) seen.set(key, value.trim());
    }
    return [...seen.values()];
  };
  const positions = new Map<string, { department: string; name: string }>();
  for (const p of names.positions) {
    const key = positionKey(p.department, p.name);
    if (!index.positions.has(key) && !positions.has(key))
      positions.set(key, { department: p.department.trim(), name: p.name.trim() });
  }
  return {
    departments: unique(names.departments, index.departments),
    positions: [...positions.values()],
    grades: unique(names.grades, index.grades),
    workLocations: unique(names.workLocations, index.workLocations),
  };
}

/** Buat master data yang belum ada; kembalikan indeks lengkap (lama + baru) untuk dipakai pemanggil. */
export async function createMissingMasterData(
  tx: repository.OrganizationTx,
  lookup: MasterLookup,
  missing: MasterDataNames,
  audit: Omit<AuditEntry, "action" | "entityType" | "entityId" | "after">,
) {
  const index = masterIndex(lookup);
  const log = (entity: string, id: string, name: string) =>
    writeAudit(
      {
        ...audit,
        action: `organization.${entity}.create`,
        entityType: `organization.${entity}`,
        entityId: id,
        after: { name, source: "import" },
      },
      tx,
    );
  for (const name of missing.departments) {
    const row = await repository.createDepartment(tx, name);
    index.departments.set(masterKey(name), row.id);
    await log("department", row.id, name);
  }
  for (const p of missing.positions) {
    const departmentId = index.departments.get(masterKey(p.department));
    if (!departmentId) continue; // departemen wajib ada/dibuat lebih dulu (dijaga pemanggil)
    const row = await repository.createPosition(tx, departmentId, p.name);
    index.positions.set(positionKey(p.department, p.name), row.id);
    await log("position", row.id, p.name);
  }
  for (const name of missing.grades) {
    const row = await repository.createGrade(tx, name);
    index.grades.set(masterKey(name), row.id);
    await log("grade", row.id, name);
  }
  for (const name of missing.workLocations) {
    const row = await repository.createWorkLocation(tx, name);
    index.workLocations.set(masterKey(name), row.id);
    await log("work_location", row.id, name);
  }
  return index;
}
