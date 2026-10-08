import {
  type DocumentTypeInput,
  daysUntil,
  documentTypeInputSchema,
  type EmployeeDocumentInput,
  EXPIRED_NOTICE_WINDOW_DAYS,
  EXPIRY_WARN_DAYS,
  type ExpiryState,
  employeeDocumentInputSchema,
  expiryState,
  reminderThreshold,
} from "@hris/shared";
import { z } from "zod";
import type { Actor } from "../../core/access/index.ts";
import { writeAudit } from "../../core/audit.ts";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../core/errors.ts";
import {
  EMPLOYEE_DOCUMENT_BUCKET,
  type StorageAdmin,
  UNCONFIGURED_STORAGE,
} from "../../core/storage.ts";
import { Prisma } from "../../generated/prisma/client.ts";
import { getEmployeeAccountStates, listDocumentReminderRecipients } from "../iam/index.ts";
import { notify } from "../notification/index.ts";
import { getMasterLookup } from "../organization/index.ts";
import {
  contains,
  employeeFilters,
  employeeRefs,
  employeeText,
  meta,
  paging,
  parse,
  toDate,
  toIso,
} from "./archive.service.ts";
import * as repo from "./document.repository.ts";
import type { DocumentListQuery } from "./document.schema.ts";
import * as policy from "./employee.policy.ts";
import * as employees from "./employee.repository.ts";
import { employeeTargetOf, type RequestContext, todayInJakarta } from "./employee.service.ts";

// D-055 (Arsip gelombang 1b, design/arsip-karyawan.md §4, §6.1, §7.2, §8): jenis dokumen (SA), dokumen
// karyawan berversi + bermasa berlaku, tautan baca singkat, tabel Data File, pengingat kedaluwarsa.

const URL_TTL_SECONDS = 5 * 60;
const MB = 1024 * 1024;
const EXTENSION: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};
const storageOf = (ctx: RequestContext): StorageAdmin => ctx.storage ?? UNCONFIGURED_STORAGE;
const documentDir = (ctx: RequestContext, employeeId: string) =>
  `${ctx.storagePathPrefix ?? ""}employees/${employeeId}/documents/`;

function auditBase(ctx: RequestContext) {
  return {
    actorAccountId: ctx.actor.accountId,
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
  };
}

const isUnique = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

// ── Jenis dokumen (master data, SA) ─────────────────────────────────────────

function typeDto(row: repo.DocumentTypeRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    hasExpiry: row.hasExpiry,
    defaultValidityMonths: row.defaultValidityMonths,
    reminderDays: row.reminderDays,
    requiredScope: row.requiredScope,
    requiredPositionIds: row.requiredPositionIds,
    multiple: row.multiple,
    employeeCanUpload: row.employeeCanUpload,
    sensitive: row.sensitive,
    maxSizeMb: row.maxSizeMb,
    allowedMimeTypes: row.allowedMimeTypes,
    archived: row.deletedAt !== null,
    documentCount: row._count.documents,
  };
}
export type DocumentTypeDto = ReturnType<typeof typeDto>;

function assertManageTypes(actor: Actor) {
  if (!policy.canManageDocumentTypes(actor)) throw new ForbiddenError();
}

async function assertPositions(input: DocumentTypeInput) {
  if (input.requiredPositionIds.length === 0) return;
  const lookup = await getMasterLookup();
  if (input.requiredPositionIds.some((id) => !lookup.positions.has(id))) {
    throw new BusinessRuleError("Jabatan tidak ditemukan.");
  }
}

const typeData = (input: DocumentTypeInput) => ({
  code: input.code,
  name: input.name,
  category: input.category,
  hasExpiry: input.hasExpiry,
  defaultValidityMonths: input.defaultValidityMonths,
  reminderDays: input.reminderDays,
  requiredScope: input.requiredScope,
  requiredPositionIds: input.requiredPositionIds,
  multiple: input.multiple,
  employeeCanUpload: input.employeeCanUpload,
  sensitive: input.sensitive,
  maxSizeMb: input.maxSizeMb,
  allowedMimeTypes: input.allowedMimeTypes,
});

/** Semua akun membaca daftar aktif (nama jenis bukan data sensitif); arsip hanya untuk SA. */
export async function listDocumentTypes(ctx: RequestContext, includeArchived: boolean) {
  const rows = await repo.listTypes(includeArchived && policy.canManageDocumentTypes(ctx.actor));
  return rows.map(typeDto);
}

