// D-060: proses antrean lampiran Google Drive dari Import. Satu panggilan memproses beberapa lampiran
// (dibatasi waktu, cocok untuk batas fungsi serverless); layar Import memanggil berulang sambil
// menampilkan progres. Unggah memakai layanan foto & dokumen yang sama dengan layar, jadi hak akses
// (grant dokumen sensitif, cakupan PT), validasi, versi, dan audit tetap berlaku.
import { createHash } from "node:crypto";
import { PHOTO_TARGET } from "@hris/shared";
import { AppError, BusinessRuleError, ForbiddenError, NotFoundError } from "../../core/errors.ts";
import { type DriveFileMeta, UNCONFIGURED_DRIVE } from "../../core/google-drive.ts";
import {
  EMPLOYEE_DOCUMENT_BUCKET,
  EMPLOYEE_PHOTO_BUCKET,
  EMPLOYEE_PHOTO_MAX_BYTES,
  UNCONFIGURED_STORAGE,
} from "../../core/storage.ts";
import * as documentRepo from "./document.repository.ts";
import * as documents from "./document.service.ts";
import * as policy from "./employee.policy.ts";
import { confirmPhoto, createPhotoUploadUrl, type RequestContext } from "./employee.service.ts";
import * as importRepo from "./employee-import.repository.ts";
import type { ImportAttachmentsDto } from "./employee-import.schema.ts";
import { prepareDocument, preparePhoto, SOURCE_MAX_BYTES } from "./import-attachment-files.ts";

/** Waktu kerja per panggilan; lampiran yang sedang diproses tetap diselesaikan. */
const BUDGET_MS = 20_000;
const MAX_PER_CALL = 10;
/** PROCESSING lebih lama dari ini dianggap terputus (fungsi berhenti) → boleh diklaim ulang. */
const STALE_MS = 5 * 60_000;
const MB = 1024 * 1024;

type Outcome =
  | { status: "DONE"; sourceSha256: string; documentId?: string }
  | { status: "SKIPPED" | "FAILED"; reason: string; sourceSha256?: string };

async function loadJob(ctx: RequestContext, jobId: string) {
  if (!policy.canImportEmployees(ctx.actor)) throw new ForbiddenError();
  const job = await importRepo.findJob(jobId);
  if (!job || (ctx.actor.role !== "SUPER_ADMIN" && job.actorAccountId !== ctx.actor.accountId)) {
    throw new NotFoundError("Riwayat import tidak ditemukan.");
  }
  return job;
}

function toDto(ctx: RequestContext, jobId: string, rows: importRepo.AttachmentRow[]) {
  const count = (...statuses: string[]) => rows.filter((r) => statuses.includes(r.status)).length;
  return {
    jobId,
    driveConfigured: (ctx.googleDrive ?? UNCONFIGURED_DRIVE).configured,
    counts: {
      total: rows.length,
      pending: count("PENDING", "PROCESSING"),
      done: count("DONE"),
      skipped: count("SKIPPED"),
      failed: count("FAILED"),
    },
    items: rows.map((row) => ({
      id: row.id,
      sourceRow: row.sourceRow,
      employeeNumber: row.employee.employeeNumber,
      fullName: row.employee.fullName,
      field: row.field,
      target: row.target,
      fileCount: row.driveFileIds.length,
      status: row.status,
      reason: row.reason,
    })),
  } satisfies ImportAttachmentsDto;
}

export async function listAttachments(ctx: RequestContext, jobId: string) {
  await loadJob(ctx, jobId);
  return toDto(ctx, jobId, await importRepo.listAttachments(jobId));
}

/** Import milik aktor (SA: semua) yang lampirannya belum selesai — untuk dilanjutkan dari layar Import. */
export async function listOpenAttachmentJobs(ctx: RequestContext) {
  if (!policy.canImportEmployees(ctx.actor)) throw new ForbiddenError();
  const rows = await importRepo.jobsWithOpenAttachments(
    ctx.actor.role === "SUPER_ADMIN" ? null : ctx.actor.accountId,
  );
  return rows.map(({ job, pending, failed }) => ({
    jobId: job.id,
    fileName: job.fileName,
    createdAt: job.createdAt.toISOString(),
    pending,
    failed,
  }));
}

