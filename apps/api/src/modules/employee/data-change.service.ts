import {
  changedFields,
  DATA_CHANGE_SECTION_LABELS,
  type DataChangeInput,
  type DataChangeSection,
  type DataChangeStatus,
  dataChangeDecisionSchema,
  dataChangeInputSchema,
  maskAccountNumber,
  PERSONAL_CHANGE_FIELDS,
  type Permission,
} from "@hris/shared";
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
import { getEmployeeAccountStates, listDataChangeReviewers } from "../iam/index.ts";
import { notify } from "../notification/index.ts";
import { getMasterLookup } from "../organization/index.ts";
import {
  contains,
  employeeRefs,
  employeeText,
  meta,
  paging,
  parse,
  toDate,
  toIso,
} from "./archive.service.ts";
import * as repo from "./data-change.repository.ts";
import type { DataChangeQueueQuery, SensitiveArchiveQuery } from "./data-change.schema.ts";
import * as documents from "./document.repository.ts";
import * as policy from "./employee.policy.ts";
import * as employees from "./employee.repository.ts";
import {
  archiveEmployeeWhere,
  employeeTargetOf,
  type RequestContext,
  todayInJakarta,
} from "./employee.service.ts";
import * as wizard from "./onboarding-wizard.repository.ts";
import { personalOf } from "./onboarding-wizard.service.ts";

// D-054 / OD-6 (Arsip gelombang 1c, design/arsip-karyawan.md §6.2, §7.1, §8): karyawan mengajukan
// perubahan data dirinya; data baru berlaku setelah disetujui SA / HR ber-grant. Isi pengajuan sensitif:
// hanya pemilik & pemeriksa yang berhak yang melihatnya; notifikasi/email hanya menyebut nama bagian.

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
const auditBase = (ctx: RequestContext) => ({
  actorAccountId: ctx.actor.accountId,
  requestId: ctx.requestId ?? null,
  ip: ctx.ip ?? null,
});
const isUnique = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** Grant bagian yang dibutuhkan pemeriksa HR (selain `employee.changes.review`). */
function sectionGrants(section: DataChangeSection, sensitiveDocument: boolean): Permission[] {
  if (section === "PERSONAL" || section === "FAMILY")
    return ["employee.personal.read", "employee.personal.write"];
  if (section === "BANK") return ["employee.bank.read", "employee.bank.write"];
  if (section === "DOCUMENT" && sensitiveDocument)
    return ["employee.documents.read", "employee.documents.write"];
  return [];
}
const isSensitiveSection = (section: DataChangeSection, sensitiveDocument: boolean) =>
  section === "PERSONAL" || section === "FAMILY" || section === "BANK" || sensitiveDocument;

// ── Data milik sendiri ──────────────────────────────────────────────────────

async function loadMine(ctx: RequestContext) {
  const employeeId = ctx.actor.employeeId;
  if (!employeeId) throw new NotFoundError("Akun Anda belum terhubung ke data karyawan.");
  const row = await wizard.loadSelf(employeeId);
  if (row?.onboardingStatus !== "APPROVED") {
    throw new NotFoundError("Akun Anda belum terhubung ke data karyawan.");
  }
  return row;
}

const personalCurrent = (row: wizard.SelfRow) => {
  const all = personalOf(row) as Record<string, unknown>;
  return Object.fromEntries(PERSONAL_CHANGE_FIELDS.map((key) => [key, all[key] ?? null]));
};
const emergencyCurrent = (row: wizard.SelfRow) => ({
  name: row.emergencyContactName,
  relationship: row.emergencyContactRelationship,
  phone: row.emergencyPhone,
});
const familyCurrent = (row: wizard.SelfRow) =>
  row.familyMembers.map((m) => ({
    name: m.name,
    relationship: m.relationship,
    birthDate: m.birthDate ? toIso(m.birthDate) : null,
    phoneNumber: m.phoneNumber,
  }));
const bankCurrent = (row: wizard.SelfRow) => ({
  bankName: row.bankAccount?.bankName ?? null,
  accountNumber: row.bankAccount?.accountNumber ?? null,
  accountHolder: row.bankAccount?.accountHolder ?? null,
});