async function loadType(id: string, tx?: employees.EmployeeTx) {
  const row = await repo.findType(id, tx);
  if (!row) throw new NotFoundError("Jenis dokumen tidak ditemukan.");
  return row;
}

export async function createDocumentType(ctx: RequestContext, body: unknown) {
  assertManageTypes(ctx.actor);
  const input = parse(documentTypeInputSchema, body);
  await assertPositions(input);
  try {
    return await employees.withTransaction(async (tx) => {
      const created = await repo.createType(tx, typeData(input));
      await writeAudit(
        {
          ...auditBase(ctx),
          action: "employee.document_type.create",
          entityType: "employee.document_type",
          entityId: created.id,
          after: { code: input.code },
        },
        tx,
      );
      return typeDto(await loadType(created.id, tx));
    });
  } catch (error) {
    if (isUnique(error)) throw new ConflictError(`Kode "${input.code}" sudah dipakai.`);
    throw error;
  }
}

export async function updateDocumentType(ctx: RequestContext, id: string, body: unknown) {
  assertManageTypes(ctx.actor);
  const input = parse(documentTypeInputSchema, body);
  await assertPositions(input);
  try {
    return await employees.withTransaction(async (tx) => {
      const current = await loadType(id, tx);
      // Kode dipakai laporan/impor: terkunci setelah ada dokumen (pola kode PT, D-049).
      if (input.code !== current.code && (await repo.countAllDocumentsOfType(tx, id)) > 0) {
        throw new BusinessRuleError("Kode tidak bisa diubah karena sudah ada dokumen jenis ini.");
      }
      await repo.updateType(tx, id, typeData(input));
      await writeAudit(
        {
          ...auditBase(ctx),
          action: "employee.document_type.update",
          entityType: "employee.document_type",
          entityId: id,
          before: { code: current.code },
          after: { code: input.code, fields: Object.keys(input) },
        },
        tx,
      );
      return typeDto(await loadType(id, tx));
    });
  } catch (error) {
    if (isUnique(error)) throw new ConflictError(`Kode "${input.code}" sudah dipakai.`);
    throw error;
  }
}

export async function setDocumentTypeArchived(ctx: RequestContext, id: string, archived: boolean) {
  assertManageTypes(ctx.actor);
  return employees.withTransaction(async (tx) => {
    await loadType(id, tx);
    await repo.updateType(tx, id, { deletedAt: archived ? new Date() : null });
    await writeAudit(
      {
        ...auditBase(ctx),
        action: `employee.document_type.${archived ? "archive" : "restore"}`,
        entityType: "employee.document_type",
        entityId: id,
      },
      tx,
    );
    return typeDto(await loadType(id, tx));
  });
}

/** Hapus permanen hanya bila belum pernah dipakai dokumen mana pun & bukan padanan wizard onboarding. */
export async function deleteDocumentType(ctx: RequestContext, id: string) {
  assertManageTypes(ctx.actor);
  return employees.withTransaction(async (tx) => {
    const current = await loadType(id, tx);
    if (current.legacyType !== null) {
      throw new BusinessRuleError(
        "Jenis ini dipakai formulir onboarding dan tidak bisa dihapus — arsipkan saja.",
      );
    }
    if ((await repo.countAllDocumentsOfType(tx, id)) > 0) {
      throw new BusinessRuleError("Jenis ini pernah dipakai dokumen — arsipkan saja.");
    }
    await repo.deleteType(tx, id);
    await writeAudit(
      {
        ...auditBase(ctx),
        action: "employee.document_type.delete",
        entityType: "employee.document_type",
        entityId: id,
        before: { code: current.code },
      },
      tx,
    );
    return { id };
  });
}

// ── Dokumen karyawan ────────────────────────────────────────────────────────

function documentDto(row: repo.DocumentRow, today: string) {
  const expiresAt = row.expiresAt ? toIso(row.expiresAt) : null;
  const state: ExpiryState = expiryState(expiresAt, today, EXPIRY_WARN_DAYS);
  return {
    id: row.id,
    documentType: row.documentType,
    documentNumber: row.documentNumber,
    issuedAt: row.issuedAt ? toIso(row.issuedAt) : null,
    expiresAt,
    expiryState: state,
    daysLeft: expiresAt ? daysUntil(expiresAt, today) : null,
    version: row.version,
    isCurrent: row.isCurrent,
    replacesId: row.replacesId,
    status: row.status,
    note: row.note,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    trainingId: row.trainingId,
    historyId: row.historyId,
    uploadedAt: row.createdAt.toISOString(),
  };
}

