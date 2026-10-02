import {
  type OnboardingDecisionBody,
  onboardingCompleteness,
  onboardingDecisionSchema,
  REVIEW_SECTION_LABELS,
  type ReviewSection,
} from "@hris/shared";
import { writeAudit } from "../../core/audit.ts";
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../core/errors.ts";
import type { StorageAdmin } from "../../core/storage.ts";
import { UNCONFIGURED_STORAGE } from "../../core/storage.ts";
import type { AuthAdmin } from "../../core/supabase-admin.ts";
import {
  applyNikLogin,
  deactivateAccountOfEmployee,
  getAccountSummaries,
  getEmployeeAccountStates,
  listManagerEmployeeIds,
} from "../iam/index.ts";
import { notify } from "../notification/index.ts";
import { getMasterLookup } from "../organization/index.ts";
import * as policy from "./employee.policy.ts";
import * as employeeRepo from "./employee.repository.ts";
import * as repo from "./onboarding.repository.ts";
import type { OnboardingContext } from "./onboarding.service.ts";
import * as wizardRepo from "./onboarding-wizard.repository.ts";
import { describeOnboarding, snapshotOf } from "./onboarding-wizard.service.ts";

// D-045 c / D-047 (design §8): review isian onboarding oleh SA, atau HR_ADMIN ber-grant
// `employee.onboarding.review` di PT calon. Reviewer tidak mengedit isian calon — kecuali PTKP & data kerja.

export interface ReviewDeps {
  authAdmin: AuthAdmin;
  storage?: StorageAdmin | undefined;
  /** D-048: domain alamat login NIK (kosong = login NIK nonaktif di lingkungan ini). */
  loginEmailDomain?: string | undefined;
}

type Row = wizardRepo.SelfRow;
type ReviewMode = "candidate" | "completion";

function auditBase(ctx: OnboardingContext, employeeId: string) {
  return {
    actorAccountId: ctx.actor.accountId,
    requestId: ctx.requestId ?? null,
    ip: ctx.ip ?? null,
    entityType: "employee.employee",
    entityId: employeeId,
  };
}

/** Calon (belum APPROVED) atau karyawan existing yang diminta melengkapi data. */
function reviewModeOf(row: Row): ReviewMode | null {
  if (row.onboardingStatus !== "APPROVED") return "candidate";
  return row.completionRequired ? "completion" : null;
}

/** Menunggu keputusan: calon berstatus Menunggu review, atau kiriman karyawan existing. */
function awaitingDecision(row: Row, mode: ReviewMode | null) {
  if (mode === "candidate") return row.onboardingStatus === "SUBMITTED";
  return mode === "completion" && row.completionSubmittedAt !== null;
}

async function loadForReview(ctx: OnboardingContext, employeeId: string) {
  const row = await wizardRepo.loadSelf(employeeId);
  const mode = row ? reviewModeOf(row) : null;
  // Di luar cakupan / bukan objek onboarding → 404 (tidak membocorkan keberadaan, D-040).
  if (!row || !mode || !policy.canReviewOnboarding(ctx.actor, row.companyId)) {
    throw new NotFoundError("Data onboarding tidak ditemukan.");
  }
  // Tidak boleh me-review data miliknya sendiri (PLAN §4.5.1).
  if (ctx.actor.employeeId === row.id) throw new ForbiddenError();
  return { row, mode };
}

// ── Detail review ──────────────────────────────────────────────────────────────────────────────

export async function getReview(ctx: OnboardingContext, employeeId: string, deps: ReviewDeps) {
  const { row, mode } = await loadForReview(ctx, employeeId);
  const [view, reviewers] = await Promise.all([
    describeOnboarding(row, deps.storage ?? UNCONFIGURED_STORAGE, null),
    getAccountSummaries([...new Set(row.onboardingReviews.map((r) => r.reviewerAccountId))]),
  ]);
  // Membuka halaman review = akses data sensitif (design §8, PLAN §4.2) → audit tanpa nilai.
  await writeAudit({ ...auditBase(ctx, row.id), action: "employee.onboarding.review.read" });
  return {
    ...view,
    // Tampilan wizard untuk pemilik; untuk reviewer selalu baca saja.
    editable: false,
    reviewMode: mode,
    employeeNumber: row.employeeNumber,
    personalEmail: row.personalEmail,
    work: {
      companyId: row.companyId,
      employmentStatusId: row.employmentStatusId,
      positionId: row.positionId,
      workLocationId: row.workLocationId,
      gradeId: row.gradeId,
      managerId: row.managerId,
      joinDate: row.joinDate.toISOString().slice(0, 10),
    },
    ptkpStatus: row.personal?.ptkpStatus ?? null,
    canDecide: awaitingDecision(row, mode),
    reviews: row.onboardingReviews.map((r) => ({
      id: r.id,
      decision: r.decision,
      completion: r.completion,
      sectionNotes: (r.sectionNotes ?? null) as Partial<Record<ReviewSection, string>> | null,
      reason: r.reason,
      decidedAt: r.decidedAt.toISOString(),
      reviewerEmail: reviewers.get(r.reviewerAccountId)?.email ?? null,
    })),
  };
}
export type OnboardingReviewDto = Awaited<ReturnType<typeof getReview>>;

