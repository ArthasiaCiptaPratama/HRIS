import {
  type ArchiveCategory,
  educationInputSchema,
  positionHistoryInputSchema,
  positionHistoryMetaSchema,
  trainingInputSchema,
  workExperienceInputSchema,
} from "@hris/shared";
import type { z } from "zod";
import { writeAudit } from "../../core/audit.ts";
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../core/errors.ts";
import { Prisma } from "../../generated/prisma/client.ts";
import { getMasterLookup, type MasterLookup } from "../organization/index.ts";
import * as archive from "./archive.repository.ts";
import type { ArchiveListQuery } from "./archive.schema.ts";
import * as policy from "./employee.policy.ts";
import * as employees from "./employee.repository.ts";
import {
  archiveEmployeeWhere,
  employeeTargetOf,
  nameRef,
  type RequestContext,
  signPhotoUrls,
  todayInJakarta,
} from "./employee.service.ts";

// D-054 (Arsip gelombang 1a, design/arsip-karyawan.md): tabel lintas karyawan per kategori + kelola
// item per karyawan. Cakupan = cakupan daftar karyawan; tulis = SA/HR atas karyawan yang boleh dilihat.

const toIso = (date: Date) => date.toISOString().slice(0, 10);
const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const contains = (q: string) => ({ contains: q, mode: "insensitive" as const });

/** Riwayat jabatan = masuk, pindah jabatan, pindah PT (otomatis) + riwayat lama (manual). */
const POSITION_CHANGE_TYPES = ["HIRED", "POSITION_CHANGED", "COMPANY_CHANGED"] as const;

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        code: issue.code,
        message: issue.message,
      })),
    );
  }
  return result.data;
}

function employeeFilters(ctx: RequestContext, query: ArchiveListQuery, lookup: MasterLookup) {
  if (!policy.canReadArchive(ctx.actor)) throw new ForbiddenError();
  return archiveEmployeeWhere(
    ctx.actor,
    {
      companyId: query.companyId,
      departmentId: query.departmentId,
      active: query.employees === "all" ? undefined : query.employees === "active",
    },
    lookup,
  );
}

const employeeText = (q: string) => [{ fullName: contains(q) }, { employeeNumber: contains(q) }];

async function employeeRefs(
  ctx: RequestContext,
  lookup: MasterLookup,
  rows: archive.ArchiveEmployee[],
) {
  const photos = await signPhotoUrls(
    ctx,
    rows.map((row) => row.photoPath),
  );
  return (row: archive.ArchiveEmployee) => {
    const position = lookup.positions.get(row.positionId);
    return {
      id: row.id,
      fullName: row.fullName,
      employeeNumber: row.employeeNumber,
      isActive: row.isActive,
      company: { id: row.companyId, code: lookup.companies.get(row.companyId)?.code ?? "—" },
      department: nameRef(lookup.departments, position?.departmentId ?? null),
      position: { id: row.positionId, name: position?.name ?? "—" },
      photoUrl: row.photoPath ? (photos.get(row.photoPath) ?? null) : null,
    };
  };
}

const paging = (query: ArchiveListQuery) => ({
  skip: (query.page - 1) * query.pageSize,
  take: query.pageSize,
});
const meta = (query: ArchiveListQuery, total: number) => ({
  page: query.page,
  pageSize: query.pageSize,
  total,
});