/** Karyawan harus terlihat aktor (404 bila tidak); calon onboarding lewat alur review (D-047). */
async function loadEmployee(ctx: RequestContext, employeeId: string, tx?: employees.EmployeeTx) {
  const row = await employees.findEmployee(employeeId, tx);
  if (row?.onboardingStatus !== "APPROVED") throw new NotFoundError("Karyawan tidak ditemukan.");
  const target = employeeTargetOf(row);
  if (!policy.canViewEmployee(ctx.actor, target)) {
    throw new NotFoundError("Karyawan tidak ditemukan.");
  }
  return target;
}

export async function listEmployeeDocuments(ctx: RequestContext, employeeId: string) {
  const target = await loadEmployee(ctx, employeeId);
  const today = todayInJakarta();
  const rows = await repo.listOfEmployee(employeeId);
  return {
    documents: rows
      .filter((row) =>
        policy.canReadDocuments(
          ctx.actor,
          target,
          row.documentType.sensitive,
          row.documentType.code,
        ),
      )
      .map((row) => documentDto(row, today)),
    access: {
      write: policy.canWriteDocuments(ctx.actor, target, false),
      writeSensitive: policy.canWriteDocuments(ctx.actor, target, true),
      writeBankBook: policy.canWriteDocuments(ctx.actor, target, true, "BANK_BOOK"),
    },
  };
}

async function writableType(
  ctx: RequestContext,
  target: ReturnType<typeof employeeTargetOf>,
  documentTypeId: string,
  tx?: employees.EmployeeTx,
) {
  const type = await repo.findType(documentTypeId, tx);
  if (!type || type.deletedAt) throw new NotFoundError("Jenis dokumen tidak ditemukan.");
  if (!policy.canWriteDocuments(ctx.actor, target, type.sensitive, type.code)) {
    throw new ForbiddenError();
  }
  return type;
}

export async function createUploadUrl(
  ctx: RequestContext,
  employeeId: string,
  input: { documentTypeId: string; contentType: string },
) {
  const target = await loadEmployee(ctx, employeeId);
  const type = await writableType(ctx, target, input.documentTypeId);
  if (!type.allowedMimeTypes.includes(input.contentType)) {
    throw new BusinessRuleError(`Format file tidak diizinkan untuk ${type.name}.`);
  }
  const path = `${documentDir(ctx, employeeId)}${crypto.randomUUID()}.${EXTENSION[input.contentType]}`;
  const upload = await storageOf(ctx).createSignedUploadUrl(EMPLOYEE_DOCUMENT_BUCKET, path);
  return {
    bucket: EMPLOYEE_DOCUMENT_BUCKET,
    path,
    token: upload.token,
    signedUrl: upload.signedUrl,
    maxBytes: type.maxSizeMb * MB,
  };
}

export const documentLinkSchema = z.object({
  path: z.string().min(1).max(255),
  /** Jenis jamak: unggah sebagai versi baru dokumen ini (jenis tunggal: otomatis versi aktif). */
  replacesId: z.uuid().nullable().optional(),
  trainingId: z.uuid().nullable().optional(),
  historyId: z.uuid().nullable().optional(),
});

function assertExpiry(type: { hasExpiry: boolean }, input: EmployeeDocumentInput) {
  if (type.hasExpiry && !input.expiresAt) {
    throw new ValidationError([
      {
        path: "expiresAt",
        code: "custom",
        message: "Tanggal kedaluwarsa wajib untuk jenis dokumen ini.",
      },
    ]);
  }
}

const metaData = (input: EmployeeDocumentInput) => ({
  documentNumber: input.documentNumber,
  issuedAt: input.issuedAt ? toDate(input.issuedAt) : null,
  expiresAt: input.expiresAt ? toDate(input.expiresAt) : null,
  note: input.note,
});

