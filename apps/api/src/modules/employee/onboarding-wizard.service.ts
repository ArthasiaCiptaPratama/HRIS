import {
  bankSectionSchema,
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
  emergencySectionSchema,
  familySectionSchema,
  type MissingItem,
  type OnboardingSection,
  type OnboardingSnapshot,
  onboardingCompleteness,
  personalSectionSchema,
  professionalSectionSchema,
  type ReviewSection,
} from "@hris/shared";
import type { z } from "zod";
import type { Actor } from "../../core/access/index.ts";
import { writeAudit } from "../../core/audit.ts";
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../core/errors.ts";
import {
  EMPLOYEE_DOCUMENT_BUCKET,
  EMPLOYEE_DOCUMENT_MAX_BYTES,
  EMPLOYEE_DOCUMENT_MIME_TYPES,
  EMPLOYEE_PHOTO_BUCKET,
  type StorageAdmin,
  UNCONFIGURED_STORAGE,
} from "../../core/storage.ts";
import { listOnboardingReviewers } from "../iam/index.ts";
import { notify } from "../notification/index.ts";
import * as employeeRepo from "./employee.repository.ts";
import * as onboardingRepo from "./onboarding.repository.ts";
import * as repo from "./onboarding-wizard.repository.ts";

// D-045 bagian b (design §7, D-046): wizard isi data oleh pemilik data sendiri.
// - Calon (status Mengisi data / Perlu revisi): boleh menulis semua bagian; setelah Kirim terkunci.
// - Karyawan existing (completion_required): hanya mengisi field yang masih KOSONG (OD-6 tetap untuk
//   data yang sudah ada); tidak dikunci dari aplikasi.

export interface WizardContext {
  actor: Actor;
  requestId?: string | undefined;
  ip?: string | undefined;
  storage?: StorageAdmin | undefined;
  storagePathPrefix?: string | undefined;
}

type Mode = "candidate" | "completion";
const URL_TTL_SECONDS = 10 * 60;
const SINGLE_DOCUMENT: readonly DocumentType[] = [
  "KTP",
  "KK",
  "DIPLOMA",
  "BANK_BOOK",
  "NPWP",
  "BPJS_EMPLOYMENT",
  "BPJS_HEALTH",
];
const EXTENSION: Record<(typeof EMPLOYEE_DOCUMENT_MIME_TYPES)[number], string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

const storageOf = (ctx: WizardContext) => ctx.storage ?? UNCONFIGURED_STORAGE;
const documentDir = (ctx: WizardContext, employeeId: string) =>
  `${ctx.storagePathPrefix ?? ""}employees/${employeeId}/documents/`;

function auditBase(ctx: WizardContext, employeeId: string) {
  return {
    actorAccountId: ctx.actor.accountId,
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
    entityType: "employee.employee",
    entityId: employeeId,
  };
}

function modeOf(row: repo.SelfRow): { mode: Mode | null; editable: boolean } {
  if (row.onboardingStatus === "APPROVED") {
    return row.completionRequired
      ? { mode: "completion", editable: row.completionSubmittedAt === null }
      : { mode: null, editable: false };
  }
  const editable = ["INVITED", "FILLING", "REVISION_REQUESTED"].includes(row.onboardingStatus);
  return { mode: "candidate", editable };
}

/**
 * D-045 c: catatan revisi yang sedang berlaku — calon berstatus Perlu revisi, atau karyawan existing
 * yang kirimannya dikembalikan (keputusan terbaru mode lengkapi = revisi). null = tidak sedang revisi.
 */
export function activeRevision(
  row: repo.SelfRow,
): { notes: Partial<Record<ReviewSection, string>>; decidedAt: string } | null {
  const { mode, editable } = modeOf(row);
  if (!mode || !editable) return null;
  const latest = row.onboardingReviews.find((r) => r.completion === (mode === "completion"));
  const current =
    latest?.decision === "REVISION_REQUESTED" &&
    (mode === "completion" || row.onboardingStatus === "REVISION_REQUESTED");
  if (!latest || !current) return null;
  return {
    notes: (latest.sectionNotes ?? {}) as Partial<Record<ReviewSection, string>>,
    decidedAt: latest.decidedAt.toISOString(),
  };
}

