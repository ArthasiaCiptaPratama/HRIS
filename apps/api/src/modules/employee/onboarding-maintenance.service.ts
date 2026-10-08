import { writeAudit } from "../../core/audit.ts";
import type { Logger } from "../../core/logger.ts";
import {
  EMPLOYEE_DOCUMENT_BUCKET,
  EMPLOYEE_PHOTO_BUCKET,
  type StorageAdmin,
} from "../../core/storage.ts";
import type { AuthAdmin } from "../../core/supabase-admin.ts";
import { listOnboardingReviewers, purgeAccountOfEmployee } from "../iam/index.ts";
import { forgetRecipient, notify } from "../notification/index.ts";
import * as employeeRepo from "./employee.repository.ts";
import * as repo from "./onboarding.repository.ts";
import { CANCELLED_RETENTION_DAYS } from "./onboarding-review.service.ts";

// D-045 d (design §11): cron harian `onboarding-maintenance` — hapus permanen calon batal > 30 hari,
// pengingat undangan > 14 hari ke HR/SA, dan (di app.ts) sisa antrean undangan.

export interface MaintenanceDeps {
  authAdmin: AuthAdmin;
  storage: StorageAdmin;
  /** Domain alamat anonim user Auth yang datanya dihapus (LOGIN_EMAIL_DOMAIN atau bawaan). */
  anonymousDomain: string;
  logger: Logger;
}

export const INVITE_REMINDER_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const PURGE_PER_RUN = 50;

/** Hapus permanen calon Dibatalkan > 30 hari: data karyawan (CASCADE), akun, notifikasi, file. */
export async function purgeCancelledCandidates(deps: MaintenanceDeps, now = new Date()) {
  const cutoff = new Date(now.getTime() - CANCELLED_RETENTION_DAYS * DAY_MS);
  const rows = await repo.findCancelledBefore(cutoff, PURGE_PER_RUN);
  let purged = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const account = await employeeRepo.withTransaction(async (tx) => {
        const removed = await purgeAccountOfEmployee(
          row.id,
          { authAdmin: deps.authAdmin, anonymousDomain: deps.anonymousDomain },
          tx,
        );
        await repo.deleteEmployee(tx, row.id);
        // Audit tanpa data pribadi; id tetap untuk jejak (data sudah tidak ada).
        await writeAudit(
          {
            actorAccountId: null,
            requestId: null,
            ip: null,
            entityType: "employee.employee",
            entityId: row.id,
            action: "employee.onboarding.purge",
            after: { reason: "cancelled_retention", days: CANCELLED_RETENTION_DAYS },
          },
          tx,
        );
        return removed;
      });
      purged += 1;
      if (account) await forgetRecipient(account.accountId, account.emails);
      // File terakhir: gagal hapus file tidak membatalkan penghapusan data (dicatat di log).
      const documents = row.documents.map((d) => d.storagePath);
      try {
        if (documents.length > 0)
          await deps.storage.removeObjects(EMPLOYEE_DOCUMENT_BUCKET, documents);
        if (row.photoPath) await deps.storage.removeObjects(EMPLOYEE_PHOTO_BUCKET, [row.photoPath]);
      } catch (error) {
        deps.logger.warn("onboarding purge: storage cleanup failed", {
          employeeId: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      failed += 1;
      deps.logger.error("onboarding purge failed", {
        employeeId: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { purged, failed };
}

/** Pengingat SEKALI per calon: masih Diundang > 14 hari sejak undangan terkirim. */
export async function remindStaleInvitations(now = new Date()) {
  const cutoff = new Date(now.getTime() - INVITE_REMINDER_DAYS * DAY_MS);
  const rows = await repo.findStaleInvited(cutoff, 200);
  let created = 0;
  for (const row of rows) {
    const reviewers = await listOnboardingReviewers(row.companyId, now);
    const result = await notify(
      {
        recipients: reviewers,
        type: "employee.onboarding_invite_stale",
        title: "Undangan aktivasi belum dipakai",
        body: `${row.fullName} (${row.employeeNumber}) belum mengaktifkan akun lebih dari ${INVITE_REMINDER_DAYS} hari. Kirim ulang undangan atau hubungi calon.`,
        link: "/penerimaan",
        dedupeKey: `onboarding-invite-stale:${row.id}`,
        email: true,
      },
      now,
    );
    created += result.created;
  }
  return { stale: rows.length, notified: created };
}
