import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { archiveKeys } from "@/features/archive/api";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { documentTypeSchema, employeeDocumentsSchema } from "./schemas";

// D-055 (Arsip 1b): jenis dokumen (master data) & dokumen per karyawan.
// Unggah: minta URL (API) → unggah langsung ke Supabase Storage (token sekali pakai) → simpan
// metadata (API memeriksa ulang format & ukuran, menentukan versi).

export const documentKeys = {
  types: (archived: boolean) => ["document-types", archived] as const,
  employee: (employeeId: string) => ["employee-documents", employeeId] as const,
};

export function useDocumentTypes(archived = false) {
  return useQuery({
    queryKey: documentKeys.types(archived),
    queryFn: ({ signal }) =>
      api(`/document-types${archived ? "?archived=include" : ""}`, {
        schema: z.object({ data: z.array(documentTypeSchema) }),
        signal,
      }).then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

const one = z.object({ data: z.object({ id: z.string() }) });

export function useDocumentTypeMutations() {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: ["document-types"] });
  return {
    save: useMutation({
      mutationFn: ({ id, body }: { id?: string; body: Record<string, unknown> }) =>
        id
          ? api(`/document-types/${id}`, { method: "PATCH", body, schema: one })
          : api("/document-types", { method: "POST", body, schema: one }),
      onSuccess,
    }),
    setArchived: useMutation({
      mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
        api(`/document-types/${id}/${archived ? "archive" : "restore"}`, {
          method: "POST",
          schema: one,
        }),
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api(`/document-types/${id}`, { method: "DELETE", schema: one }),
      onSuccess,
    }),
  };
}

export function useEmployeeDocuments(employeeId: string, enabled = true) {
  return useQuery({
    queryKey: documentKeys.employee(employeeId),
    queryFn: ({ signal }) =>
      api(`/employees/${employeeId}/documents`, { schema: employeeDocumentsSchema, signal }).then(
        (r) => r.data,
      ),
    enabled,
  });
}

/** Daftar dokumen satu karyawan di luar React Query (mis. sheet Dokumen pada Print data, D-058). */
export const fetchEmployeeDocuments = (employeeId: string) =>
  api(`/employees/${employeeId}/documents`, { schema: employeeDocumentsSchema }).then(
    (r) => r.data,
  );

export class DocumentFileError extends Error {}

const uploadUrlSchema = z.object({
  data: z.object({
    bucket: z.string(),
    path: z.string(),
    token: z.string(),
    signedUrl: z.string(),
    maxBytes: z.number(),
  }),
});

export interface DocumentMeta {
  documentTypeId: string;
  documentNumber: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  note: string | null;
}

function useInvalidateDocuments(employeeId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: documentKeys.employee(employeeId) });
    void queryClient.invalidateQueries({ queryKey: archiveKeys.all });
    void queryClient.invalidateQueries({ queryKey: ["document-types"] });
  };
}

export function useEmployeeDocumentMutations(employeeId: string) {
  const invalidate = useInvalidateDocuments(employeeId);
  const base = `/employees/${employeeId}/documents`;
  return {
    upload: useMutation({
      mutationFn: async ({
        file,
        meta,
        link,
      }: {
        file: File;
        meta: DocumentMeta;
        link?: { replacesId?: string; trainingId?: string; historyId?: string };
      }) => {
        const { data: upload } = await api(`${base}/upload-url`, {
          method: "POST",
          body: { documentTypeId: meta.documentTypeId, contentType: file.type },
          schema: uploadUrlSchema,
        });
        if (file.size > upload.maxBytes) {
          throw new DocumentFileError(
            `Ukuran maksimal ${Math.round(upload.maxBytes / 1024 / 1024)} MB.`,
          );
        }
        const { error } = await supabase.storage
          .from(upload.bucket)
          .uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
        if (error) {
          throw new DocumentFileError("File gagal diunggah. Periksa koneksi lalu coba lagi.");
        }
        return api(base, {
          method: "POST",
          body: { ...meta, ...link, path: upload.path },
          schema: one,
        });
      },
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, meta }: { id: string; meta: DocumentMeta }) =>
        api(`${base}/${id}`, { method: "PATCH", body: meta, schema: one }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api(`${base}/${id}`, { method: "DELETE", schema: one }),
      onSuccess: invalidate,
    }),
  };
}

/** Tautan baca 5 menit; dibuka di tab baru (jenis sensitif tercatat di audit log). */
export async function openEmployeeDocument(employeeId: string, documentId: string) {
  // Buka tab dulu (sinkron dengan klik) supaya tidak diblokir popup blocker.
  const tab = window.open("", "_blank");
  try {
    const { data } = await api(`/employees/${employeeId}/documents/${documentId}/url`, {
      schema: z.object({ data: z.object({ url: z.string() }) }),
    });
    if (tab) tab.location.href = data.url;
    else window.open(data.url, "_blank", "noopener");
  } catch (error) {
    tab?.close();
    throw error;
  }
}
