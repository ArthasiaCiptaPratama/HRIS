import type { EmployeeHomebaseInput, EmployeeHomebaseUpdate } from "@hris/shared";
import { writeAudit } from "../../core/audit.ts";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../core/errors.ts";
import { getMasterLookup, type MasterLookup } from "../organization/index.ts";
import * as policy from "./employee.policy.ts";
import * as employeeRepo from "./employee.repository.ts";
import type { EmployeeHomebaseEntry } from "./employee.schema.ts";
import {
  auditBase,
  employeeTargetOf,
  loadInScope,
  type RequestContext,
  resolveChangers,
  todayInJakarta,
} from "./employee.service.ts";
import { recordFieldChanges } from "./field-change.ts";
import * as repository from "./homebase.repository.ts";
import { homebaseChangeText, toHomebaseEntry } from "./homebase-history.ts";

// EMP-D6: riwayat homebase (Point of Hire) per karyawan. Data kerja: dibaca siapa saja yang boleh melihat
// detail karyawan; ditulis hanya SA/HR sesuai cakupan PT (sama dengan ubah data kerja), bukan data sendiri.

const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);

async function toDtos(
  rows: repository.HomebaseEntryRow[],
  lookup: MasterLookup,
): Promise<EmployeeHomebaseEntry[]> {
  const changers = await resolveChangers(
    rows.map((row) => row.changedBy),
    lookup,
  );
  return rows.map((row) => toHomebaseEntry(row, lookup, changers));
}

export async function listEmployeeHomebases(
  ctx: RequestContext,
  id: string,
): Promise<EmployeeHomebaseEntry[]> {
  await loadInScope(ctx, id);
  const lookup = await getMasterLookup();
  return toDtos(await repository.listEntries(id), lookup);
}

// ── Tulis ───────────────────────────────────────────────────────────────────

function assertCanManage(ctx: RequestContext) {
  if (!policy.canManageEmployees(ctx.actor)) throw new ForbiddenError();
}

/** Karyawan dalam cakupan, bukan data sendiri lewat jalur HR, dan masih aktif (pola updateEmployee). */
async function loadWritable(ctx: RequestContext, id: string, tx: employeeRepo.EmployeeTx) {
  const row = await loadInScope(ctx, id, tx);
  if (!policy.canUpdateEmployee(ctx.actor, employeeTargetOf(row))) {
    throw new ForbiddenError(
      "Anda tidak boleh mengubah data kepegawaian milik sendiri lewat jalur HR.",
    );
  }
  if (!row.isActive) {
    throw new BusinessRuleError(
      "Data karyawan nonaktif hanya arsip. Aktifkan kembali untuk mengubah.",
    );
  }
  return row;
}

function assertNotFuture(effectiveFrom: string, now: Date) {
  if (effectiveFrom > todayInJakarta(now)) {
    throw new ValidationError(
      [
        {
          path: "effectiveFrom",
          message: "Tanggal berlaku tidak boleh di masa depan.",
        },
      ],
      "Tanggal berlaku tidak boleh di masa depan.",
    );
  }
}

/** Homebase yang dipilih harus ada dan belum diarsipkan (pola assertRefs). */
function assertActiveHomebase(lookup: MasterLookup, homebaseId: string) {
  const row = lookup.homebases.get(homebaseId);
  if (!row || row.deleted) {
    throw new BusinessRuleError("Homebase tidak ditemukan atau sudah tidak dipakai.");
  }
}

const DUPLICATE_DATE =
  "Sudah ada homebase yang berlaku pada tanggal itu. Ubah baris tersebut saja.";

async function assertDateFree(
  tx: employeeRepo.EmployeeTx,
  employeeId: string,
  effectiveFrom: Date,
  exceptId?: string,
) {
  const existing = await repository.findEntryOnDate(tx, employeeId, effectiveFrom);
  if (existing && existing.id !== exceptId) throw new ConflictError(DUPLICATE_DATE);
}