export async function listArchive(
  ctx: RequestContext,
  category: ArchiveCategory,
  query: ArchiveListQuery,
) {
  const lookup = await getMasterLookup();
  const employeeWhere = employeeFilters(ctx, query, lookup);
  const { skip, take } = paging(query);
  const q = query.q?.trim();

  switch (category) {
    case "contacts": {
      const where = q
        ? {
            AND: [
              employeeWhere,
              {
                OR: [
                  ...employeeText(q),
                  { workEmail: contains(q) },
                  { phoneNumber: contains(q) },
                  { emergencyContactName: contains(q) },
                ],
              },
            ],
          }
        : employeeWhere;
      const { rows, total } = await archive.listContacts(where, skip, take);
      const ref = await employeeRefs(ctx, lookup, rows);
      // Alamat domisili = data pribadi (PLAN §4.2): hanya baris yang boleh dibaca; audit tanpa nilai.
      const allowed = rows
        .filter((row) => policy.canReadPersonal(ctx.actor, employeeTargetOf(row)))
        .map((row) => row.id);
      const domiciles = await archive.findDomiciles(allowed);
      if (allowed.length > 0) {
        await writeAudit({
          actorAccountId: ctx.actor.accountId,
          requestId: ctx.requestId ?? null,
          ip: ctx.ip ?? null,
          action: "employee.sensitive.read",
          entityType: "employee.archive",
          entityId: "contacts",
          after: { fields: ["domicileAddress"], employees: allowed.length },
        });
      }
      return {
        data: rows.map((row) => ({
          id: row.id,
          employee: ref(row),
          workEmail: row.workEmail,
          personalEmail: row.personalEmail,
          phoneNumber: row.phoneNumber,
          emergencyContactName: row.emergencyContactName,
          emergencyContactRelationship: row.emergencyContactRelationship,
          emergencyPhone: row.emergencyPhone,
          ...(allowed.includes(row.id) ? { domicileAddress: domiciles.get(row.id) ?? null } : {}),
        })),
        meta: meta(query, total),
      };
    }
    case "educations": {
      const where: Prisma.EducationWhereInput = {
        employee: employeeWhere,
        ...(query.level ? { level: query.level } : {}),
        ...(q
          ? {
              OR: [
                { employee: { OR: employeeText(q) } },
                { schoolName: contains(q) },
                { major: contains(q) },
              ],
            }
          : {}),
      };
      const { rows, total } = await archive.listEducations(where, skip, take);
      const ref = await employeeRefs(
        ctx,
        lookup,
        rows.map((row) => row.employee),
      );
      return {
        data: rows.map((row) => ({
          id: row.id,
          employee: ref(row.employee),
          level: row.level,
          schoolName: row.schoolName,
          major: row.major,
          graduationYear: row.graduationYear,
        })),
        meta: meta(query, total),
      };
    }
    case "trainings": {
      const where: Prisma.TrainingWhereInput = {
        employee: employeeWhere,
        ...(query.type ? { type: query.type } : {}),
        ...(q
          ? {
              OR: [
                { employee: { OR: employeeText(q) } },
                { trainingField: contains(q) },
                { organizer: contains(q) },
              ],
            }
          : {}),
      };
      const { rows, total } = await archive.listTrainings(where, skip, take);
      const ref = await employeeRefs(
        ctx,
        lookup,
        rows.map((row) => row.employee),
      );
      return {
        data: rows.map((row) => ({
          id: row.id,
          employee: ref(row.employee),
          trainingField: row.trainingField,
          organizer: row.organizer,
          type: row.type,
          startDate: row.startDate ? toIso(row.startDate) : null,
          endDate: row.endDate ? toIso(row.endDate) : null,
          hours: row.hours,
          trainingYear: row.trainingYear,
          duration: row.duration,
          ...(policy.canSeeArchiveCost(ctx.actor, employeeTargetOf(row.employee))
            ? { cost: row.cost ? row.cost.toNumber() : null }
            : {}),
        })),
        meta: meta(query, total),
      };
    }
    case "work-experiences": {
      const where: Prisma.WorkExperienceWhereInput = {
        employee: employeeWhere,
        ...(q
          ? {
              OR: [
                { employee: { OR: employeeText(q) } },
                { companyName: contains(q) },
                { position: contains(q) },
              ],
            }
          : {}),
      };
      const { rows, total } = await archive.listWorkExperiences(where, skip, take);
      const ref = await employeeRefs(
        ctx,
        lookup,
        rows.map((row) => row.employee),
      );
      return {
        data: rows.map((row) => ({
          id: row.id,
          employee: ref(row.employee),
          companyName: row.companyName,
          position: row.position,
          startYear: row.startYear,
          endYear: row.endYear,
          description: row.description,
        })),
        meta: meta(query, total),
      };
    }
    case "position-histories": {
      const where: Prisma.EmploymentHistoryWhereInput = {
        employee: employeeWhere,
        changeType: { in: [...POSITION_CHANGE_TYPES] },
        ...(query.movementType ? { movementType: query.movementType } : {}),
        ...(query.source ? { source: query.source } : {}),
        ...(q
          ? {
              OR: [
                { employee: { OR: employeeText(q) } },
                { toPositionName: contains(q) },
                { decreeNumber: contains(q) },
                { note: contains(q) },
              ],
            }
          : {}),
      };
      const { rows, total } = await archive.listPositionHistories(where, skip, take);
      const ref = await employeeRefs(
        ctx,
        lookup,
        rows.map((row) => row.employee),
      );
      const companyCode = (id: string | null) =>
        id ? { id, code: lookup.companies.get(id)?.code ?? "—" } : null;
      return {
        data: rows.map((row) => ({
          id: row.id,
          employee: ref(row.employee),
          changeType: row.changeType,
          source: row.source,
          effectiveDate: toIso(row.effectiveDate),
          movementType: row.movementType,
          fromPosition: nameRef(lookup.positions, row.fromPositionId),
          toPosition: nameRef(lookup.positions, row.toPositionId),
          toPositionName: row.toPositionName,
          toDepartmentName: row.toDepartmentName,
          fromCompany: companyCode(row.fromCompanyId),
          toCompany: companyCode(row.toCompanyId),
          decreeNumber: row.decreeNumber,
          note: row.note,
        })),
        meta: meta(query, total),
      };
    }
  }
}

