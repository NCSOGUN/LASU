"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { aiTimeout, request } from "../client";
import { qk } from "../keys";
import {
  momentUpdateBodySchema,
  momentUpdateResponseSchema,
  scheduleAddBodySchema,
  scheduleCreateBodySchema,
  scheduleCreateResponseSchema,
  scheduleDeleteResponseSchema,
  scheduleDetailResponseSchema,
  scheduleListResponseSchema,
  scheduleRemoveBodySchema,
  scheduleWithMomentsSchema,
  type Schedule,
  type ScheduleAddBody,
  type ScheduleCreateBody,
  type ScheduleListResponse,
} from "../schemas";
import { z } from "zod";

export const MEDICATION_PAGE_SIZE = 10;

type ScheduleWithMoments = z.infer<typeof scheduleWithMomentsSchema>;

type ScheduleDetail = { schedule: ScheduleWithMoments };

export function useMedications(page: number, limit = MEDICATION_PAGE_SIZE) {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  return useQuery({
    queryKey: qk.medications(page),
    queryFn: () =>
      request<ScheduleListResponse>(
        {
          method: "GET",
          url: "/medications",
          params: { page, limit: safeLimit },
        },
        scheduleListResponseSchema,
      ),
  });
}

export function useMedication(id: string) {
  return useQuery({
    queryKey: qk.medication(id),
    queryFn: () =>
      request<ScheduleDetail>(
        {
          method: "GET",
          url: `/medications/${encodeURIComponent(id)}`,
        },
        scheduleDetailResponseSchema,
      ),
    enabled: Boolean(id),
  });
}

export type CreateScheduleInput =
  | { mode: "manual"; body: ScheduleCreateBody }
  | {
      mode: "ai";
      startDate: string;
      endDate: string;
      text: string;
      document: File | null;
      signal: AbortSignal;
    };

export function useCreateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateScheduleInput) => {
      if (input.mode === "manual") {
        const body = scheduleCreateBodySchema.parse(input.body);
        return request(
          {
            method: "POST",
            url: "/medications",
            data: body,
          },
          scheduleCreateResponseSchema,
        );
      }

      const form = new FormData();
      form.append("startDate", input.startDate);
      form.append("endDate", input.endDate);
      if (input.text.trim()) form.append("medications", input.text.trim());
      if (input.document) form.append("document", input.document, input.document.name);

      return request(
        {
          method: "POST",
          url: "/medications",
          data: form,
          timeout: aiTimeout,
          signal: input.signal,
        },
        scheduleCreateResponseSchema,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medications"] });
    },
  });
}

export interface MomentUpdateInput {
  momentId: string;
  status: "TAKEN" | "MISSED" | "PENDING";
}

type Rollback = { previous?: ScheduleDetail };

export function useUpdateMoment(scheduleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MomentUpdateInput) => {
      const body = momentUpdateBodySchema.parse({ status: input.status });
      return request(
        {
          method: "PATCH",
          url: `/medications/moments/${encodeURIComponent(input.momentId)}`,
          data: body,
        },
        momentUpdateResponseSchema,
      );
    },
    onMutate: async (input): Promise<Rollback> => {
      await queryClient.cancelQueries({ queryKey: qk.medication(scheduleId) });
      const previous = queryClient.getQueryData<ScheduleDetail>(qk.medication(scheduleId));
      if (previous) {
        queryClient.setQueryData<ScheduleDetail>(qk.medication(scheduleId), {
          ...previous,
          schedule: {
            ...previous.schedule,
            moments: previous.schedule.moments?.map((moment) =>
              moment.id === input.momentId ? { ...moment, status: input.status } : moment,
            ),
          },
        });
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(qk.medication(scheduleId), context.previous);
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData<ScheduleDetail>(qk.medication(scheduleId), (current) => {
        if (!current) return current;
        return {
          schedule: {
            ...current.schedule,
            progress: data.progress,
            score: data.score,
            moments: current.schedule.moments?.map((moment) =>
              moment.id === data.moment.id ? data.moment : moment,
            ),
          },
        };
      });
      queryClient.invalidateQueries({ queryKey: ["medications"] });
    },
  });
}

function mergeSchedule(current: ScheduleWithMoments | undefined, schedule: Schedule): ScheduleWithMoments {
  return {
    ...(current ?? {}),
    ...schedule,
    moments: current?.moments,
  } as ScheduleWithMoments;
}

export function useAddMedication(scheduleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ScheduleAddBody) => {
      const parsed = scheduleAddBodySchema.parse(body);
      return request(
        {
          method: "PATCH",
          url: `/medications/${encodeURIComponent(scheduleId)}/add`,
          data: parsed,
        },
        scheduleCreateResponseSchema,
      );
    },
    onSuccess: (data) => {
      queryClient.setQueryData<ScheduleDetail>(qk.medication(scheduleId), (current) =>
        current ? { schedule: mergeSchedule(current.schedule, data.schedule) } : current,
      );
      queryClient.invalidateQueries({ queryKey: qk.medication(scheduleId) });
      queryClient.invalidateQueries({ queryKey: ["medications"] });
    },
  });
}

export function useRemoveMedication(scheduleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: z.infer<typeof scheduleRemoveBodySchema>) => {
      const parsed = scheduleRemoveBodySchema.parse(body);
      return request(
        {
          method: "PATCH",
          url: `/medications/${encodeURIComponent(scheduleId)}/remove`,
          data: parsed,
        },
        scheduleCreateResponseSchema,
      );
    },
    onSuccess: (data) => {
      queryClient.setQueryData<ScheduleDetail>(qk.medication(scheduleId), (current) =>
        current ? { schedule: mergeSchedule(current.schedule, data.schedule) } : current,
      );
      queryClient.invalidateQueries({ queryKey: qk.medication(scheduleId) });
      queryClient.invalidateQueries({ queryKey: ["medications"] });
    },
  });
}

export function useDeleteSchedule(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request(
        {
          method: "DELETE",
          url: `/medications/${encodeURIComponent(id)}`,
        },
        scheduleDeleteResponseSchema,
      ),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: qk.medication(id) });
      queryClient.invalidateQueries({ queryKey: ["medications"] });
    },
  });
}
