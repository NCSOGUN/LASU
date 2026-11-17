"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bff } from "../client";
import { toApiError } from "../errors";
import { qk } from "../keys";
import {
  sessionResponseSchema,
  type LoginBody,
  type RegisterBody,
  type Session,
} from "../schemas";

async function fetchSession(): Promise<Session> {
  const response = await bff.get("/api/auth/session");
  const parsed = sessionResponseSchema.safeParse(response.data);
  if (!parsed.success) {
    throw toApiError(parsed.error);
  }
  return parsed.data;
}

export function useSession() {
  return useQuery({
    queryKey: qk.session,
    queryFn: fetchSession,
    staleTime: 60_000,
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: LoginBody): Promise<Session> => {
      const response = await bff.post("/api/auth/login", body);
      const parsed = sessionResponseSchema.safeParse(response.data);
      if (!parsed.success) throw toApiError(parsed.error);
      return parsed.data;
    },
    onSuccess: (session) => {
      queryClient.setQueryData(qk.session, session);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: RegisterBody): Promise<Session> => {
      const response = await bff.post("/api/auth/register", body);
      const parsed = sessionResponseSchema.safeParse(response.data);
      if (!parsed.success) throw toApiError(parsed.error);
      return parsed.data;
    },
    onSuccess: (session) => {
      queryClient.setQueryData(qk.session, session);
      queryClient.invalidateQueries({ queryKey: qk.me });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await bff.post("/api/auth/logout");
    },
    onSettled: () => {
      queryClient.clear();
    },
  });
}