// ── Kelola item per karyawan ────────────────────────────────────────────────

export type ItemCategory = Exclude<ArchiveCategory, "contacts">;

/** Karyawan target harus terlihat (404 bila tidak) dan boleh dikelola aktor (403). */
async function loadTarget(ctx: RequestContext, employeeId: string, tx: employees.EmployeeTx) {
  const row = await employees.findEmployee(employeeId, tx);
  if (!row || row.onboardingStatus !== "APPROVED") {
    throw new NotFoundError("Karyawan tidak ditemukan.");
  }
  const target = employeeTargetOf(row);
  if (!policy.canViewEmployee(ctx.actor, target))
    throw new NotFoundError("Karyawan tidak ditemukan.");
  if (!policy.canManageArchive(ctx.actor, target)) throw new ForbiddenError();
  return row;
}

async function audit(
  ctx: RequestContext,
  tx: employees.EmployeeTx,
  entity: string,
  action: string,
  id: string,
  extra: { before?: Record<string, unknown> | null; after?: Record<string, unknown> | null },
) {
  await writeAudit(
    {
      actorAccountId: ctx.actor.accountId,
      requestId: ctx.requestId ?? null,
      ip: ctx.ip ?? null,
      action: `employee.${entity}.${action}`,
      entityType: `employee.${entity}`,
      entityId: id,
      before: extra.before ?? null,
      after: extra.after ?? null,
    },
    tx,
  );
}

const AUDIT_ENTITY: Record<ItemCategory, string> = {
  educations: "education",
  trainings: "training",
  "work-experiences": "work_experience",
  "position-histories": "position_history",
};

function trainingData(input: z.infer<typeof trainingInputSchema>) {
  return {
    trainingField: input.trainingField,
    organizer: input.organizer,
    type: input.type,
    startDate: input.startDate ? toDate(input.startDate) : null,
    endDate: input.endDate ? toDate(input.endDate) : null,
    hours: input.hours,
    cost: input.cost === null ? null : new Prisma.Decimal(input.cost.toFixed(2)),
    trainingYear: input.trainingYear,
    duration: input.duration,
  };
}

async function historyData(input: z.infer<ReturnType<typeof positionHistoryInputSchema>>) {
  if (input.toPositionId) {
    const lookup = await getMasterLookup();
    if (!lookup.positions.has(input.toPositionId)) {
      throw new BusinessRuleError("Jabatan tidak ditemukan.");
    }
  }
  return {
    effectiveDate: toDate(input.effectiveDate),
    movementType: input.movementType,
    toPositionId: input.toPositionId,
    toPositionName: input.toPositionName,
    toDepartmentName: input.toDepartmentName,
    decreeNumber: input.decreeNumber,
    note: input.note,
  };
}

