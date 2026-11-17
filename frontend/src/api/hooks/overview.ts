"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "../client";
import { qk } from "../keys";
import {
  emergencySummarySchema,
  fieldsResponseSchema,
  grantListSchema,
  meResponseSchema,
  momentUpdateResponseSchema,
  scheduleDetailResponseSchema,
  scheduleListResponseSchema,
  symptomListResponseSchema,
} from "../schemas";

const listParams = { page: 1, limit: 3 };

export function useOverviewMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: () => request({ url: "/me", method: "GET" }, meResponseSchema),
  });
}

export function useOverviewFields() {
  return useQuery({
    queryKey: qk.fields,
    queryFn: () => request({ url: "/me/fields", method: "GET" }, fieldsResponseSchema),
  });
}

export function useOverviewEmergencySummary() {
  return useQuery({
    queryKey: qk.emergency,
    queryFn: () => request({ url: "/me/emergency-summary", method: "GET" }, emergencySummarySchema),
  });
}

export function useOverviewGrants() {
  return useQuery({
    queryKey: qk.grants,
    queryFn: () => request({ url: "/me/grants", method: "GET" }, grantListSchema),
  });
}

export function useOverviewSymptoms() {
  return useQuery({
    queryKey: qk.symptoms(1),
    queryFn: () =>
      request({ url: "/symptom", method: "GET", params: listParams }, symptomListResponseSchema),
  });
}

export function useOverviewSchedules() {
  return useQuery({
    queryKey: qk.medications(1),
    queryFn: () =>
      request({ url: "/medications", method: "GET", params: listParams }, scheduleListResponseSchema),
  });
}

export function useOverviewScheduleDetail(id: string | undefined) {
  return useQuery({
    queryKey: qk.medication(id ?? "none"),
    queryFn: () => request({ url: `/medications/${id}`, method: "GET" }, scheduleDetailResponseSchema),
    enabled: Boolean(id),
  });
}

export function useMarkDose() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ momentId, status }: { momentId: string; status: "TAKEN" | "MISSED"; scheduleId: string }) =>
      request({ url: `/medications/moments/${momentId}`, method: "PATCH", data: { status } }, momentUpdateResponseSchema),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: qk.medication(variables.scheduleId) });
      queryClient.invalidateQueries({ queryKey: qk.medications(1) });
    },
  });
}