/** ESS "Data saya": nilai sekarang + bagian yang sedang menunggu persetujuan. Rekening tersamar. */
export async function getMyData(ctx: RequestContext) {
  const row = await loadMine(ctx);
  const requests = await repo.listOfEmployee(row.id);
  const bank = bankCurrent(row);
  return {
    employeeId: row.id,
    fullName: row.fullName,
    personal: personalCurrent(row),
    emergency: emergencyCurrent(row),
    family: familyCurrent(row),
    bank: { ...bank, accountNumber: maskAccountNumber(bank.accountNumber) },
    pendingSections: [
      ...new Set(requests.filter((r) => r.status === "PENDING").map((r) => r.section)),
    ],
  };
}

export async function createMyUploadUrl(
  ctx: RequestContext,
  input: { purpose: "BANK" | "DOCUMENT"; documentTypeId?: string | undefined; contentType: string },
) {
  const row = await loadMine(ctx);
  const type = await uploadableType(input.purpose, input.documentTypeId);
  if (!type.allowedMimeTypes.includes(input.contentType)) {
    throw new BusinessRuleError(`Format file tidak diizinkan untuk ${type.name}.`);
  }
  const path = `${documentDir(ctx, row.id)}${crypto.randomUUID()}.${EXTENSION[input.contentType]}`;
  const upload = await storageOf(ctx).createSignedUploadUrl(EMPLOYEE_DOCUMENT_BUCKET, path);
  return {
    bucket: EMPLOYEE_DOCUMENT_BUCKET,
    path,
    token: upload.token,
    signedUrl: upload.signedUrl,
    maxBytes: type.maxSizeMb * MB,
  };
}

/** Rekening → buku tabungan; dokumen → jenis yang boleh diunggah karyawan (`employee_can_upload`). */
async function uploadableType(purpose: "BANK" | "DOCUMENT", documentTypeId?: string) {
  const type =
    purpose === "BANK"
      ? await repo.findTypeByCode("BANK_BOOK")
      : documentTypeId
        ? await documents.findType(documentTypeId)
        : null;
  if (!type || type.deletedAt) throw new NotFoundError("Jenis dokumen tidak ditemukan.");
  if (purpose === "DOCUMENT" && !type.employeeCanUpload) {
    throw new BusinessRuleError(`${type.name} hanya bisa diunggah HR.`);
  }
  return type;
}

/** Berkas unggahan karyawan: path miliknya, format & ukuran sesuai jenis (pola D-037). */
async function verifyUpload(
  ctx: RequestContext,
  employeeId: string,
  path: string,
  type: { name: string; allowedMimeTypes: string[]; maxSizeMb: number },
) {
  if (!path.startsWith(documentDir(ctx, employeeId))) {
    throw new BusinessRuleError("Dokumen tidak valid untuk karyawan ini.");
  }
  const storage = storageOf(ctx);
  const info = await storage.getObjectInfo(EMPLOYEE_DOCUMENT_BUCKET, path);
  if (!info) throw new BusinessRuleError("Dokumen belum terunggah. Coba unggah ulang.");
  if (
    !type.allowedMimeTypes.includes(info.contentType ?? "") ||
    info.size <= 0 ||
    info.size > type.maxSizeMb * MB
  ) {
    await storage.removeObjects(EMPLOYEE_DOCUMENT_BUCKET, [path]);
    throw new BusinessRuleError(`File harus sesuai format & maksimal ${type.maxSizeMb} MB.`);
  }
  return info;
}

const pick = (source: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.map((key) => [key, source[key] ?? null]));

function noChange(): never {
  throw new BusinessRuleError("Tidak ada perubahan dibanding data sekarang.");
}