async function loadMine(ctx: WizardContext) {
  if (!ctx.actor.employeeId) throw new NotFoundError("Akun ini tidak tertaut data karyawan.");
  const row = await repo.loadSelf(ctx.actor.employeeId);
  if (!row) throw new NotFoundError("Data karyawan tidak ditemukan.");
  return { row, ...modeOf(row), revision: activeRevision(row) };
}

type MineState = Awaited<ReturnType<typeof loadMine>>;

function assertEditable(state: MineState, section?: ReviewSection) {
  if (!state.mode) throw new ForbiddenError("Tidak ada data onboarding yang perlu dilengkapi.");
  if (!state.editable) {
    throw new BusinessRuleError("Data sudah dikirim dan sedang direview; tidak bisa diubah.");
  }
  // Revisi: hanya bagian yang diberi catatan reviewer yang terbuka (design §7).
  if (section && state.revision && !state.revision.notes[section]) {
    throw new BusinessRuleError("Bagian ini tidak diminta diperbaiki oleh HR.");
  }
}

function parseSection<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
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

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const filled = (v: unknown) => v !== null && v !== undefined && v !== "";

/** Mode lengkapi: field yang sudah terisi tidak boleh diubah (D-046 + keputusan 2026-10-02). */
function assertOnlyEmpty(current: Record<string, unknown>, incoming: Record<string, unknown>) {
  const changed = Object.entries(incoming).filter(
    ([key, value]) =>
      value !== undefined &&
      filled(current[key]) &&
      JSON.stringify(current[key]) !== JSON.stringify(value),
  );
  if (changed.length > 0) {
    throw new BusinessRuleError(
      "Data yang sudah terisi tidak bisa diubah sendiri. Hubungi HR untuk mengoreksinya.",
      changed.map(([key]) => ({ path: key })),
    );
  }
}

// ── Snapshot & DTO ────────────────────────────────────────────────────────────────────────────

function personalOf(row: repo.SelfRow) {
  const p = row.personal;
  return {
    fullName: row.fullName,
    gender: row.gender,
    birthPlace: p?.birthPlace ?? null,
    birthDate: iso(p?.birthDate),
    ktpNumber: p?.ktpNumber ?? null,
    kkNumber: p?.kkNumber ?? null,
    religion: p?.religion ?? null,
    maritalStatus: p?.maritalStatus ?? null,
    ktpAddress: p?.ktpAddress ?? null,
    domicileAddress: p?.domicileAddress ?? null,
    originCity: p?.originCity ?? null,
    phoneNumber: row.phoneNumber,
    npwpNumber: p?.npwpNumber ?? null,
    npwpAbsent: p?.npwpAbsent ?? false,
    bpjsEmploymentNumber: p?.bpjsEmploymentNumber ?? null,
    bpjsEmploymentAbsent: p?.bpjsEmploymentAbsent ?? false,
    bpjsHealthNumber: p?.bpjsHealthNumber ?? null,
    bpjsHealthAbsent: p?.bpjsHealthAbsent ?? false,
  };
}

export function snapshotOf(row: repo.SelfRow): OnboardingSnapshot {
  return {
    personal: personalOf(row),
    emergency: {
      name: row.emergencyContactName,
      relationship: row.emergencyContactRelationship,
      phone: row.emergencyPhone,
    },
    family: row.familyMembers.map((m) => ({ name: m.name, relationship: m.relationship })),
    bank: {
      bankName: row.bankAccount?.bankName ?? null,
      accountNumber: row.bankAccount?.accountNumber ?? null,
      accountHolder: row.bankAccount?.accountHolder ?? null,
    },
    educations: row.educations
      .filter((e) => e.level !== null)
      .map((e) => ({ level: e.level as string, schoolName: e.schoolName })),
    documents: row.documents.map((d) => d.type),
    hasPhoto: row.photoPath !== null,
  };
}

export async function getMyOnboarding(ctx: WizardContext) {
  const { row } = await loadMine(ctx);
  return describeOnboarding(row, storageOf(ctx), ctx.actor.accountId);
}

/**
 * Tampilan isian onboarding satu karyawan (wizard pemilik & halaman review). `viewerAccountId` = pemilik
 * data (boleh menghapus dokumen sendiri) — reviewer memberi null.
 */