export async function createDocument(ctx: RequestContext, employeeId: string, body: unknown) {
  const input = parse(employeeDocumentInputSchema(todayInJakarta()), body);
  const link = parse(documentLinkSchema, body);
  const target = await loadEmployee(ctx, employeeId);
  const type = await writableType(ctx, target, input.documentTypeId);
  // Path wajib milik karyawan ini di lingkungan ini (pola D-037).
  if (!link.path.startsWith(documentDir(ctx, employeeId))) {
    throw new BusinessRuleError("Dokumen tidak valid untuk karyawan ini.");
  }
  const storage = storageOf(ctx);
  const info = await storage.getObjectInfo(EMPLOYEE_DOCUMENT_BUCKET, link.path);
  if (!info) throw new BusinessRuleError("Dokumen belum terunggah. Coba unggah ulang.");
  const discard = () => storage.removeObjects(EMPLOYEE_DOCUMENT_BUCKET, [link.path]);
  if (
    !type.allowedMimeTypes.includes(info.contentType ?? "") ||
    info.size <= 0 ||
    info.size > type.maxSizeMb * MB
  ) {
    await discard();
    throw new BusinessRuleError(`File harus sesuai format & maksimal ${type.maxSizeMb} MB.`);
  }
  try {
    assertExpiry(type, input);
    return await employees.withTransaction(async (tx) => {
      let replaced: { id: string; version: number }[] = [];
      if (link.replacesId) {
        const previous = await repo.findDocument(tx, link.replacesId);
        if (
          !previous ||
          previous.employeeId !== employeeId ||
          previous.documentType.id !== type.id ||
          !previous.isCurrent
        ) {
          throw new NotFoundError("Dokumen yang diganti tidak ditemukan.");
        }
        replaced = [previous];
      } else if (!type.multiple) {
        replaced = await repo.findCurrentOfType(tx, employeeId, type.id);
      }
      for (const [kind, id] of [
        ["training", link.trainingId],
        ["history", link.historyId],
      ] as const) {
        if (id && !(await repo.itemBelongsTo(tx, kind, id, employeeId))) {
          throw new NotFoundError("Data yang dilampiri tidak ditemukan.");
        }
      }
      await repo.markNotCurrent(
        tx,
        replaced.map((d) => d.id),
      );
      const created = await repo.createDocument(tx, {
        employeeId,
        type: type.legacyType ?? "OTHER",
        documentTypeId: type.id,
        ...metaData(input),
        version: (replaced[0]?.version ?? 0) + 1,
        replacesId: replaced[0]?.id ?? null,
        trainingId: link.trainingId ?? null,
        historyId: link.historyId ?? null,
        storagePath: link.path,
        mimeType: info.contentType ?? "application/octet-stream",
        sizeBytes: info.size,
        uploadedBy: ctx.actor.accountId,
        // Unggahan SA/HR langsung sah; unggahan karyawan lewat pengajuan (gelombang 1c).
        status: "VERIFIED",
        verifiedBy: ctx.actor.accountId,
        verifiedAt: new Date(),
      });
      await writeAudit(
        {
          ...auditBase(ctx),
          action: "employee.document.upload",
          entityType: "employee.employee",
          entityId: employeeId,
          after: {
            documentId: created.id,
            type: type.code,
            version: (replaced[0]?.version ?? 0) + 1,
          },
        },
        tx,
      );
      return created;
    });
  } catch (error) {
    await discard();
    throw error;
  }
}

async function loadOwnDocument(
  tx: employees.EmployeeTx | undefined,
  employeeId: string,
  documentId: string,
): Promise<repo.DocumentRow> {
  const doc = await repo.findDocument(tx, documentId);
  if (!doc || doc.employeeId !== employeeId) throw new NotFoundError("Dokumen tidak ditemukan.");
  return doc;
}

export async function updateDocument(
  ctx: RequestContext,
  employeeId: string,
  documentId: string,
  body: unknown,
) {
  const input = parse(employeeDocumentInputSchema(todayInJakarta()), body);
  const target = await loadEmployee(ctx, employeeId);
  return employees.withTransaction(async (tx) => {
    const doc = await loadOwnDocument(tx, employeeId, documentId);
    if (
      !policy.canReadDocuments(ctx.actor, target, doc.documentType.sensitive, doc.documentType.code)
    ) {
      throw new NotFoundError("Dokumen tidak ditemukan.");
    }
    const type = await writableType(ctx, target, doc.documentType.id, tx);
    if (input.documentTypeId !== type.id) {
      throw new BusinessRuleError("Jenis dokumen tidak bisa diubah; unggah sebagai jenis lain.");
    }
    assertExpiry(type, input);
    await repo.updateDocument(tx, documentId, metaData(input));
    await writeAudit(
      {
        ...auditBase(ctx),
        action: "employee.document.update",
        entityType: "employee.employee",
        entityId: employeeId,
        after: { documentId, type: type.code, fields: Object.keys(metaData(input)) },
      },
      tx,
    );
    return { id: documentId };
  });
}

