import type { DataChangeSection, DataChangeStatus } from "@hris/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  dataChangeDetailSchema,
  dataChangeQueueRowSchema,
  dataChangeSummarySchema,
  myDataSchema,
} from "./schemas";

// D-054 / OD-6 (Arsip 1c): data diri & pengajuan (ESS) + antrean pemeriksa (SA / HR ber-grant).

export const dataChangeKeys = {
  mine: ["self", "employee-data"] as const,
  myRequests: ["self", "data-changes"] as const,
  queue: (params: object) => ["data-changes", params] as const,
  detail: (id: string) => ["data-change", id] as const,
};

export function useMyData() {
  return useQuery({
    queryKey: dataChangeKeys.mine,
    queryFn: ({ signal }) =>
      api("/self/employee-data", { schema: z.object({ data: myDataSchema }), signal }).then(
        (r) => r.data,
      ),
    retry: false,
  });
}

export function useMyDataChanges() {
  return useQuery({
    queryKey: dataChangeKeys.myRequests,
    queryFn: ({ signal }) =>
      api("/self/data-changes", {
        schema: z.object({ data: z.array(dataChangeSummarySchema) }),
        signal,
      }).then((r) => r.data),
    retry: false,
  });
}

export class AttachmentError extends Error {}

const uploadUrlSchema = z.object({
  data: z.object({
    bucket: z.string(),
    path: z.string(),
    token: z.string(),
    signedUrl: z.string(),
    maxBytes: z.number(),
  }),
});
const resultSchema = z.object({ data: z.object({ id: z.string() }) });

/** Unggah lampiran (buku tabungan / dokumen) ke URL bertanda tangan; kembalikan path untuk pengajuan. */
async function uploadAttachment(
  purpose: "BANK" | "DOCUMENT",
  file: File,
  documentTypeId?: string,
): Promise<string> {
  const { data: upload } = await api("/self/documents/upload-url", {
    method: "POST",
    body: { purpose, documentTypeId, contentType: file.type },
    schema: uploadUrlSchema,
  });
  if (file.size > upload.maxBytes) {
    throw new AttachmentError(`Ukuran maksimal ${Math.round(upload.maxBytes / 1024 / 1024)} MB.`);
  }
  const { error } = await supabase.storage
    .from(upload.bucket)
    .uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
  if (error) throw new AttachmentError("File gagal diunggah. Periksa koneksi lalu coba lagi.");
  return upload.path;
}

function useRefreshMine() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["self"] });
    void queryClient.invalidateQueries({ queryKey: ["data-changes"] });
  };
}

export function useSubmitDataChange() {
  const refresh = useRefreshMine();
  return useMutation({
    mutationFn: async ({
      section,
      data,
      file,
    }: {
      section: DataChangeSection;
      data: Record<string, unknown>;
      file?: File;
    }) => {
      let payload = data;
      if (section === "BANK" && file) {
        payload = { ...data, bankBookPath: await uploadAttachment("BANK", file) };
      }
      if (section === "DOCUMENT" && file) {
        payload = {
          ...data,
          path: await uploadAttachment("DOCUMENT", file, data.documentTypeId as string),
        };
      }
      return api("/data-changes", {
        method: "POST",
        body: { section, data: payload },
        schema: resultSchema,
      });
    },
    onSuccess: refresh,
  });
}

export function useCancelDataChange() {
  const refresh = useRefreshMine();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/data-changes/${id}/cancel`, { method: "POST", schema: resultSchema }),
    onSuccess: refresh,
  });
}

export interface QueueParams {
  page: number;
  pageSize: number;
  q?: string | undefined;
  status?: DataChangeStatus | undefined;
  section?: DataChangeSection | undefined;
  companyId?: string | undefined;
}

export function useDataChangeQueue(params: QueueParams) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return useQuery({
    queryKey: dataChangeKeys.queue(params),
    queryFn: ({ signal }) =>
      api(`/data-changes?${search}`, {
        schema: z.object({
          data: z.array(dataChangeQueueRowSchema),
          meta: z.object({ page: z.number(), pageSize: z.number(), total: z.number() }),
        }),
        signal,
      }),
    placeholderData: (previous) => previous,
  });
}

export function useDataChange(id: string | null) {
  return useQuery({
    queryKey: dataChangeKeys.detail(id ?? ""),
    queryFn: ({ signal }) =>
      api(`/data-changes/${id}`, {
        schema: z.object({ data: dataChangeDetailSchema }),
        signal,
      }).then((r) => r.data),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useDecideDataChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      decision,
      note,
    }: {
      id: string;
      decision: "APPROVE" | "REJECT";
      note: string | null;
    }) =>
      api(`/data-changes/${id}/decision`, {
        method: "POST",
        body: { decision, note },
        schema: resultSchema,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["data-changes"] });
      void queryClient.invalidateQueries({ queryKey: ["data-change"] });
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
      void queryClient.invalidateQueries({ queryKey: ["employee-documents"] });
      void queryClient.invalidateQueries({ queryKey: ["archive"] });
    },
  });
}