export async function describeOnboarding(
  row: repo.SelfRow,
  storage: StorageAdmin,
  viewerAccountId: string | null,
) {
  const { mode, editable: rawEditable } = modeOf(row);
  const editable = viewerAccountId !== null && rawEditable;
  const revision = activeRevision(row);
  const [docUrls, photoUrls] = await Promise.all([
    row.documents.length > 0
      ? storage.createSignedUrls(
          EMPLOYEE_DOCUMENT_BUCKET,
          row.documents.map((d) => d.storagePath),
          URL_TTL_SECONDS,
        )
      : Promise.resolve(new Map<string, string>()),
    row.photoPath
      ? storage.createSignedUrls(EMPLOYEE_PHOTO_BUCKET, [row.photoPath], URL_TTL_SECONDS)
      : Promise.resolve(new Map<string, string>()),
  ]);
  const missing: MissingItem[] = mode ? onboardingCompleteness(snapshotOf(row)) : [];
  return {
    employeeId: row.id,
    status: row.onboardingStatus,
    mode,
    editable,
    submittedAt: row.completionSubmittedAt?.toISOString() ?? null,
    revision,
    personal: personalOf(row),
    emergency: {
      name: row.emergencyContactName,
      relationship: row.emergencyContactRelationship,
      phone: row.emergencyPhone,
    },
    family: row.familyMembers.map((m) => ({
      name: m.name,
      relationship: m.relationship,
      birthDate: iso(m.birthDate),
      phoneNumber: m.phoneNumber,
    })),
    bank: {
      bankName: row.bankAccount?.bankName ?? null,
      accountNumber: row.bankAccount?.accountNumber ?? null,
      accountHolder: row.bankAccount?.accountHolder ?? null,
    },
    educations: row.educations.map((e) => ({
      level: e.level,
      schoolName: e.schoolName,
      major: e.major,
      graduationYear: e.graduationYear,
    })),
    trainings: row.trainings.map((t) => ({
      trainingField: t.trainingField,
      organizer: t.organizer,
      trainingYear: t.trainingYear,
    })),
    workExperiences: row.workExperiences.map((w) => ({
      companyName: w.companyName,
      position: w.position,
      startYear: w.startYear,
      endYear: w.endYear,
    })),
    documents: row.documents.map((d) => ({
      id: d.id,
      type: d.type,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      url: docUrls.get(d.storagePath) ?? null,
      // Mode lengkapi: dokumen lama (bukan unggahan sendiri) tidak bisa dihapus sendiri.
      removable:
        editable &&
        (!revision || Boolean(revision.notes.documents)) &&
        (mode === "candidate" || d.uploadedBy === viewerAccountId),
    })),
    photoUrl: row.photoPath ? (photoUrls.get(row.photoPath) ?? null) : null,
    missing,
  };
}
export type MyOnboarding = Awaited<ReturnType<typeof describeOnboarding>>;

// ── Simpan draf per bagian ──────────────────────────────────────────────────────────────────

