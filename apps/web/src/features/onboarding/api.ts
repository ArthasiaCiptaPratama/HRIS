import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIME_TYPES,
  type DocumentType,
  type OnboardingBatchInput,
  type OnboardingCandidateInput,
  type OnboardingDecisionInput,
  type OnboardingSection,
  type OnboardingStatus,
} from "@hris/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { authKeys } from "@/features/auth/api";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  batchSchema,
  candidatePageSchema,
  documentUploadUrlSchema,
  inviteExistingResultSchema,
  type MyOnboarding,
  myOnboardingSchema,
  onboardingReviewSchema,
  one,
  previewSchema,
  processResultSchema,
} from "./schemas";

// D-045 bagian a: hook Penerimaan Karyawan Baru.

export const onboardingKeys = {
  all: ["onboarding"] as const,
  list: (params: Record<string, unknown>) => ["onboarding", "list", params] as const,
  batch: (id: string) => ["onboarding", "batch", id] as const,
  review: (employeeId: string) => ["onboarding", "review", employeeId] as const,
};

export interface CandidateListParams {
  status?: OnboardingStatus | undefined;
  batchId?: string | undefined;
  q?: string | undefined;
  page: number;
  pageSize: number;
}

export function useOnboardingCandidates(params: CandidateListParams) {
  const search = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.status) search.set("status", params.status);
  if (params.batchId) search.set("batchId", params.batchId);
  if (params.q?.trim()) search.set("q", params.q.trim());
  return useQuery({
    queryKey: onboardingKeys.list({ ...params }),
    queryFn: ({ signal }) => api(`/onboarding?${search}`, { schema: candidatePageSchema, signal }),
    placeholderData: (previous) => previous,
  });
}

export function useOnboardingBatch(id: string | null) {
  return useQuery({
    queryKey: onboardingKeys.batch(id ?? "-"),
    queryFn: ({ signal }) =>
      api(`/onboarding-batches/${id}`, { schema: one(batchSchema), signal }).then((r) => r.data),
    enabled: Boolean(id),
  });
}

export function usePreviewOnboarding() {
  return useMutation({
    mutationFn: (candidates: OnboardingCandidateInput[]) =>
      api("/onboarding-batches/preview", {
        method: "POST",
        body: { candidates },
        schema: one(previewSchema),
      }).then((r) => r.data),
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: onboardingKeys.all });
  };
}

export function useCreateOnboardingBatch() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: OnboardingBatchInput) =>
      api("/onboarding-batches", { method: "POST", body, schema: one(batchSchema) }).then(
        (r) => r.data,
      ),
    onSuccess: invalidate,
  });
}

export function useProcessInvitations() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () =>
      api("/onboarding-invitations/process", {
        method: "POST",
        schema: one(processResultSchema),
      }).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useResendInvitation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (employeeId: string) =>
      api(`/onboarding/${employeeId}/resend-invitation`, {
        method: "POST",
        schema: one(z.object({ employeeId: z.string(), queued: z.boolean() })),
      }),
    onSuccess: invalidate,
  });
}

export function useInviteExisting() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (employees: { employeeId: string; email: string }[]) =>
      api("/onboarding/invite-existing", {
        method: "POST",
        body: { employees },
        schema: one(inviteExistingResultSchema),
      }).then((r) => r.data),
    onSuccess: invalidate,
  });
}

// ── D-045 c: review ─────────────────────────────────────────────────────────────────────────────

export function useOnboardingReview(employeeId: string) {
  return useQuery({
    queryKey: onboardingKeys.review(employeeId),
    queryFn: ({ signal }) =>
      api(`/onboarding/${employeeId}`, { schema: one(onboardingReviewSchema), signal }).then(
        (r) => r.data,
      ),
    // Data sensitif: jangan disimpan lama di cache.
    gcTime: 0,
  });
}

export function useDecideOnboarding(employeeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: OnboardingDecisionInput) =>
      api(`/onboarding/${employeeId}/decision`, {
        method: "POST",
        body,
        schema: one(z.object({ employeeId: z.string(), decision: z.string() })),
      }).then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: onboardingKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

// ── D-045 b: wizard milik sendiri ───────────────────────────────────────────────────────────────
// Kunci di bawah "employees" supaya unggah/hapus foto profil (useUploadPhoto) ikut menyegarkannya.
export const myOnboardingKey = ["employees", "onboarding-me"] as const;

export function useMyOnboarding() {
  return useQuery({
    queryKey: myOnboardingKey,
    queryFn: ({ signal }) =>
      api("/onboarding/me", { schema: one(myOnboardingSchema), signal }).then((r) => r.data),
  });
}

function useRefreshMine() {
  const queryClient = useQueryClient();
  return (data?: MyOnboarding) => {
    if (data) queryClient.setQueryData(myOnboardingKey, data);
    else void queryClient.invalidateQueries({ queryKey: myOnboardingKey });
    void queryClient.invalidateQueries({ queryKey: authKeys.me });
  };
}

export function useSaveOnboardingSection() {
  const refresh = useRefreshMine();
  return useMutation({
    mutationFn: ({ section, body }: { section: OnboardingSection; body: unknown }) =>
      api(`/onboarding/me/${section}`, {
        method: "PUT",
        body,
        schema: one(myOnboardingSchema),
      }).then((r) => r.data),
    onSuccess: (data) => refresh(data),
  });
}

export class DocumentUploadError extends Error {}

export function useUploadDocument() {
  const refresh = useRefreshMine();
  return useMutation({
    mutationFn: async ({ type, file }: { type: DocumentType; file: File }) => {
      if (!(DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
        throw new DocumentUploadError("Format harus PDF, JPG, atau PNG.");
      }
      if (file.size > DOCUMENT_MAX_BYTES) {
        throw new DocumentUploadError("Ukuran maksimal 5 MB.");
      }
      const { data: upload } = await api("/onboarding/me/documents/upload-url", {
        method: "POST",
        body: { type, contentType: file.type },
        schema: one(documentUploadUrlSchema),
      });
      const { error } = await supabase.storage
        .from(upload.bucket)
        .uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
      if (error)
        throw new DocumentUploadError("Dokumen gagal diunggah. Periksa koneksi lalu coba lagi.");
      return api("/onboarding/me/documents", {
        method: "POST",
        body: { type, path: upload.path },
        schema: one(z.object({ id: z.string() })),
      });
    },
    onSuccess: () => refresh(),
  });
}

export function useDeleteDocument() {
  const refresh = useRefreshMine();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/onboarding/me/documents/${id}`, {
        method: "DELETE",
        schema: one(z.object({ id: z.string() })),
      }),
    onSuccess: () => refresh(),
  });
}

export function useSubmitOnboarding() {
  const refresh = useRefreshMine();
  return useMutation({
    mutationFn: () =>
      api("/onboarding/me/submit", { method: "POST", schema: one(myOnboardingSchema) }).then(
        (r) => r.data,
      ),
    onSuccess: (data) => refresh(data),
  });
}
