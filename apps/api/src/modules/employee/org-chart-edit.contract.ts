import { z } from "@hono/zod-openapi";
import {
  orgChartChangeBatchSchema,
  orgChartChangePreviewSchema,
  orgChartChangeResultSchema,
} from "@hris/shared";
import { assertExact } from "../../core/contract.ts";
import type * as service from "./org-chart-edit.service.ts";

export const orgChartChangesBodySchema = z
  .object(orgChartChangeBatchSchema.shape)
  .openapi("OrgChartChangeBatch");
export const orgChartChangesResultSchema = z
  .object(orgChartChangeResultSchema.shape)
  .openapi("OrgChartChangeResult");
export const orgChartChangesPreviewSchema = z
  .object(orgChartChangePreviewSchema.shape)
  .openapi("OrgChartChangePreview");

assertExact<
  z.infer<typeof orgChartChangesResultSchema>,
  Awaited<ReturnType<typeof service.applyOrgChartChanges>>
>(true);
assertExact<
  z.infer<typeof orgChartChangesPreviewSchema>,
  Awaited<ReturnType<typeof service.previewOrgChartChanges>>
>(true);
