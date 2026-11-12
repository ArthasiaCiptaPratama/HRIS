import type { MasterLookup } from "../organization/index.ts";
import type { EmployeeTx } from "./employee.repository.ts";
import * as repository from "./homebase.repository.ts";

// EMP-D6: bantuan riwayat homebase (Point of Hire) yang dipakai employee.service (tambah karyawan,
// detail) dan onboarding-review (approve calon). Tidak mengimpor employee.service supaya tanpa siklus.

const toIso = (date: Date) => date.toISOString().slice(0, 10);
const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Teks EMP-D5 field `homebase`: "<Nama> (berlaku YYYY-MM-DD)". */
export function homebaseChangeText(
  lookup: MasterLookup,
  entry: { homebaseId: string; effectiveFrom: Date } | null,
): string | null {
  if (!entry) return null;
  const name = lookup.homebases.get(entry.homebaseId)?.name ?? "—";
  return `${name} (berlaku ${toIso(entry.effectiveFrom)})`;
}

/** Homebase awal berlaku mulai tanggal masuk; tanggal masuk di masa depan → hari ini (WIB). */
export function initialEffectiveFrom(joinDate: string | Date, today: string): string {
  const join = typeof joinDate === "string" ? joinDate : toIso(joinDate);
  return join > today ? today : join;
}

/**
 * Tulis homebase awal (tambah karyawan / approve onboarding) lalu set kolom turunan, di transaksi
 * pemanggil. Bila sudah ada baris di tanggal yang sama, homebase-nya diganti (bukan baris kembar).
 */
export async function writeInitialHomebase(
  tx: EmployeeTx,
  input: {
    employeeId: string;
    homebaseId: string;
    effectiveFrom: string;
    changedBy: string | null;
  },
) {
  const effectiveFrom = toDate(input.effectiveFrom);
  const existing = await repository.findEntryOnDate(tx, input.employeeId, effectiveFrom);
  const entry = existing
    ? await repository.updateEntry(tx, existing.id, { homebaseId: input.homebaseId })
    : await repository.createEntry(tx, {
        employeeId: input.employeeId,
        homebaseId: input.homebaseId,
        effectiveFrom,
        decreeNumber: null,
        note: null,
        changedBy: input.changedBy,
      });
  await repository.syncCurrentHomebase(tx, input.employeeId);
  return entry;
}

export interface HomebaseEntryDto<C> {
  id: string;
  homebase: { id: string; name: string; city: string | null; province: string | null };
  effectiveFrom: string;
  decreeNumber: string | null;
  note: string | null;
  changedBy: C | null;
  createdAt: string;
}

/** Baris riwayat → DTO (nama homebase dari master, termasuk yang diarsip). */
export function toHomebaseEntry<C>(
  row: repository.HomebaseEntryRow,
  lookup: MasterLookup,
  changers: Map<string, C>,
): HomebaseEntryDto<C> {
  const homebase = lookup.homebases.get(row.homebaseId);
  return {
    id: row.id,
    homebase: {
      id: row.homebaseId,
      name: homebase?.name ?? "—",
      city: homebase?.city ?? null,
      province: homebase?.province ?? null,
    },
    effectiveFrom: toIso(row.effectiveFrom),
    decreeNumber: row.decreeNumber,
    note: row.note,
    changedBy: row.changedBy ? (changers.get(row.changedBy) ?? null) : null,
    createdAt: row.createdAt.toISOString(),
  };
}
