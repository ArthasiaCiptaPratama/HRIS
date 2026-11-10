import type { OrgChartChangeBatch, OrgChartChangeResult } from "@hris/shared";
import { writeAudit } from "../../core/audit.ts";
import { ConflictError, ForbiddenError } from "../../core/errors.ts";
import { canManageOrgPost, canManageOrgStructure } from "./organization.policy.ts";
import * as repository from "./organization.repository.ts";
import { createPositionInTransaction } from "./organization-admin.service.ts";
import type { RequestContext } from "./organization-support.ts";

export type OrgChartEditTx = repository.OrganizationTx;
export const getOrgChartRevision = () => repository.getOrgChartRevision();

/** The callback owns employee operations; organization never reads employee tables. */
export async function withOrgChartEdit<T>(
  ctx: RequestContext,
  input: OrgChartChangeBatch,
  preview: boolean,
  run: (tx: OrgChartEditTx, revision: number) => Promise<T>,
): Promise<T> {
  if (!canManageOrgStructure(ctx.actor, input.companyId)) throw new ForbiddenError();
  return repository.withTransaction(async (tx) => {
    const revision = await repository.lockOrgChartRevision(tx, input.baseRevision, preview);
    if (revision === null) {
      throw new ConflictError("Bagan sudah diubah pengguna lain. Muat ulang bagan.");
    }
    return run(tx, revision);
  });
}

export async function createChartPosition(
  ctx: RequestContext,
  tx: OrgChartEditTx,
  input: Extract<OrgChartChangeBatch["changes"][number], { op: "createPosition" }>,
): Promise<{ id: string; unitName: string }> {
  const rows = await repository.listAdminRows(tx);
  const unit = rows.departments.find((d) => d.id === input.departmentId);
  if (
    !unit?.companyId ||
    !canManageOrgPost(ctx.actor, { companyId: unit.companyId, level: input.level })
  ) {
    throw new ForbiddenError();
  }
  const created = await createPositionInTransaction(tx, input);
  return { ...created, unitName: unit.name };
}

export async function auditOrgChartBatch(
  ctx: RequestContext,
  tx: OrgChartEditTx,
  input: OrgChartChangeBatch,
  result: OrgChartChangeResult,
): Promise<void> {
  await writeAudit(
    {
      actorAccountId: ctx.actor.accountId,
      requestId: ctx.requestId ?? null,
      ip: ctx.ip ?? null,
      action: "organization.org_chart.batch_apply",
      entityType: "organization.org_chart",
      entityId: input.companyId,
      before: { revision: input.baseRevision },
      // Operation kinds and structural ids only; no names or employee personal data.
      after: { operations: input.changes.map((change) => change.op), ...result },
    },
    tx,
  );
}
