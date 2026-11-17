"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { request } from "../client";
import { qk } from "../keys";
import {
  consentBodySchema,
  consentChannelSchema,
  consentResponseSchema,
  consentRevokeResponseSchema,
  fieldsResponseSchema,
  phoneBeginBodySchema,
  phoneBeginResponseSchema,
  phoneConfirmBodySchema,
  phoneConfirmResponseSchema,
  type Consent,
  type ConsentBody,
} from "../schemas";

export type ConsentChannel = z.infer<typeof consentChannelSchema>;

/**
 * Channels need the field list to describe exactly what SMS and USSD can read.
 * Other lanes read the same qk.fields cache entry with their own hook name.
 */
export function useChannelFields() {
  return useQuery({
    queryKey: qk.fields,
    queryFn: () => request({ url: "/me/fields", method: "GET" }, fieldsResponseSchema),
  });
}

/**
 * The API has no GET /me/consents (backend ask B6). A consent saved by PUT is
 * written to this cache entry and stays there for the session. No fetch runs:
 * the query is disabled and only reads what the mutation stored.
 */
export function useStoredConsent(channel: ConsentChannel) {
  return useQuery<Consent | null | undefined>({
    queryKey: qk.consents(channel),
    queryFn: () => Promise.resolve(undefined),
    enabled: false,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useBeginPhoneVerification() {
  return useMutation({
    mutationFn: (body: { phone: string }) =>
      request(
        { url: "/auth/phone/begin", method: "POST", data: phoneBeginBodySchema.parse(body) },
        phoneBeginResponseSchema,
      ),
  });
}

export function useConfirmPhoneVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { phone: string; code: string }) =>
      request(
        { url: "/auth/phone/confirm", method: "POST", data: phoneConfirmBodySchema.parse(body) },
        phoneConfirmResponseSchema,
      ),
    onSuccess: () => {
      // Confirming creates the ChannelLink the consent endpoints require.
      void queryClient.invalidateQueries({ queryKey: qk.session });
      void queryClient.invalidateQueries({ queryKey: qk.me });
    },
  });
}

export function useSaveConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ channel, ...body }: ConsentBody & { channel: ConsentChannel }) =>
      request(
        { url: `/me/consents/${channel}`, method: "PUT", data: consentBodySchema.parse(body) },
        consentResponseSchema,
      ),
    onSuccess: (saved, { channel }) => {
      queryClient.setQueryData(qk.consents(channel), saved);
      void queryClient.invalidateQueries({ queryKey: qk.accessEvents });
    },
  });
}

export function useRevokeConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ channel }: { channel: ConsentChannel }) =>
      request({ url: `/me/consents/${channel}`, method: "DELETE" }, consentRevokeResponseSchema),
    onSuccess: (_result, { channel }) => {
      queryClient.setQueryData(qk.consents(channel), null);
      void queryClient.invalidateQueries({ queryKey: qk.accessEvents });
    },
  });
}