export async function submitDataChange(ctx: RequestContext, body: unknown) {
  const input: DataChangeInput = parse(dataChangeInputSchema, body);
  const row = await loadMine(ctx);
  if (!policy.canSubmitDataChange(ctx.actor, employeeTargetOf(row))) throw new ForbiddenError();

  let payload: Record<string, unknown>;
  let fields: string[];
  let upload: {
    path: string;
    type: Awaited<ReturnType<typeof uploadableType>>;
    meta?: {
      documentNumber: string | null;
      issuedAt: string | null;
      expiresAt: string | null;
      note: string | null;
    };
  } | null = null;
  switch (input.section) {
    case "PERSONAL": {
      fields = changedFields(personalCurrent(row), input.data as Record<string, unknown>);
      if (fields.length === 0) noChange();
      payload = pick(input.data as Record<string, unknown>, fields);
      break;
    }
    case "EMERGENCY": {
      fields = changedFields(emergencyCurrent(row), input.data as Record<string, unknown>);
      if (fields.length === 0) noChange();
      payload = pick(input.data as Record<string, unknown>, fields);
      break;
    }
    case "FAMILY": {
      const members = input.data.members.map((m) => ({
        name: m.name,
        relationship: m.relationship,
        birthDate: m.birthDate ?? null,
        phoneNumber: m.phoneNumber ?? null,
      }));
      if (JSON.stringify(members) === JSON.stringify(familyCurrent(row))) noChange();
      payload = { members };
      fields = ["members"];
      break;
    }
    case "BANK": {
      const { bankBookPath, ...bank } = input.data;
      const proposed = {
        bankName: bank.bankName ?? null,
        accountNumber: bank.accountNumber ?? null,
        accountHolder: bank.accountHolder ?? null,
      };
      fields = changedFields(bankCurrent(row), proposed);
      if (fields.length === 0) noChange();
      payload = proposed;
      upload = { path: bankBookPath, type: await uploadableType("BANK") };
      break;
    }
    case "DOCUMENT": {
      const type = await uploadableType("DOCUMENT", input.data.documentTypeId);
      const today = todayInJakarta();
      const d = input.data;
      if (d.issuedAt && d.issuedAt > today) {
        throw new ValidationError([
          {
            path: "issuedAt",
            code: "custom",
            message: "Tanggal terbit tidak boleh di masa depan.",
          },
        ]);
      }
      if (
        (type.hasExpiry && !d.expiresAt) ||
        (d.issuedAt && d.expiresAt && d.expiresAt < d.issuedAt)
      ) {
        throw new ValidationError([
          {
            path: "expiresAt",
            code: "custom",
            message:
              type.hasExpiry && !d.expiresAt
                ? "Tanggal kedaluwarsa wajib untuk jenis dokumen ini."
                : "Tanggal kedaluwarsa tidak boleh sebelum tanggal terbit.",
          },
        ]);
      }
      const meta = {
        documentNumber: d.documentNumber,
        issuedAt: d.issuedAt,
        expiresAt: d.expiresAt,
        note: d.note,
      };
      payload = { documentTypeId: type.id, ...meta };
      fields = ["document"];
      upload = { path: d.path, type, meta };
      break;
    }
  }

  const info = upload ? await verifyUpload(ctx, row.id, upload.path, upload.type) : null;
  const discard = async () => {
    if (upload) await storageOf(ctx).removeObjects(EMPLOYEE_DOCUMENT_BUCKET, [upload.path]);
  };
  let created: { id: string };
  try {
    created = await employees.withTransaction(async (tx) => {
      const doc =
        upload && info
          ? await documents.createDocument(tx, {
              employeeId: row.id,
              type: upload.type.legacyType ?? "OTHER",
              documentTypeId: upload.type.id,
              documentNumber: upload.meta?.documentNumber ?? null,
              issuedAt: upload.meta?.issuedAt ? toDate(upload.meta.issuedAt) : null,
              expiresAt: upload.meta?.expiresAt ? toDate(upload.meta.expiresAt) : null,
              note: upload.meta?.note ?? null,
              // Belum berlaku sampai pengajuan disetujui.
              isCurrent: false,
              status: "PENDING_REVIEW",
              storagePath: upload.path,
              mimeType: info.contentType ?? "application/octet-stream",
              sizeBytes: info.size,
              uploadedBy: ctx.actor.accountId,
            })
          : null;
      const request = await repo.createRequest(tx, {
        employeeId: row.id,
        section: input.section,
        payload: payload as Prisma.InputJsonValue,
        documentId: doc?.id ?? null,
        submittedBy: ctx.actor.accountId,
      });
      await writeAudit(
        {
          ...auditBase(ctx),
          action: "employee.data_change.submit",
          entityType: "employee.data_change",
          entityId: request.id,
          after: { employeeId: row.id, section: input.section, fields },
        },
        tx,
      );
      return request;
    });
  } catch (error) {
    await discard();
    if (isUnique(error)) {
      throw new ConflictError(
        `Masih ada pengajuan ${DATA_CHANGE_SECTION_LABELS[input.section].toLowerCase()} yang menunggu persetujuan.`,
      );
    }
    throw error;
  }

  const reviewers = (
    await listDataChangeReviewers(
      row.companyId,
      sectionGrants(input.section, upload?.type.sensitive ?? false),
    )
  ).filter((r) => r.accountId !== ctx.actor.accountId);
  if (reviewers.length > 0) {
    await notify({
      recipients: reviewers,
      type: "employee.data_change_submitted",
      title: "Pengajuan perubahan data",
      body: `${row.fullName} mengajukan perubahan ${DATA_CHANGE_SECTION_LABELS[input.section].toLowerCase()}.`,
      link: `/pengajuan-data?id=${created.id}`,
      dedupeKey: `data-change:${created.id}:submitted`,
      email: true,
    });
  }
  return { id: created.id };
}

