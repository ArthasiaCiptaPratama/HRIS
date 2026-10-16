import type { ReportKind } from "@hris/shared";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import { downloadBytes } from "@/lib/xlsx-write";
import {
  completenessSchema,
  documentExpirySchema,
  headcountSchema,
  warningLettersSchema,
} from "./schemas";

// ARS-D16/D17: hook laporan batch 1 (data dihitung server; cakupan PT dicek API).

export interface ReportParams {
  companyId?: string | undefined;
  unitId?: string | undefined;
  year?: number | undefined;
}

const toSearch = (params: ReportParams) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return search.toString();
};
const one = <T extends z.ZodType>(schema: T) => z.object({ data: schema });
const SCHEMAS = {
  headcount: headcountSchema,
  "document-expiry": documentExpirySchema,
  completeness: completenessSchema,
  "warning-letters": warningLettersSchema,
} as const;

export function useReport<K extends ReportKind>(kind: K, params: ReportParams, enabled = true) {
  return useQuery({
    queryKey: ["reports", kind, params],
    queryFn: ({ signal }) =>
      api(`/reports/${kind}?${toSearch(params)}`, { schema: one(SCHEMAS[kind]), signal }).then(
        (r) => r.data as z.infer<(typeof SCHEMAS)[K]>,
      ),
    enabled,
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });
}

const fileSchema = one(
  z.object({ fileName: z.string(), rows: z.number(), contentBase64: z.string() }),
);

/** Ekspor Excel (dibuat server, diaudit, maks 10.000 baris — aturan D-058). */
export async function exportReport(kind: ReportKind, params: ReportParams) {
  const { data } = await api(`/reports/${kind}/export?${toSearch(params)}`, { schema: fileSchema });
  const bytes = Uint8Array.from(atob(data.contentBase64), (c) => c.charCodeAt(0));
  downloadBytes(
    bytes,
    data.fileName,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  return data;
}
