"use client";

import { useState, useSyncExternalStore } from "react";
import { Alert } from "@/components/arc/alert/alert";
import {
  CompletenessCard,
  DosesCard,
  EmergencyCard,
  GrantsCard,
  OverviewGrid,
  SymptomsCard,
  type RegionState,
} from "./OverviewCards";
import {
  useMarkDose,
  useOverviewEmergencySummary,
  useOverviewFields,
  useOverviewGrants,
  useOverviewSchedules,
  useOverviewScheduleDetail,
  useOverviewSymptoms,
} from "@/api/hooks/overview";
import { toApiError } from "@/api/errors";
import { activeGrantCount, emergencyStatus, latestSymptoms, profileCompleteness, todaysMoments } from "./derive";
import styles from "./overview-screen.module.css";

function stateOf(query: { isPending: boolean; isError: boolean }): RegionState {
  if (query.isPending) return "loading";
  if (query.isError) return "error";
  return "ready";
}

const subscribeToNothing = () => () => {};
const clientMounted = () => true;
const serverMounted = () => false;

export function OverviewScreen() {
  const fields = useOverviewFields();
  const emergency = useOverviewEmergencySummary();
  const grants = useOverviewGrants();
  const symptoms = useOverviewSymptoms();
  const schedules = useOverviewSchedules();

  const firstSchedule = schedules.data?.schedules[0];
  const scheduleDetail = useOverviewScheduleDetail(firstSchedule?.id);
  const markDose = useMarkDose();

  const [notice, setNotice] = useState<string | null>(null);
  const [doseError, setDoseError] = useState<string | null>(null);
  const mounted = useSyncExternalStore(subscribeToNothing, clientMounted, serverMounted);

  const completeness = profileCompleteness(fields.data?.fields ?? []);
  const emergencyState = emergencyStatus(emergency.data);
  const grantCount = activeGrantCount(grants.data ?? []);
  const recentSymptoms = latestSymptoms(symptoms.data?.symptoms ?? [], 3);
  const moments = scheduleDetail.data?.schedule.moments ?? [];
  const today = mounted ? todaysMoments(moments, new Date()) : [];
  const scheduleId = firstSchedule?.id;

  const fieldsError = fields.isError ? toApiError(fields.error) : null;
  const emergencyError = emergency.isError ? toApiError(emergency.error) : null;
  const grantsError = grants.isError ? toApiError(grants.error) : null;
  const symptomsError = symptoms.isError ? toApiError(symptoms.error) : null;
  const schedulesError = schedules.isError ? toApiError(schedules.error) : null;
  const detailError = scheduleDetail.isError ? toApiError(scheduleDetail.error) : null;

  const dosesState: RegionState = schedules.isPending
    ? "loading"
    : schedules.isError
      ? "error"
      : !firstSchedule
        ? "empty"
        : scheduleDetail.isPending || !mounted
          ? "loading"
          : scheduleDetail.isError
            ? "error"
            : today.length === 0
              ? "empty"
              : "ready";

  function mark(momentId: string, status: "TAKEN" | "MISSED") {
    if (!scheduleId) return;
    setNotice(null);
    setDoseError(null);
    markDose.mutate(
      { momentId, status, scheduleId },
      {
        onSuccess: () => setNotice(status === "TAKEN" ? "Dose marked taken." : "Dose marked missed."),
        onError: (error) => setDoseError(toApiError(error).message),
      },
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1 className={styles.title}>Overview</h1>
        <p className={styles.subtitle}>
          Your health record, sharing choices and care items in one place. You decide what is shared, and for how
          long.
        </p>
      </header>

      {notice ? (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      ) : null}

      {doseError ? (
        <Alert tone="danger" title="Could not update the dose">
          {doseError}
        </Alert>
      ) : null}

      <OverviewGrid>
        <CompletenessCard
          state={stateOf(fields)}
          filled={completeness.filled}
          total={completeness.total}
          error={fieldsError?.message}
          requestId={fieldsError?.requestId}
          onRetry={() => fields.refetch()}
        />
        <EmergencyCard
          state={stateOf(emergency)}
          available={emergencyState.available}
          count={emergencyState.count}
          error={emergencyError?.message}
          requestId={emergencyError?.requestId}
          onRetry={() => emergency.refetch()}
        />
        <GrantsCard
          state={stateOf(grants)}
          count={grantCount}
          error={grantsError?.message}
          requestId={grantsError?.requestId}
          onRetry={() => grants.refetch()}
        />
        <SymptomsCard
          state={symptoms.isPending ? "loading" : symptoms.isError ? "error" : recentSymptoms.length ? "ready" : "empty"}
          records={recentSymptoms}
          error={symptomsError?.message}
          requestId={symptomsError?.requestId}
          onRetry={() => symptoms.refetch()}
        />
        <DosesCard
          state={dosesState}
          moments={today}
          pendingId={markDose.isPending ? markDose.variables?.momentId : null}
          onMark={mark}
          error={detailError?.message ?? schedulesError?.message}
          requestId={detailError?.requestId ?? schedulesError?.requestId}
          onRetry={() => (firstSchedule ? scheduleDetail.refetch() : schedules.refetch())}
        />
      </OverviewGrid>
    </div>
  );
}
