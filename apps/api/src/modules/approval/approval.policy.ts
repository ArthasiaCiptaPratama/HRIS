import { ROLE } from "@hris/shared";
import { type Actor, isInCompanyScope } from "../../core/access/index.ts";

// PLAN §5.2 (D-010, D-068, D-069): siapa boleh memutuskan langkah approval. Keputusan murni; data dari pemanggil.

export interface ApprovalTarget {
  requesterEmployeeId: string;
  companyId: string;
  /** Snapshot atasan saat pengajuan; null = tanpa atasan → langkah atasan diambil SUPER_ADMIN. */
  managerEmployeeId: string | null;
}

export type StepKind = "MANAGER" | "HR";
/** regular = pemutus langkah itu; override = mengambil alih (alasan wajib, diaudit); null = tidak berhak. */
export type StepRight = "regular" | "override" | null;

const isSelfRequest = (actor: Actor, target: ApprovalTarget) =>
  actor.employeeId !== null && actor.employeeId === target.requesterEmployeeId;
const isHrInScope = (actor: Actor, target: ApprovalTarget) =>
  actor.role === ROLE.HR_ADMIN && isInCompanyScope(actor, target);

export function stepRight(actor: Actor, target: ApprovalTarget, kind: StepKind): StepRight {
  // Tidak pernah memutuskan pengajuan sendiri (termasuk SA/HR yang mengajukan).
  if (isSelfRequest(actor, target)) return null;
  const isSa = actor.role === ROLE.SUPER_ADMIN;
  if (kind === "MANAGER") {
    if (target.managerEmployeeId !== null && actor.employeeId === target.managerEmployeeId) {
      return "regular";
    }
    // Pengaju tanpa atasan → SA memutuskan langkah atasan (bukan override).
    if (target.managerEmployeeId === null && isSa) return "regular";
    // Atasan berhalangan → HR (PT-nya) atau SA mengambil alih dengan alasan.
    if (isSa || isHrInScope(actor, target)) return "override";
    return null;
  }
  // Langkah HR: HR_ADMIN PT pengaju (pengaju HR → HR lain, karena pengajuan sendiri ditolak di atas).
  if (isHrInScope(actor, target)) return "regular";
  // SA mengambil alih langkah HR (mis. tidak ada HR lain di PT itu).
  if (isSa) return "override";
  return null;
}

/** Melihat permintaan: pengaju, atasan snapshot, HR PT-nya, SA. */
export function canViewApproval(actor: Actor, target: ApprovalTarget): boolean {
  if (isSelfRequest(actor, target)) return true;
  if (actor.role === ROLE.SUPER_ADMIN) return true;
  if (target.managerEmployeeId !== null && actor.employeeId === target.managerEmployeeId)
    return true;
  return isHrInScope(actor, target);
}