// ── Tampilan pengajuan ──────────────────────────────────────────────────────

type Viewer = "owner" | "reviewer";

function summaryDto(row: repo.RequestRow) {
  return {
    id: row.id,
    section: row.section,
    status: row.status,
    documentType: row.document?.documentType
      ? { id: row.document.documentType.id, name: row.document.documentType.name }
      : null,
    fields: fieldsOf(row),
    reviewNote: row.reviewNote,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const fieldsOf = (row: repo.RequestRow) =>
  row.section === "DOCUMENT" ? ["document"] : Object.keys(row.payload as Record<string, unknown>);

/** Isi tampilan: pemilik melihat rekening tersamar; pemeriksa melihat penuh. */
function shown(section: DataChangeSection, value: Record<string, unknown> | null, viewer: Viewer) {
  if (!value || section !== "BANK" || viewer === "reviewer") return value;
  return { ...value, accountNumber: maskAccountNumber(value.accountNumber as string | null) };
}

async function currentValues(row: repo.RequestRow) {
  const self = await wizard.loadSelf(row.employeeId);
  if (!self) return null;
  switch (row.section) {
    case "PERSONAL":
      return pick(personalCurrent(self), fieldsOf(row));
    case "EMERGENCY":
      return pick(emergencyCurrent(self), fieldsOf(row));
    case "FAMILY":
      return { members: familyCurrent(self) };
    case "BANK":
      return bankCurrent(self);
    case "DOCUMENT":
      return null;
  }
}

export async function listMyDataChanges(ctx: RequestContext) {
  const row = await loadMine(ctx);
  const rows = await repo.listOfEmployee(row.id);
  return rows.map(summaryDto);
}

async function loadRequest(ctx: RequestContext, id: string, tx?: employees.EmployeeTx) {
  const row = await repo.findRequest(id, tx);
  if (!row) throw new NotFoundError("Pengajuan tidak ditemukan.");
  const target = employeeTargetOf(row.employee);
  const sensitiveDocument = row.document?.documentType.sensitive ?? false;
  const owner = policy.canSubmitDataChange(ctx.actor, target);
  const reviewer = policy.canReviewDataChange(ctx.actor, target, row.section, sensitiveDocument);
  return { row, target, owner, reviewer, sensitiveDocument };
}

export async function getDataChange(ctx: RequestContext, id: string) {
  const { row, owner, reviewer, sensitiveDocument } = await loadRequest(ctx, id);
  if (!owner && !reviewer) throw new NotFoundError("Pengajuan tidak ditemukan.");
  const viewer: Viewer = reviewer ? "reviewer" : "owner";
  const lookup = await getMasterLookup();
  const ref = await employeeRefs(ctx, lookup, [row.employee]);
  const current =
    row.status === "PENDING"
      ? await currentValues(row)
      : (row.previous as Record<string, unknown> | null);
  let documentUrl: string | null = null;
  if (row.document && row.status === "PENDING") {
    const urls = await storageOf(ctx).createSignedUrls(
      EMPLOYEE_DOCUMENT_BUCKET,
      [row.document.storagePath],
      URL_TTL_SECONDS,
    );
    documentUrl = urls.get(row.document.storagePath) ?? null;
  }
  if (!owner && isSensitiveSection(row.section, sensitiveDocument)) {
    await writeAudit({
      ...auditBase(ctx),
      action: "employee.sensitive.read",
      entityType: "employee.employee",
      entityId: row.employeeId,
      after: { section: `data_change.${row.section.toLowerCase()}`, requestId: row.id },
    });
  }
  return {
    ...summaryDto(row),
    employee: ref(row.employee),
    proposed: shown(row.section, row.payload as Record<string, unknown>, viewer),
    current: shown(row.section, current, viewer),
    document: row.document
      ? {
          id: row.document.id,
          name: row.document.documentType.name,
          mimeType: row.document.mimeType,
          sizeBytes: row.document.sizeBytes,
          url: documentUrl,
        }
      : null,
    access: {
      review: reviewer && row.status === "PENDING",
      cancel: owner && row.status === "PENDING",
    },
  };
}

export async function listDataChangeQueue(ctx: RequestContext, query: DataChangeQueueQuery) {
  if (!policy.canViewDataChangeQueue(ctx.actor)) throw new ForbiddenError();
  const lookup = await getMasterLookup();
  const employeeWhere = archiveEmployeeWhere(
    ctx.actor,
    { companyId: query.companyId, departmentId: undefined, active: undefined },
    lookup,
  );
  const q = query.q?.trim();
  const where: Prisma.DataChangeRequestWhereInput = {
    employee: q ? { AND: [employeeWhere, { OR: employeeText(q) }] } : employeeWhere,
    ...(query.status ? { status: query.status } : {}),
    ...(query.section ? { section: query.section } : {}),
  };
  const { skip, take } = paging(query);
  const { rows, total } = await repo.listQueue(where, skip, take);
  const ref = await employeeRefs(
    ctx,
    lookup,
    rows.map((row) => row.employee),
  );
  return {
    data: rows.map((row) => ({
      ...summaryDto(row),
      employee: ref(row.employee),
      canReview:
        row.status === "PENDING" &&
        policy.canReviewDataChange(
          ctx.actor,
          employeeTargetOf(row.employee),
          row.section,
          row.document?.documentType.sensitive ?? false,
        ),
    })),
    meta: meta(query, total),
  };
}

// ── Batal (pemilik) & keputusan (pemeriksa) ─────────────────────────────────

async function dropDocument(tx: employees.EmployeeTx, row: repo.RequestRow, status: "REJECTED") {
  if (!row.document) return null;
  await documents.updateDocument(tx, row.document.id, {
    status,
    deletedAt: new Date(),
    isCurrent: false,
  });
  return row.document.storagePath;
}

export async function cancelDataChange(ctx: RequestContext, id: string) {
  const path = await employees.withTransaction(async (tx) => {
    const { row, owner } = await loadRequest(ctx, id, tx);
    if (!owner) throw new NotFoundError("Pengajuan tidak ditemukan.");
    if (row.status !== "PENDING") throw new BusinessRuleError("Pengajuan sudah diproses.");
    await repo.updateRequest(tx, id, { status: "CANCELLED" });
    const path = await dropDocument(tx, row, "REJECTED");
    await writeAudit(
      {
        ...auditBase(ctx),
        action: "employee.data_change.cancel",
        entityType: "employee.data_change",
        entityId: id,
        after: { employeeId: row.employeeId, section: row.section },
      },
      tx,
    );
    return path;
  });
  if (path) await storageOf(ctx).removeObjects(EMPLOYEE_DOCUMENT_BUCKET, [path]);
  return { id, status: "CANCELLED" as DataChangeStatus };
}

const dateOrNull = (value: unknown) => (typeof value === "string" ? toDate(value) : null);

async function apply(ctx: RequestContext, tx: employees.EmployeeTx, row: repo.RequestRow) {
  const payload = row.payload as Record<string, unknown>;
  const self = await wizard.loadSelf(row.employeeId);
  if (!self) throw new NotFoundError("Karyawan tidak ditemukan.");
  switch (row.section) {
    case "PERSONAL": {
      const previous = pick(personalCurrent(self), Object.keys(payload));
      const { phoneNumber, birthDate, ...rest } = payload;
      if (phoneNumber !== undefined) {
        await wizard.updateEmployeeBasics(tx, row.employeeId, {
          phoneNumber: phoneNumber as string | null,
        });
      }
      await wizard.upsertPersonal(tx, row.employeeId, {
        ...(rest as wizard.PersonalData),
        ...(birthDate !== undefined ? { birthDate: dateOrNull(birthDate) } : {}),
      });
      return previous;
    }
    case "EMERGENCY": {
      const previous = pick(emergencyCurrent(self), Object.keys(payload));
      await wizard.updateEmployeeBasics(tx, row.employeeId, {
        ...("name" in payload ? { emergencyContactName: payload.name as string | null } : {}),
        ...("relationship" in payload
          ? { emergencyContactRelationship: payload.relationship as string | null }
          : {}),
        ...("phone" in payload ? { emergencyPhone: payload.phone as string | null } : {}),
      });
      return previous;
    }
    case "FAMILY": {
      const members = payload.members as {
        name: string;
        relationship: Parameters<typeof wizard.replaceFamily>[2][number]["relationship"];
        birthDate: string | null;
        phoneNumber: string | null;
      }[];
      await wizard.replaceFamily(
        tx,
        row.employeeId,
        members.map((m) => ({ ...m, birthDate: dateOrNull(m.birthDate) })),
      );
      return { members: familyCurrent(self) };
    }
    case "BANK": {
      await wizard.upsertBank(tx, row.employeeId, {
        bankName: payload.bankName as string,
        accountNumber: payload.accountNumber as string,
        accountHolder: (payload.accountHolder as string | null) ?? null,
      });
      await activateDocument(ctx, tx, row);
      return bankCurrent(self);
    }
    case "DOCUMENT": {
      await activateDocument(ctx, tx, row);
      return null;
    }
  }
}

/** Dokumen pengajuan menjadi versi aktif (jenis tunggal: menggantikan versi aktif sebelumnya). */
async function activateDocument(
  ctx: RequestContext,
  tx: employees.EmployeeTx,
  row: repo.RequestRow,
) {
  if (!row.document) return;
  const type = row.document.documentType;
  const replaced = type.multiple
    ? []
    : await documents.findCurrentOfType(tx, row.employeeId, type.id);
  await documents.markNotCurrent(
    tx,
    replaced.map((d) => d.id),
  );
  await documents.updateDocument(tx, row.document.id, {
    isCurrent: true,
    status: "VERIFIED",
    verifiedBy: ctx.actor.accountId,
    verifiedAt: new Date(),
    version: (await repo.maxVersionOfType(tx, row.employeeId, type.id)) + 1,
    replacesId: replaced[0]?.id ?? null,
  });
}

export async function decideDataChange(ctx: RequestContext, id: string, body: unknown) {
  const input = parse(dataChangeDecisionSchema, body);
  let dropped: string | null = null;
  const row = await employees
    .withTransaction(async (tx) => {
      const { row, owner, reviewer, target } = await loadRequest(ctx, id, tx);
      if (!reviewer) {
        // Pemilik tidak memeriksa pengajuannya sendiri; pemeriksa tanpa grant bagian → 403; di luar
        // cakupan → 404 (keberadaan pengajuan tidak dibocorkan).
        const visible =
          owner ||
          (policy.canViewDataChangeQueue(ctx.actor) && policy.canViewEmployee(ctx.actor, target));
        throw visible ? new ForbiddenError() : new NotFoundError("Pengajuan tidak ditemukan.");
      }
      if (row.status !== "PENDING") throw new BusinessRuleError("Pengajuan sudah diproses.");
      const approved = input.decision === "APPROVE";
      const previous = approved ? await apply(ctx, tx, row) : null;
      if (!approved) dropped = await dropDocument(tx, row, "REJECTED");
      await repo.updateRequest(tx, id, {
        status: approved ? "APPROVED" : "REJECTED",
        reviewedBy: ctx.actor.accountId,
        reviewedAt: new Date(),
        reviewNote: input.note,
        ...(previous ? { previous: previous as Prisma.InputJsonValue } : {}),
      });
      await writeAudit(
        {
          ...auditBase(ctx),
          action: `employee.data_change.${approved ? "approve" : "reject"}`,
          entityType: "employee.data_change",
          entityId: id,
          after: { employeeId: row.employeeId, section: row.section, fields: fieldsOf(row) },
        },
        tx,
      );
      return row;
    })
    .catch((error: unknown) => {
      if (isUnique(error)) throw new BusinessRuleError("NIK KTP sudah dipakai karyawan lain.");
      throw error;
    });
  if (dropped) await storageOf(ctx).removeObjects(EMPLOYEE_DOCUMENT_BUCKET, [dropped]);

  const [account] = await getEmployeeAccountStates([row.employeeId]);
  if (account?.isActive && account.accountId !== ctx.actor.accountId) {
    const approved = input.decision === "APPROVE";
    const label = DATA_CHANGE_SECTION_LABELS[row.section].toLowerCase();
    await notify({
      recipients: [{ accountId: account.accountId, email: account.email }],
      type: "employee.data_change_decided",
      title: approved ? "Pengajuan perubahan data disetujui" : "Pengajuan perubahan data ditolak",
      body: approved
        ? `Perubahan ${label} Anda sudah berlaku.`
        : `Perubahan ${label} Anda ditolak${input.note ? `: ${input.note}` : "."}`,
      link: "/ess",
      dedupeKey: `data-change:${id}:decided`,
      email: true,
    });
  }
  return {
    id,
    status: (input.decision === "APPROVE" ? "APPROVED" : "REJECTED") as DataChangeStatus,
  };
}

// ── Arsip › Data Keluarga & Data Bank (sensitif; dibaca lewat grant, diaudit) ─

async function auditArchiveRead(ctx: RequestContext, entity: string, count: number) {
  if (count === 0) return;
  await writeAudit({
    ...auditBase(ctx),
    action: "employee.sensitive.read",
    entityType: "employee.archive",
    entityId: entity,
    after: { rows: count },
  });
}

function sensitiveEmployeeWhere(
  ctx: RequestContext,
  query: SensitiveArchiveQuery,
  lookup: Awaited<ReturnType<typeof getMasterLookup>>,
) {
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

export async function listFamilyArchive(ctx: RequestContext, query: SensitiveArchiveQuery) {
  if (!policy.seesFamilyArchive(ctx.actor)) throw new ForbiddenError();
  const lookup = await getMasterLookup();
  const employeeWhere = sensitiveEmployeeWhere(ctx, query, lookup);
  const q = query.q?.trim();
  const where: Prisma.FamilyMemberWhereInput = {
    employee: employeeWhere,
    ...(query.relationship ? { relationship: query.relationship } : {}),
    ...(q ? { OR: [{ employee: { OR: employeeText(q) } }, { name: contains(q) }] } : {}),
  };
  const { skip, take } = paging(query);
  const { rows, total } = await repo.listFamilies(where, skip, take);
  const ref = await employeeRefs(
    ctx,
    lookup,
    rows.map((row) => row.employee),
  );
  await auditArchiveRead(ctx, "families", rows.length);
  return {
    data: rows.map((row) => ({
      id: row.id,
      employee: ref(row.employee),
      name: row.name,
      relationship: row.relationship,
      birthDate: row.birthDate ? toIso(row.birthDate) : null,
      phoneNumber: row.phoneNumber,
    })),
    meta: meta(query, total),
  };
}

export async function listBankArchive(ctx: RequestContext, query: SensitiveArchiveQuery) {
  if (!policy.seesBankArchive(ctx.actor)) throw new ForbiddenError();
  const lookup = await getMasterLookup();
  const employeeWhere = sensitiveEmployeeWhere(ctx, query, lookup);
  const q = query.q?.trim();
  const where: employees.EmployeeWhere = q
    ? {
        AND: [
          employeeWhere,
          { OR: [...employeeText(q), { bankAccount: { is: { bankName: contains(q) } } }] },
        ],
      }
    : employeeWhere;
  const { skip, take } = paging(query);
  const { rows, total } = await repo.listBankAccounts(where, skip, take);
  const ref = await employeeRefs(ctx, lookup, rows);
  await auditArchiveRead(ctx, "bank-accounts", rows.length);
  return {
    data: rows.map((row) => ({
      id: row.id,
      employee: ref(row),
      bankName: row.bankAccount?.bankName ?? null,
      accountNumber: row.bankAccount?.accountNumber ?? null,
      accountHolder: row.bankAccount?.accountHolder ?? null,
    })),
    meta: meta(query, total),
  };
}