export async function retryAttachments(ctx: RequestContext, jobId: string) {
  await loadJob(ctx, jobId);
  await importRepo.retryFailedAttachments(jobId);
  return toDto(ctx, jobId, await importRepo.listAttachments(jobId));
}

export async function processAttachments(ctx: RequestContext, jobId: string, now = Date.now) {
  await loadJob(ctx, jobId);
  const drive = ctx.googleDrive ?? UNCONFIGURED_DRIVE;
  if (!drive.configured) {
    throw new BusinessRuleError(
      "Google Drive belum dikonfigurasi di server. Lampiran tetap tersimpan dan bisa diproses nanti.",
    );
  }
  const started = now();
  let processed = 0;
  let races = 0;
  while (processed < MAX_PER_CALL && now() - started < BUDGET_MS && races < 5) {
    const { row, empty } = await importRepo.claimAttachment(
      jobId,
      new Date(now()),
      new Date(now() - STALE_MS),
    );
    if (empty) break;
    if (!row) {
      races += 1;
      continue;
    }
    const outcome = await processOne(ctx, row).catch(failure);
    await importRepo.finishAttachment(row.id, {
      status: outcome.status,
      reason: "reason" in outcome ? outcome.reason.slice(0, 300) : null,
      sourceSha256: outcome.sourceSha256 ?? null,
      documentId: outcome.status === "DONE" ? (outcome.documentId ?? null) : null,
    });
    processed += 1;
  }
  return toDto(ctx, jobId, await importRepo.listAttachments(jobId));
}

function failure(error: unknown): Outcome {
  if (error instanceof ForbiddenError) {
    return { status: "SKIPPED", reason: "Tidak berhak menulis dokumen/foto ini." };
  }
  if (error instanceof NotFoundError) {
    return { status: "SKIPPED", reason: "Karyawan tidak ditemukan atau di luar cakupan PT Anda." };
  }
  if (error instanceof AppError) return { status: "FAILED", reason: error.message };
  const message = error instanceof Error ? error.message : "kesalahan tidak dikenal";
  return { status: "FAILED", reason: `Gagal diproses: ${message}` };
}

/** Sidik jari lampiran: SHA-256 file (dari Google) — beberapa file digabung berurutan. */
function fingerprint(metas: DriveFileMeta[], downloaded?: Uint8Array[]): string | null {
  const parts = metas.map((m, i) => {
    if (m.sha256) return m.sha256;
    const bytes = downloaded?.[i];
    return bytes ? createHash("sha256").update(bytes).digest("hex") : null;
  });
  if (parts.some((p) => p === null)) return null;
  if (parts.length === 1) return parts[0] as string;
  return createHash("sha256").update(parts.join(",")).digest("hex");
}

type Claimed = NonNullable<Awaited<ReturnType<typeof importRepo.claimAttachment>>["row"]>;

