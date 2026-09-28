import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/api";
import { notificationPageSchema } from "./schemas";

export const notificationKeys = {
  list: (page: number, pageSize: number) => ["notifications", page, pageSize] as const,
};

export function useNotifications(page: number, pageSize = 20) {
  return useQuery({
    queryKey: notificationKeys.list(page, pageSize),
    queryFn: ({ signal }) =>
      api(`/notifications?page=${page}&pageSize=${pageSize}`, {
        schema: notificationPageSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/notifications/${id}/read`, {
        method: "POST",
        schema: z.object({ data: z.object({ id: z.string() }) }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api("/notifications/read-all", {
        method: "POST",
        schema: z.object({ data: z.object({ updated: z.number() }) }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
