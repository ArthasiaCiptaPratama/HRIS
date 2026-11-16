import type { Permission, Role } from "@hris/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { authKeys } from "@/features/auth/api";
import { api } from "@/lib/api";
import {
  accountInviteQueuedSchema,
  accountSchema,
  auditLogSchema,
  grantSchema,
  linkSuggestionSchema,
  one,
  page,
} from "./schemas";

export const iamKeys = {
  accounts: (params: Record<string, unknown>) => ["iam", "accounts", params] as const,
  grants: (params: Record<string, unknown>) => ["iam", "grants", params] as const,
  auditLogs: (params: Record<string, unknown>) => ["iam", "audit-logs", params] as const,
};

function query(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

export interface AccountsParams {
  page: number;
  pageSize?: number | undefined;
  role?: Role | undefined;
  isActive?: boolean | undefined;
  q?: string | undefined;
  /** ONB-D2: hanya akun Karyawan/Manager yang belum tertaut karyawan. */
  unlinked?: boolean | undefined;
}

export function useAccounts(params: AccountsParams, enabled = true) {
  return useQuery({
    queryKey: iamKeys.accounts({ ...params }),
    queryFn: ({ signal }) =>
      api(`/accounts${query({ pageSize: 20, ...params })}`, {
        schema: page(accountSchema),
        signal,
      }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["iam"] });
    void queryClient.invalidateQueries({ queryKey: authKeys.me });
  };
}

export function useInviteAccount() {
  const invalidate = useInvalidate();
  const queryClient = useQueryClient();
  return useMutation({
    // ONB-D2: role Karyawan → 202 antrean (Undang Karyawan Terdaftar); role lain → 201 akun.
    mutationFn: (body: { email: string; role: Role; employeeId?: string | undefined }) =>
      api("/accounts/invite", {
        method: "POST",
        body,
        schema: one(z.union([accountInviteQueuedSchema, accountSchema])),
      }).then((r) => r.data),
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

/** ONB-D2: tautkan akun yang belum tertaut ke data karyawan. */
export function useLinkEmployee() {
  const invalidate = useInvalidate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, employeeId }: { id: string; employeeId: string }) =>
      api(`/accounts/${id}/employee`, {
        method: "PUT",
        body: { employeeId },
        schema: one(accountSchema),
      }).then((r) => r.data),
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

export function useLinkSuggestions(accountId: string | null) {
  return useQuery({
    queryKey: ["iam", "link-suggestions", accountId],
    queryFn: ({ signal }) =>
      api(`/accounts/${accountId}/link-suggestions`, {
        schema: one(z.array(linkSuggestionSchema)),
        signal,
      }).then((r) => r.data),
    enabled: accountId !== null,
  });
}

export function useChangeRole() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) =>
      api(`/accounts/${id}/role`, { method: "PATCH", body: { role }, schema: one(accountSchema) }),
    onSuccess: invalidate,
  });
}

// D-040: set penugasan perusahaan akun HR_ADMIN (SUPER_ADMIN).
export function useAssignCompanies() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, companyIds }: { id: string; companyIds: string[] }) =>
      api(`/accounts/${id}/companies`, {
        method: "PUT",
        body: { companyIds },
        schema: one(accountSchema),
      }),
    onSuccess: invalidate,
  });
}

export function useSetActive() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api(`/accounts/${id}/${active ? "reactivate" : "deactivate"}`, {
        method: "POST",
        schema: one(accountSchema),
      }),
    onSuccess: invalidate,
  });
}

export function useTransferPrimary() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (targetAccountId: string) =>
      api("/accounts/primary-super-admin/transfer", {
        method: "POST",
        body: { targetAccountId },
        schema: one(accountSchema),
      }),
    onSuccess: invalidate,
  });
}

export interface GrantsParams {
  page: number;
  pageSize?: number | undefined;
  active?: boolean | undefined;
  accountId?: string | undefined;
}

export function useGrants(params: GrantsParams) {
  return useQuery({
    queryKey: iamKeys.grants({ ...params }),
    queryFn: ({ signal }) =>
      api(`/grants${query({ pageSize: 20, ...params })}`, { schema: page(grantSchema), signal }),
    placeholderData: keepPreviousData,
  });
}

export function useCreateGrant() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: {
      accountId: string;
      permission: Permission;
      expiresAt?: string;
      reason?: string;
    }) => api("/grants", { method: "POST", body, schema: one(grantSchema) }),
    onSuccess: invalidate,
  });
}

export function useRevokeGrant() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api(`/grants/${id}/revoke`, {
        method: "POST",
        body: reason ? { reason } : {},
        schema: one(grantSchema),
      }),
    onSuccess: invalidate,
  });
}

export interface AuditParams {
  page: number;
  pageSize?: number | undefined;
  action?: string | undefined;
  entityType?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export function useAuditLogs(params: AuditParams) {
  return useQuery({
    queryKey: iamKeys.auditLogs({ ...params }),
    queryFn: ({ signal }) =>
      api(`/audit-logs${query({ pageSize: 20, ...params })}`, {
        schema: page(auditLogSchema),
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}