// ── Keputusan ──────────────────────────────────────────────────────────────────────────────────

type WorkCorrection = NonNullable<
  Extract<OnboardingDecisionBody, { decision: "APPROVED" }>["work"]
>;

/** Koreksi data kerja wajib merujuk master data aktif; atasan = karyawan aktif ber-akun Manager/SA. */
async function assertWorkRefs(work: WorkCorrection, row: Row) {
  const lookup = await getMasterLookup();
  const live = <T extends { deleted: boolean }>(map: Map<string, T>, id?: string | null) =>
    !id || (map.has(id) && !map.get(id)?.deleted);
  const issues: { path: string; message: string }[] = [];
  if (!live(lookup.statuses, work.employmentStatusId))
    issues.push({ path: "work.employmentStatusId", message: "Status kepegawaian tidak valid." });
  if (!live(lookup.positions, work.positionId))
    issues.push({ path: "work.positionId", message: "Jabatan tidak valid." });
  if (!live(lookup.locations, work.workLocationId))
    issues.push({ path: "work.workLocationId", message: "Lokasi kerja tidak valid." });
  if (!live(lookup.grades, work.gradeId))
    issues.push({ path: "work.gradeId", message: "Grade tidak valid." });
  if (work.managerId) {
    const [managers, [manager]] = await Promise.all([
      listManagerEmployeeIds(),
      employeeRepo.findManyByIds([work.managerId]),
    ]);
    const valid =
      manager?.isActive &&
      manager.onboardingStatus === "APPROVED" &&
      manager.id !== row.id &&
      managers.includes(manager.id);
    if (!valid)
      issues.push({
        path: "work.managerId",
        message: "Atasan harus karyawan aktif ber-akun Manager.",
      });
  }
  if (issues.length > 0) throw new BusinessRuleError("Data kerja tidak valid.", issues);
}