export async function saveSection(ctx: WizardContext, section: OnboardingSection, body: unknown) {
  const state = await loadMine(ctx);
  assertEditable(state, section);
  const { row, mode } = state;
  const completion = mode === "completion";
  await employeeRepo.withTransaction(async (tx) => {
    switch (section) {
      case "personal": {
        const input = parseSection(personalSectionSchema, body);
        if (completion) assertOnlyEmpty(personalOf(row), input);
        await repo.updateEmployeeBasics(tx, row.id, {
          ...(input.fullName ? { fullName: input.fullName } : {}),
          ...(input.gender !== undefined ? { gender: input.gender } : {}),
          ...(input.phoneNumber !== undefined ? { phoneNumber: input.phoneNumber } : {}),
        });
        const { fullName: _f, gender: _g, phoneNumber: _p, birthDate, ...rest } = input;
        await repo.upsertPersonal(tx, row.id, {
          ...rest,
          ...(birthDate !== undefined
            ? { birthDate: birthDate ? new Date(`${birthDate}T00:00:00.000Z`) : null }
            : {}),
        });
        break;
      }
      case "emergency": {
        const input = parseSection(emergencySectionSchema, body);
        if (completion)
          assertOnlyEmpty(
            {
              name: row.emergencyContactName,
              relationship: row.emergencyContactRelationship,
              phone: row.emergencyPhone,
            },
            input,
          );
        await repo.updateEmployeeBasics(tx, row.id, {
          ...(input.name !== undefined ? { emergencyContactName: input.name } : {}),
          ...(input.relationship !== undefined
            ? { emergencyContactRelationship: input.relationship }
            : {}),
          ...(input.phone !== undefined ? { emergencyPhone: input.phone } : {}),
        });
        break;
      }
      case "family": {
        const input = parseSection(familySectionSchema, body);
        if (completion && row.familyMembers.length > 0) {
          throw new BusinessRuleError("Data keluarga sudah terisi; koreksi lewat HR.");
        }
        await repo.replaceFamily(
          tx,
          row.id,
          input.members.map((m) => ({
            name: m.name,
            relationship: m.relationship,
            birthDate: m.birthDate ? new Date(`${m.birthDate}T00:00:00.000Z`) : null,
            phoneNumber: m.phoneNumber ?? null,
          })),
        );
        break;
      }
      case "bank": {
        const input = parseSection(bankSectionSchema, body);
        if (completion && row.bankAccount) {
          throw new BusinessRuleError("Rekening sudah terisi; koreksi lewat HR.");
        }
        // Nama bank & nomor rekening disimpan bersama (kolom wajib di tabel rekening).
        if (Boolean(input.bankName) !== Boolean(input.accountNumber)) {
          throw new ValidationError([
            { path: "accountNumber", message: "Isi nama bank dan nomor rekening bersamaan." },
          ]);
        }
        if (input.bankName && input.accountNumber) {
          await repo.upsertBank(tx, row.id, {
            bankName: input.bankName,
            accountNumber: input.accountNumber,
            accountHolder: input.accountHolder ?? null,
          });
        }
        break;
      }
      case "professional": {
        const input = parseSection(professionalSectionSchema, body);
        if (completion && row.educations.length > 0) {
          throw new BusinessRuleError("Data pendidikan sudah terisi; koreksi lewat HR.");
        }
        await repo.replaceProfessional(tx, row.id, {
          educations: input.educations.map((e) => ({
            level: e.level,
            schoolName: e.schoolName,
            major: e.major ?? null,
            graduationYear: e.graduationYear ?? null,
          })),
          trainings: input.trainings.map((t) => ({
            trainingField: t.trainingField,
            organizer: t.organizer ?? null,
            trainingYear: t.trainingYear ?? null,
          })),
          workExperiences: input.workExperiences.map((w) => ({
            companyName: w.companyName,
            position: w.position,
            startYear: w.startYear,
            endYear: w.endYear ?? null,
          })),
        });
        break;
      }
    }
    // Audit tanpa nilai (data pribadi): cukup bagian yang diubah.
    await writeAudit(
      { ...auditBase(ctx, row.id), action: "employee.onboarding.self_update", after: { section } },
      tx,
    );
  });
  return getMyOnboarding(ctx);
}

// ── Dokumen ──────────────────────────────────────────────────────────────────────────────────

export async function createDocumentUploadUrl(
  ctx: WizardContext,
  input: { type: DocumentType; contentType: (typeof EMPLOYEE_DOCUMENT_MIME_TYPES)[number] },
) {
  const state = await loadMine(ctx);
  assertEditable(state, "documents");
  const path = `${documentDir(ctx, state.row.id)}${crypto.randomUUID()}.${EXTENSION[input.contentType]}`;
  const upload = await storageOf(ctx).createSignedUploadUrl(EMPLOYEE_DOCUMENT_BUCKET, path);
  return {
    bucket: EMPLOYEE_DOCUMENT_BUCKET,
    path,
    token: upload.token,
    signedUrl: upload.signedUrl,
    maxBytes: EMPLOYEE_DOCUMENT_MAX_BYTES,
  };
}

