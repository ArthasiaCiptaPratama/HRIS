import { getPrisma } from "../../core/db.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

// Satu-satunya tempat query Prisma ke skema approval (PROMPT §4).
export type ApprovalTx = Prisma.TransactionClient;
export type ApprovalSubjectType = Prisma.ApprovalRequestCreateInput["subjectType"];

const withSteps = { steps: { orderBy: { kind: "asc" } } } satisfies Prisma.ApprovalRequestInclude;
export type ApprovalRow = Prisma.ApprovalRequestGetPayload<{ include: typeof withSteps }>;

export async function withTransaction<T>(run: (tx: ApprovalTx) => Promise<T>): Promise<T> {
  return getPrisma().$transaction(run);
}

export async function createRequest(
  tx: ApprovalTx,
  data: Omit<Prisma.ApprovalRequestUncheckedCreateInput, "steps">,
  stepKinds: ("MANAGER" | "HR")[],
) {
  return tx.approvalRequest.create({
    data: { ...data, steps: { create: stepKinds.map((kind) => ({ kind })) } },
    include: withSteps,
  });
}

export async function findRequest(tx: ApprovalTx | undefined, id: string) {
  return (tx ?? getPrisma()).approvalRequest.findUnique({ where: { id }, include: withSteps });
}

export async function findBySubject(
  tx: ApprovalTx | undefined,
  subjectType: ApprovalSubjectType,
  subjectId: string,
) {
  return (tx ?? getPrisma()).approvalRequest.findUnique({
    where: { subjectType_subjectId: { subjectType, subjectId } },
    include: withSteps,
  });
}

export async function findBySubjects(subjectType: ApprovalSubjectType, subjectIds: string[]) {
  if (subjectIds.length === 0) return [];
  return getPrisma().approvalRequest.findMany({
    where: { subjectType, subjectId: { in: subjectIds } },
    include: withSteps,
  });
}

export async function listRequests(where: Prisma.ApprovalRequestWhereInput, take: number) {
  return getPrisma().approvalRequest.findMany({
    where,
    include: withSteps,
    orderBy: { createdAt: "asc" },
    take,
  });
}

export async function decideStep(
  tx: ApprovalTx,
  stepId: string,
  data: {
    decision: "APPROVED" | "REJECTED";
    decidedByAccountId: string;
    decidedAt: Date;
    note: string | null;
    isOverride: boolean;
  },
) {
  // Kondisi decision=PENDING mencegah dua keputusan bersamaan menimpa satu sama lain.
  return tx.approvalStep.updateMany({ where: { id: stepId, decision: "PENDING" }, data });
}

export async function setStatus(
  tx: ApprovalTx,
  id: string,
  status: "APPROVED" | "REJECTED" | "CANCELLED",
  decidedAt: Date,
) {
  return tx.approvalRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status, decidedAt },
  });
}