/** P2002 (unik karyawan+tanggal, balapan dua request) → 409. */
function rethrowDuplicate(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
    throw new ConflictError(DUPLICATE_DATE);
  }
  throw error;
}

function auditOf(
  ctx: RequestContext,
  employeeId: string,
  action: "create" | "update" | "delete",
  extra: { before?: Record<string, unknown>; after?: Record<string, unknown> },
) {
  return {
    ...auditBase(ctx),
    action: `employee.homebase.${action}`,
    entityId: employeeId,
    before: extra.before ?? null,
    after: extra.after ?? null,
  };
}

const auditEntry = (entry: { id: string; homebaseId: string; effectiveFrom: Date }) => ({
  entryId: entry.id,
  homebaseId: entry.homebaseId,
  effectiveFrom: toIso(entry.effectiveFrom),
});

export async function addEmployeeHomebase(
  ctx: RequestContext,
  id: string,
  input: EmployeeHomebaseInput,
  now = new Date(),
): Promise<EmployeeHomebaseEntry> {
  assertCanManage(ctx);
  assertNotFuture(input.effectiveFrom, now);
  const lookup = await getMasterLookup();
  assertActiveHomebase(lookup, input.homebaseId);
  const effectiveFrom = toDate(input.effectiveFrom);
  const entry = await employeeRepo
    .withTransaction(async (tx) => {
      await loadWritable(ctx, id, tx);
      await assertDateFree(tx, id, effectiveFrom);
      const current = await repository.findLatestEntry(tx, id);
      // 1) baris riwayat → 2) kolom turunan → 3) audit → 4) EMP-D5.
      const created = await repository.createEntry(tx, {
        employeeId: id,
        homebaseId: input.homebaseId,
        effectiveFrom,
        decreeNumber: input.decreeNumber ?? null,
        note: input.note ?? null,
        changedBy: ctx.actor.accountId,
      });
      await repository.syncCurrentHomebase(tx, id);
      await writeAudit(auditOf(ctx, id, "create", { after: auditEntry(created) }), tx);
      await recordFieldChanges(tx, {
        employeeId: id,
        actorAccountId: ctx.actor.accountId,
        source: "HR_FORM",
        refId: created.id,
        changes: [
          {
            section: "WORK",
            field: "homebase",
            // EMP-D5: homebase yang berlaku sebelum → sesudah (tanggal mundur = tidak berubah, tidak dicatat).
            oldValue: homebaseChangeText(lookup, current),
            newValue: homebaseChangeText(lookup, await repository.findLatestEntry(tx, id)),
          },
        ],
      });
      return created;
    })
    .catch(rethrowDuplicate);
  const [dto] = await toDtos([entry], lookup);
  return dto as EmployeeHomebaseEntry;
}