async function processOne(ctx: RequestContext, row: Claimed): Promise<Outcome> {
  const drive = ctx.googleDrive ?? UNCONFIGURED_DRIVE;
  const storage = ctx.storage ?? UNCONFIGURED_STORAGE;
  const metas: DriveFileMeta[] = [];
  for (const id of row.driveFileIds) {
    const meta = await drive.getMeta(id);
    if (!meta) {
      return {
        status: "FAILED",
        reason:
          "File Drive tidak bisa dibuka — pastikan folder unggahan Form dibagikan ke service account.",
      };
    }
    if (meta.mimeType.startsWith("application/vnd.google-apps")) {
      return { status: "SKIPPED", reason: "Bukan file unggahan (dokumen Google) — unggah manual." };
    }
    if (meta.size > SOURCE_MAX_BYTES) {
      return { status: "SKIPPED", reason: "File di Drive lebih dari 20 MB — unggah manual." };
    }
    metas.push(meta);
  }

  // Sama dengan lampiran yang sudah pernah masuk → dilewati (impor ulang file yang sama).
  const known = fingerprint(metas);
  const same = (sha: string) =>
    importRepo.findDoneAttachment({
      employeeId: row.employeeId,
      target: row.target,
      note: row.note,
      sourceSha256: sha,
    });
  if (known && (await same(known))) {
    return {
      status: "SKIPPED",
      reason: "Sama dengan lampiran yang sudah diimpor.",
      sourceSha256: known,
    };
  }

  if (row.target === PHOTO_TARGET) {
    const upload = await createPhotoUploadUrl(ctx, row.employeeId, { contentType: "image/jpeg" });
    const bytes = await drive.download(row.driveFileIds[0] as string);
    const sha = known ?? (fingerprint(metas.slice(0, 1), [bytes]) as string);
    const prepared = await preparePhoto(bytes, EMPLOYEE_PHOTO_MAX_BYTES);
    if ("skip" in prepared) return { status: "SKIPPED", reason: prepared.skip, sourceSha256: sha };
    await storage.uploadObject(EMPLOYEE_PHOTO_BUCKET, upload.path, prepared.bytes, "image/jpeg");
    await confirmPhoto(ctx, row.employeeId, { path: upload.path });
    return { status: "DONE", sourceSha256: sha };
  }

  const type = (await documentRepo.listTypes(false)).find((t) => t.code === row.target);
  if (!type) {
    return { status: "SKIPPED", reason: `Jenis dokumen ${row.target} tidak ada atau diarsipkan.` };
  }
  if (type.hasExpiry) {
    return {
      status: "SKIPPED",
      reason: `${type.name} wajib tanggal kedaluwarsa — unggah manual di tab Dokumen.`,
    };
  }
  // Hak tulis dicek sebelum mengunduh (dokumen sensitif butuh grant; buku tabungan: grant rekening).
  const current = await documents.listEmployeeDocuments(ctx, row.employeeId);
  const allowed =
    type.code === "BANK_BOOK"
      ? current.access.writeBankBook
      : type.sensitive
        ? current.access.writeSensitive
        : current.access.write;
  if (!allowed) throw new ForbiddenError();

  const files: Uint8Array[] = [];
  for (const id of row.driveFileIds) files.push(await drive.download(id));
  const sha = known ?? (fingerprint(metas, files) as string);
  if (!known && (await same(sha))) {
    return {
      status: "SKIPPED",
      reason: "Sama dengan lampiran yang sudah diimpor.",
      sourceSha256: sha,
    };
  }
  const prepared = await prepareDocument(files, type.allowedMimeTypes, type.maxSizeMb * MB);
  if ("skip" in prepared) return { status: "SKIPPED", reason: prepared.skip, sourceSha256: sha };

  const upload = await documents.createUploadUrl(ctx, row.employeeId, {
    documentTypeId: type.id,
    contentType: prepared.contentType,
  });
  await storage.uploadObject(
    EMPLOYEE_DOCUMENT_BUCKET,
    upload.path,
    prepared.bytes,
    prepared.contentType,
  );
  // Jenis jamak (sertifikat lain): versi baru dari dokumen bercatatan sama; jenis tunggal otomatis.
  const previous = type.multiple
    ? current.documents.find(
        (d) => d.isCurrent && d.documentType.id === type.id && d.note === row.note,
      )
    : undefined;
  const training = type.code.startsWith("CERT_")
    ? await importRepo.findTrainingByField(row.employeeId, row.note)
    : null;
  const created = await documents.createDocument(ctx, row.employeeId, {
    documentTypeId: type.id,
    path: upload.path,
    note: row.note,
    documentNumber: row.documentNumber,
    ...(previous ? { replacesId: previous.id } : {}),
    ...(training ? { trainingId: training.id } : {}),
  });
  return { status: "DONE", sourceSha256: sha, documentId: created.id };
}