export async function createItem(
  ctx: RequestContext,
  category: ItemCategory,
  employeeId: string,
  body: unknown,
): Promise<{ id: string }> {
  return employees.withTransaction(async (tx) => {
    await loadTarget(ctx, employeeId, tx);
    let created: { id: string };
    let fields: string[];
    switch (category) {
      case "educations": {
        const input = parse(educationInputSchema, body);
        created = await archive.educationRepo.create(tx, { employeeId, ...input });
        fields = Object.keys(input);
        break;
      }
      case "trainings": {
        const data = trainingData(parse(trainingInputSchema, body));
        created = await archive.trainingRepo.create(tx, { employeeId, ...data });
        fields = Object.keys(data);
        break;
      }
      case "work-experiences": {
        const input = parse(workExperienceInputSchema, body);
        created = await archive.workExperienceRepo.create(tx, { employeeId, ...input });
        fields = Object.keys(input);
        break;
      }
      case "position-histories": {
        const data = await historyData(parse(positionHistoryInputSchema(todayInJakarta()), body));
        created = await archive.historyRepo.create(tx, {
          employeeId,
          ...data,
          changeType: "POSITION_CHANGED",
          source: "MANUAL",
          changedBy: ctx.actor.accountId,
        });
        fields = Object.keys(data);
        break;
      }
    }
    await audit(ctx, tx, AUDIT_ENTITY[category], "create", created.id, {
      after: { employeeId, fields },
    });
    return created;
  });
}

async function findOwnedItem(
  tx: employees.EmployeeTx,
  category: ItemCategory,
  employeeId: string,
  itemId: string,
) {
  const item =
    category === "educations"
      ? await archive.educationRepo.find(tx, itemId)
      : category === "trainings"
        ? await archive.trainingRepo.find(tx, itemId)
        : category === "work-experiences"
          ? await archive.workExperienceRepo.find(tx, itemId)
          : await archive.historyRepo.find(tx, itemId);
  if (!item || item.employeeId !== employeeId) throw new NotFoundError("Data tidak ditemukan.");
  if (
    category === "position-histories" &&
    !(POSITION_CHANGE_TYPES as readonly string[]).includes(
      (item as { changeType: string }).changeType,
    )
  ) {
    throw new NotFoundError("Data tidak ditemukan.");
  }
  return item;
}

export async function updateItem(
  ctx: RequestContext,
  category: ItemCategory,
  employeeId: string,
  itemId: string,
  body: unknown,
): Promise<{ id: string }> {
  return employees.withTransaction(async (tx) => {
    await loadTarget(ctx, employeeId, tx);
    const item = await findOwnedItem(tx, category, employeeId, itemId);
    let fields: string[];
    switch (category) {
      case "educations": {
        const input = parse(educationInputSchema, body);
        await archive.educationRepo.update(tx, itemId, input);
        fields = Object.keys(input);
        break;
      }
      case "trainings": {
        const data = trainingData(parse(trainingInputSchema, body));
        await archive.trainingRepo.update(tx, itemId, data);
        fields = Object.keys(data);
        break;
      }
      case "work-experiences": {
        const input = parse(workExperienceInputSchema, body);
        await archive.workExperienceRepo.update(tx, itemId, input);
        fields = Object.keys(input);
        break;
      }
      case "position-histories": {
        // Riwayat otomatis: isi (tanggal, jabatan, PT, status) tetap; hanya keterangan tambahan.
        if ((item as { source: string }).source === "SYSTEM") {
          const meta = parse(positionHistoryMetaSchema, body);
          await archive.historyRepo.update(tx, itemId, meta);
          fields = Object.keys(meta);
        } else {
          const data = await historyData(parse(positionHistoryInputSchema(todayInJakarta()), body));
          await archive.historyRepo.update(tx, itemId, data);
          fields = Object.keys(data);
        }
        break;
      }
    }
    await audit(ctx, tx, AUDIT_ENTITY[category], "update", itemId, {
      after: { employeeId, fields },
    });
    return { id: itemId };
  });
}

export async function deleteItem(
  ctx: RequestContext,
  category: ItemCategory,
  employeeId: string,
  itemId: string,
): Promise<{ id: string }> {
  return employees.withTransaction(async (tx) => {
    await loadTarget(ctx, employeeId, tx);
    const item = await findOwnedItem(tx, category, employeeId, itemId);
    if (category === "position-histories" && (item as { source: string }).source === "SYSTEM") {
      throw new BusinessRuleError("Riwayat yang dicatat otomatis tidak bisa dihapus.");
    }
    if (category === "educations") await archive.educationRepo.delete(tx, itemId);
    else if (category === "trainings") await archive.trainingRepo.delete(tx, itemId);
    else if (category === "work-experiences") await archive.workExperienceRepo.delete(tx, itemId);
    else await archive.historyRepo.delete(tx, itemId);
    await audit(ctx, tx, AUDIT_ENTITY[category], "delete", itemId, { before: { employeeId } });
    return { id: itemId };
  });
}