/** Hapus satu versi: file dihapus dari Storage; bila versi aktif, versi sebelumnya aktif kembali. */
export async function deleteDocument(ctx: RequestContext, employeeId: string, documentId: string) {
  const target = await loadEmployee(ctx, employeeId);
  const doc = await employees.withTransaction(async (tx) => {
    const doc = await loadOwnDocument(tx, employeeId, documentId);
    if (
      !policy.canReadDocuments(ctx.actor, target, doc.documentType.sensitive, doc.documentType.code)
    ) {
      throw new NotFoundError("Dokumen tidak ditemukan.");
    }
    if (
      !policy.canWriteDocuments(
        ctx.actor,
        target,
        doc.documentType.sensitive,
        doc.documentType.code,
      )
    ) {
      throw new ForbiddenError();
    }
    await repo.updateDocument(tx, documentId, { deletedAt: new Date(), isCurrent: false });
    if (doc.isCurrent && doc.replacesId) await repo.restoreCurrent(tx, doc.replacesId);
    await writeAudit(
      {
        ...auditBase(ctx),
        action: "employee.document.delete",
        entityType: "employee.employee",
        entityId: employeeId,
        before: { documentId, type: doc.documentType.code, version: doc.version },
      },
      tx,
    );
    return doc;
  });
  await storageOf(ctx).removeObjects(EMPLOYEE_DOCUMENT_BUCKET, [doc.storagePath]);
  return { id: documentId };
}

/** Tautan baca bertanda tangan 5 menit; membaca jenis sensitif diaudit (tanpa isi). */
export async function documentUrl(ctx: RequestContext, employeeId: string, documentId: string) {
  const target = await loadEmployee(ctx, employeeId);
  const doc = await loadOwnDocument(undefined, employeeId, documentId);
  if (
    !policy.canReadDocuments(ctx.actor, target, doc.documentType.sensitive, doc.documentType.code)
  ) {
    throw new NotFoundError("Dokumen tidak ditemukan.");
  }
  const urls = await storageOf(ctx).createSignedUrls(
    EMPLOYEE_DOCUMENT_BUCKET,
    [doc.storagePath],
    URL_TTL_SECONDS,
  );
  const url = urls.get(doc.storagePath);
  if (!url) throw new NotFoundError("File dokumen tidak tersedia.");
  if (doc.documentType.sensitive) {
    await writeAudit({
      ...auditBase(ctx),
      action: "employee.sensitive.read",
      entityType: "employee.employee",
      entityId: employeeId,
      after: { section: "documents", documentId, type: doc.documentType.code },
    });
  }
  return { url, expiresInSeconds: URL_TTL_SECONDS };
}

// ── Tabel lintas karyawan: Arsip › Data File ────────────────────────────────

function expiryWhere(state: ExpiryState | undefined, today: string) {
  const day = toDate(today);
  const warn = toDate(addDays(today, EXPIRY_WARN_DAYS));
  switch (state) {
    case "EXPIRED":
      return { expiresAt: { lt: day } };
    case "EXPIRING":
      return { expiresAt: { gte: day, lte: warn } };
    case "VALID":
      return { expiresAt: { gt: warn } };
    case "NONE":
      return { expiresAt: null };
    default:
      return {};
  }
}

const addDays = (iso: string, days: number) =>
  new Date(toDate(iso).getTime() + days * 86_400_000).toISOString().slice(0, 10);