export async function confirmDocument(
  ctx: WizardContext,
  input: { type: DocumentType; path: string },
  now = new Date(),
) {
  const state = await loadMine(ctx);
  assertEditable(state, "documents");
  const { row, mode } = state;
  // Path wajib milik karyawan ini di lingkungan ini (pola D-037).
  if (!input.path.startsWith(documentDir(ctx, row.id))) {
    throw new BusinessRuleError("Dokumen tidak valid untuk karyawan ini.");
  }
  const storage = storageOf(ctx);
  const info = await storage.getObjectInfo(EMPLOYEE_DOCUMENT_BUCKET, input.path);
  if (!info) throw new BusinessRuleError("Dokumen belum terunggah. Coba unggah ulang.");
  const allowed = (EMPLOYEE_DOCUMENT_MIME_TYPES as readonly string[]).includes(
    info.contentType ?? "",
  );
  if (!allowed || info.size <= 0 || info.size > EMPLOYEE_DOCUMENT_MAX_BYTES) {
    await storage.removeObjects(EMPLOYEE_DOCUMENT_BUCKET, [input.path]);
    throw new BusinessRuleError("Dokumen harus PDF, JPG, atau PNG maksimal 5 MB.");
  }
  const replaced = SINGLE_DOCUMENT.includes(input.type)
    ? await repo.findActiveDocuments(row.id, input.type)
    : [];
  if (mode === "completion" && replaced.some((d) => d.uploadedBy !== ctx.actor.accountId)) {
    await storage.removeObjects(EMPLOYEE_DOCUMENT_BUCKET, [input.path]);
    throw new BusinessRuleError(
      `${DOCUMENT_TYPE_LABELS[input.type]} sudah ada; penggantian dilakukan lewat HR.`,
    );
  }
  const created = await employeeRepo.withTransaction(async (tx) => {
    await repo.archiveDocuments(
      tx,
      replaced.map((d) => d.id),
      now,
    );
    const doc = await repo.createDocument(tx, {
      employeeId: row.id,
      type: input.type,
      storagePath: input.path,
      mimeType: info.contentType ?? "application/octet-stream",
      sizeBytes: info.size,
      uploadedBy: ctx.actor.accountId,
    });
    await writeAudit(
      {
        ...auditBase(ctx, row.id),
        action: "employee.document.upload",
        after: { type: input.type, replaced: replaced.length },
      },
      tx,
    );
    return doc;
  });
  if (replaced.length > 0) {
    await storage.removeObjects(
      EMPLOYEE_DOCUMENT_BUCKET,
      replaced.map((d) => d.storagePath),
    );
  }
  return { id: created.id };
}

export async function deleteDocument(ctx: WizardContext, documentId: string, now = new Date()) {
  const state = await loadMine(ctx);
  assertEditable(state, "documents");
  const doc = await repo.findDocument(documentId);
  if (!doc || doc.employeeId !== state.row.id || doc.deletedAt) {
    throw new NotFoundError("Dokumen tidak ditemukan.");
  }
  if (state.mode === "completion" && doc.uploadedBy !== ctx.actor.accountId) {
    throw new BusinessRuleError("Dokumen lama hanya bisa dihapus lewat HR.");
  }
  await employeeRepo.withTransaction(async (tx) => {
    await repo.archiveDocuments(tx, [doc.id], now);
    await writeAudit(
      {
        ...auditBase(ctx, state.row.id),
        action: "employee.document.delete",
        after: { type: doc.type },
      },
      tx,
    );
  });
  await storageOf(ctx).removeObjects(EMPLOYEE_DOCUMENT_BUCKET, [doc.storagePath]);
  return { id: doc.id };
}

// ── Kirim untuk direview ───────────────────────────────────────────────────────────────────────

export async function submitMyOnboarding(ctx: WizardContext, now = new Date()) {
  const state = await loadMine(ctx);
  assertEditable(state);
  const missing = onboardingCompleteness(snapshotOf(state.row));
  if (missing.length > 0) {
    throw new BusinessRuleError("Data belum lengkap.", missing);
  }
  await employeeRepo.withTransaction(async (tx) => {
    if (state.mode === "candidate") {
      await onboardingRepo.setStatus(tx, state.row.id, "SUBMITTED");
      await onboardingRepo.addEvent(tx, {
        employeeId: state.row.id,
        fromStatus: state.row.onboardingStatus,
        toStatus: "SUBMITTED",
        actorAccountId: ctx.actor.accountId,
      });
    } else {
      await repo.markCompletionSubmitted(tx, state.row.id, now);
    }
    await writeAudit(
      {
        ...auditBase(ctx, state.row.id),
        action: "employee.onboarding.submit",
        after: { mode: state.mode },
      },
      tx,
    );
  });
  // Setelah commit; notify() tidak pernah melempar. Tanpa data sensitif (nama & nomor induk saja).
  const reviewers = await listOnboardingReviewers(state.row.companyId);
  await notify({
    recipients: reviewers.filter((r) => r.accountId !== ctx.actor.accountId),
    type: "employee.onboarding_submitted",
    title: "Data onboarding menunggu review",
    body: `${state.row.fullName} (${state.row.employeeNumber}) mengirim data ${
      state.mode === "candidate" ? "calon karyawan" : "kelengkapan karyawan"
    } untuk diperiksa.`,
    link: `/penerimaan/${state.row.id}`,
    email: true,
  });
  return getMyOnboarding(ctx);
}