const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export async function decide(
  ctx: OnboardingContext,
  employeeId: string,
  body: unknown,
  deps: ReviewDeps,
  now = new Date(),
) {
  const parsed = onboardingDecisionSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        code: issue.code,
        message: issue.message,
      })),
    );
  }
  const input = parsed.data;
  const { row, mode } = await loadForReview(ctx, employeeId);
  if (!awaitingDecision(row, mode)) {
    throw new BusinessRuleError("Data belum dikirim untuk direview atau sudah diputuskan.");
  }
  const completion = mode === "completion";
  if (input.decision === "CANCELLED" && completion) {
    throw new BusinessRuleError(
      "Karyawan terdaftar tidak bisa dibatalkan dari sini; gunakan Nonaktifkan karyawan.",
    );
  }
  if (input.decision === "APPROVED") {
    const missing = onboardingCompleteness(snapshotOf(row));
    if (missing.length > 0) throw new BusinessRuleError("Data belum lengkap.", missing);
    if (input.work && completion) {
      throw new BusinessRuleError(
        "Data kerja karyawan terdaftar diubah lewat menu Karyawan (tercatat di riwayat).",
      );
    }
    if (input.work) await assertWorkRefs(input.work, row);
  }

  let nikLogin = false;
  await employeeRepo.withTransaction(async (tx) => {
    let toStatus = row.onboardingStatus;
    if (input.decision === "APPROVED") {
      await repo.setPtkpStatus(tx, row.id, input.ptkpStatus);
      if (completion) {
        await employeeRepo.updateEmployee(tx, row.id, { completionRequired: false });
      } else {
        const work = input.work ?? {};
        const joinDate = work.joinDate ? toDate(work.joinDate) : row.joinDate;
        const employmentStatusId = work.employmentStatusId ?? row.employmentStatusId;
        const positionId = work.positionId ?? row.positionId;
        toStatus = "APPROVED";
        await employeeRepo.updateEmployee(tx, row.id, {
          onboardingStatus: "APPROVED",
          joinDate,
          employmentStatusId,
          positionId,
          ...(work.workLocationId !== undefined ? { workLocationId: work.workLocationId } : {}),
          ...(work.gradeId !== undefined ? { gradeId: work.gradeId } : {}),
          ...(work.managerId !== undefined ? { managerId: work.managerId } : {}),
        });
        await employeeRepo.createHistory(tx, {
          employeeId: row.id,
          changeType: "HIRED",
          effectiveDate: joinDate,
          toStatusId: employmentStatusId,
          toPositionId: positionId,
          toCompanyId: row.companyId,
          changedBy: ctx.actor.accountId,
        });
      }
      // D-048: sejak disetujui akun login dengan NIK (email Auth → alamat turunan). Gagal → batal semua.
      const outcome = await applyNikLogin(
        row.id,
        row.employeeNumber,
        { authAdmin: deps.authAdmin, domain: deps.loginEmailDomain },
        tx,
      );
      nikLogin = outcome === "switched" || outcome === "unchanged";
    } else if (input.decision === "REVISION_REQUESTED") {
      if (completion) {
        await employeeRepo.updateEmployee(tx, row.id, { completionSubmittedAt: null });
      } else {
        toStatus = "REVISION_REQUESTED";
        await repo.setStatus(tx, row.id, toStatus);
      }
    } else {
      toStatus = "CANCELLED";
      await repo.setStatus(tx, row.id, toStatus);
      // D-034: akun calon dinonaktifkan (+ ban Supabase) di transaksi yang sama.
      await deactivateAccountOfEmployee(ctx, row.id, { authAdmin: deps.authAdmin }, tx);
    }
    if (toStatus !== row.onboardingStatus) {
      await repo.addEvent(tx, {
        employeeId: row.id,
        fromStatus: row.onboardingStatus,
        toStatus,
        actorAccountId: ctx.actor.accountId,
      });
    }
    await repo.createReview(tx, {
      employeeId: row.id,
      decision: input.decision,
      reviewerAccountId: ctx.actor.accountId,
      sectionNotes: input.decision === "REVISION_REQUESTED" ? input.sectionNotes : null,
      reason: input.decision === "CANCELLED" ? input.reason : null,
      completion,
      decidedAt: now,
    });
    await writeAudit(
      {
        ...auditBase(ctx, row.id),
        action: "employee.onboarding.decide",
        before: { status: row.onboardingStatus },
        after: {
          decision: input.decision,
          status: toStatus,
          completion,
          ...(input.decision === "REVISION_REQUESTED"
            ? { sections: Object.keys(input.sectionNotes) }
            : {}),
          ...(input.decision === "APPROVED"
            ? { workCorrected: Boolean(input.work), loginByEmployeeNumber: nikLogin }
            : {}),
        },
        reason: input.decision === "CANCELLED" ? input.reason : null,
      },
      tx,
    );
  });

  await notifyOwner(row, input, nikLogin);
  return { employeeId: row.id, decision: input.decision };
}

/** Email + notifikasi ke pemilik data (setelah commit). Tanpa nilai data — hanya nama bagian. */
async function notifyOwner(row: Row, input: OnboardingDecisionBody, nikLogin: boolean) {
  const [account] = await getEmployeeAccountStates([row.id]);
  if (!account) return;
  // Tujuan email: email pribadi (setelah login NIK, email akun bukan alamat nyata — D-048).
  const recipient = { accountId: account.accountId, email: row.personalEmail ?? account.email };
  const message =
    input.decision === "APPROVED"
      ? {
          title: "Data Anda diterima",
          body: nikLogin
            ? `HR telah menyetujui data Anda. Mulai sekarang masuk ke Akselerasi Arthasia dengan NIK ${row.employeeNumber} dan password Anda (email tidak lagi dipakai untuk masuk).`
            : "HR telah menyetujui data Anda. Silakan masuk ke aplikasi Akselerasi Arthasia.",
          link: "/ess",
        }
      : input.decision === "REVISION_REQUESTED"
        ? {
            title: "Data Anda perlu diperbaiki",
            body: `Bagian yang perlu diperbaiki: ${Object.keys(input.sectionNotes)
              .map((s) => REVIEW_SECTION_LABELS[s as ReviewSection])
              .join(", ")}. Lihat catatan HR di halaman isi data.`,
            link: "/onboarding",
          }
        : {
            title: "Penerimaan Anda dibatalkan",
            body: "Proses penerimaan Anda dibatalkan oleh HR. Hubungi HR untuk informasi lebih lanjut.",
          };
  await notify({
    recipients: [recipient],
    type: `employee.onboarding_${input.decision.toLowerCase()}`,
    ...message,
    email: true,
  });
}