export async function listArchiveDocuments(ctx: RequestContext, query: DocumentListQuery) {
  const lookup = await getMasterLookup();
  const employeeWhere = employeeFilters(ctx, query, lookup);
  const today = todayInJakarta();
  const q = query.q?.trim();
  const where: Prisma.EmployeeDocumentWhereInput = {
    deletedAt: null,
    isCurrent: true,
    employee: employeeWhere,
    // Jenis sensitif hanya untuk SA / pemegang grant baca (cakupan baris tetap per role).
    ...(policy.seesAllSensitiveDocuments(ctx.actor) ? {} : { documentType: { sensitive: false } }),
    ...(query.documentTypeId ? { documentTypeId: query.documentTypeId } : {}),
    ...(query.category ? { AND: [{ documentType: { category: query.category } }] } : {}),
    ...expiryWhere(query.expiry, today),
    ...(q
      ? {
          OR: [
            { employee: { OR: employeeText(q) } },
            { documentNumber: contains(q) },
            { documentType: { name: contains(q) } },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.EmployeeDocumentOrderByWithRelationInput[] =
    query.expiry === "EXPIRED" || query.expiry === "EXPIRING"
      ? [{ expiresAt: "asc" }, { id: "asc" }]
      : [
          { employee: { fullName: "asc" } },
          { documentType: { category: "asc" } },
          { documentType: { sortOrder: "asc" } },
          { id: "asc" },
        ];
  const { skip, take } = paging(query);
  const { rows, total } = await repo.listArchive(where, orderBy, skip, take);
  const ref = await employeeRefs(
    ctx,
    lookup,
    rows.map((row) => row.employee),
  );
  return {
    data: rows.map((row) => ({ ...documentDto(row, today), employee: ref(row.employee) })),
    meta: meta(query, total),
  };
}

// ── Cron `document-expiry` (harian) ─────────────────────────────────────────

/**
 * Pengingat kedaluwarsa (design §7.2): ke karyawan pemilik (bila punya akun aktif) dan HR PT terkait
 * (jenis sensitif: HR ber-grant baca; tanpa HR → SA). Dedupe per dokumen + ambang (60/30/7/0 hari).
 */
export async function remindExpiringDocuments(now: Date = new Date()) {
  const today = todayInJakarta(now);
  const docs = await repo.findExpiringCurrent(
    toDate(addDays(today, -EXPIRED_NOTICE_WINDOW_DAYS)),
    toDate(addDays(today, 365)),
  );
  const due = docs.flatMap((doc) => {
    const expiresAt = toIso(doc.expiresAt as Date);
    const threshold = reminderThreshold(expiresAt, today, doc.documentType.reminderDays);
    return threshold === null ? [] : [{ doc, expiresAt, threshold }];
  });
  const accounts = new Map(
    (await getEmployeeAccountStates([...new Set(due.map((d) => d.doc.employee.id))]))
      .filter((a) => a.isActive)
      .map((a) => [a.employeeId, a]),
  );
  const hrCache = new Map<string, Promise<{ accountId: string; email: string }[]>>();
  const hrOf = (companyId: string, sensitive: boolean) => {
    const key = `${companyId}:${sensitive}`;
    if (!hrCache.has(key))
      hrCache.set(key, listDocumentReminderRecipients(companyId, sensitive, now));
    return hrCache.get(key) as Promise<{ accountId: string; email: string }[]>;
  };
  const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "UTC" });
  let notified = 0;
  for (const { doc, expiresAt, threshold } of due) {
    const name = doc.documentType.name;
    const when = date.format(toDate(expiresAt));
    const left = daysUntil(expiresAt, today);
    const status =
      threshold === 0 ? `sudah kedaluwarsa sejak ${when}` : `berakhir ${when} (${left} hari lagi)`;
    const title = threshold === 0 ? "Dokumen sudah kedaluwarsa" : "Dokumen akan kedaluwarsa";
    const dedupeKey = `document-expiry:${doc.id}:${threshold}`;
    const own = accounts.get(doc.employee.id);
    if (own) {
      const result = await notify(
        {
          recipients: [{ accountId: own.accountId, email: own.email }],
          type: "employee.document_expiring",
          title,
          body: `${name} Anda ${status}. Hubungi HR untuk memperbarui.`,
          link: "/profil",
          dedupeKey,
          email: true,
        },
        now,
      );
      notified += result.created;
    }
    const hrs = (await hrOf(doc.employee.companyId, doc.documentType.sensitive)).filter(
      (r) => r.accountId !== own?.accountId,
    );
    if (hrs.length > 0) {
      const result = await notify(
        {
          recipients: hrs,
          type: "employee.document_expiring",
          title,
          body: `${name} milik ${doc.employee.fullName} ${status}.`,
          link: `/personal/arsip/file?pegawai=${doc.employee.id}&tab=documents`,
          dedupeKey,
          email: true,
        },
        now,
      );
      notified += result.created;
    }
  }
  return { checked: docs.length, due: due.length, notified };
}
