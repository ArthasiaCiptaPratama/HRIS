import type {
  OnboardingBatchInput,
  OnboardingCandidateInput,
  OnboardingStatus,
} from "@hris/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import {
  batchSchema,
  candidatePageSchema,
  inviteExistingResultSchema,
  one,
  previewSchema,
  processResultSchema,
} from "./schemas";

// D-045 bagian a: hook Penerimaan Karyawan Baru.

export const onboardingKeys = {
  all: ["onboarding"] as const,
  list: (params: Record<string, unknown>) => ["onboarding", "list", params] as const,
  batch: (id: string) => ["onboarding", "batch", id] as const,
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