export async function updateEmployeeHomebase(
  ctx: RequestContext,
  id: string,
  entryId: string,
  input: EmployeeHomebaseUpdate,
  now = new Date(),
): Promise<EmployeeHomebaseEntry> {
  assertCanManage(ctx);
  if (input.effectiveFrom !== undefined) assertNotFuture(input.effectiveFrom, now);
  const lookup = await getMasterLookup();
  const entry = await employeeRepo
    .withTransaction(async (tx) => {
      await loadWritable(ctx, id, tx);
      const before = await repository.findEntry(tx, id, entryId);
      if (!before) throw new NotFoundError("Riwayat homebase tidak ditemukan.");
      // Nilai lama yang sudah diarsipkan boleh tetap dipakai bila homebase-nya tidak diubah.
      if (input.homebaseId !== undefined && input.homebaseId !== before.homebaseId) {
        assertActiveHomebase(lookup, input.homebaseId);
      }
      const current = await repository.findLatestEntry(tx, id);
      const effectiveFrom =
        input.effectiveFrom !== undefined ? toDate(input.effectiveFrom) : undefined;
      if (effectiveFrom && effectiveFrom.getTime() !== before.effectiveFrom.getTime()) {
        await assertDateFree(tx, id, effectiveFrom, entryId);
      }
      const after = await repository.updateEntry(tx, entryId, {
        ...(input.homebaseId !== undefined ? { homebaseId: input.homebaseId } : {}),
        ...(effectiveFrom ? { effectiveFrom } : {}),
        ...(input.decreeNumber !== undefined ? { decreeNumber: input.decreeNumber } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      });
      await repository.syncCurrentHomebase(tx, id);
      await writeAudit(
        auditOf(ctx, id, "update", { before: auditEntry(before), after: auditEntry(after) }),
        tx,
      );
      await recordFieldChanges(tx, {
        employeeId: id,
        actorAccountId: ctx.actor.accountId,
        source: "HR_FORM",
        refId: after.id,
        changes: [
          {
            section: "WORK",
            field: "homebase",
            oldValue: homebaseChangeText(lookup, current),
            newValue: homebaseChangeText(lookup, await repository.findLatestEntry(tx, id)),
          },
        ],
      });
      return after;
    })
    .catch(rethrowDuplicate);
  const [dto] = await toDtos([entry], lookup);
  return dto as EmployeeHomebaseEntry;
}

export async function deleteEmployeeHomebase(
  ctx: RequestContext,
  id: string,
  entryId: string,
): Promise<{ id: string }> {
  assertCanManage(ctx);
  const lookup = await getMasterLookup();
  await employeeRepo.withTransaction(async (tx) => {
    await loadWritable(ctx, id, tx);
    const before = await repository.findEntry(tx, id, entryId);
    if (!before) throw new NotFoundError("Riwayat homebase tidak ditemukan.");
    const current = await repository.findLatestEntry(tx, id);
    await repository.deleteEntry(tx, entryId);
    await repository.syncCurrentHomebase(tx, id);
    await writeAudit(auditOf(ctx, id, "delete", { before: auditEntry(before) }), tx);
    await recordFieldChanges(tx, {
      employeeId: id,
      actorAccountId: ctx.actor.accountId,
      source: "HR_FORM",
      refId: before.id,
      changes: [
        {
          section: "WORK",
          field: "homebase",
          oldValue: homebaseChangeText(lookup, current),
          newValue: homebaseChangeText(lookup, await repository.findLatestEntry(tx, id)),
        },
      ],
    });
  });
  return { id: entryId };
}

// ── Adapter payroll (lewat index.ts) ────────────────────────────────────────

export interface HomebaseOnDate {
  homebaseId: string;
  name: string;
  /** YYYY-MM-DD baris yang berlaku. */
  effectiveFrom: string;
}

/**
 * Homebase yang berlaku pada tanggal tertentu per karyawan: baris dengan `effective_from` ≤ tanggal itu
 * yang paling baru; null = belum ada baris sampai tanggal itu. `date` string = "YYYY-MM-DD"; Date =
 * tanggal kalender di Asia/Jakarta.
 */
export async function getHomebasesOn(
  employeeIds: string[],
  date: Date | string,
): Promise<Map<string, HomebaseOnDate | null>> {
  const ids = [...new Set(employeeIds)];
  const result = new Map<string, HomebaseOnDate | null>(ids.map((id) => [id, null]));
  if (ids.length === 0) return result;
  const on = toDate(typeof date === "string" ? date : todayInJakarta(date));
  const [rows, lookup] = await Promise.all([
    repository.listEntriesOnOrBefore(ids, on),
    getMasterLookup(),
  ]);
  for (const row of rows) {
    if (result.get(row.employeeId)) continue; // baris pertama per karyawan = terbaru
    result.set(row.employeeId, {
      homebaseId: row.homebaseId,
      name: lookup.homebases.get(row.homebaseId)?.name ?? "—",
      effectiveFrom: toIso(row.effectiveFrom),
    });
  }
  return result;
}
