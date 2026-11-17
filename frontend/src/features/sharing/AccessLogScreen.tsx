"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { Timeline, type TimelineEvent } from "@/components/arc/timeline/timeline";
import { useAccessEvents, useShareableFields } from "@/api/hooks/sharing";
import type { AccessEvent } from "@/api/schemas";
import {
  actionLabel,
  channelLabel,
  humaniseKey,
  outcomeLabel,
  outcomeTone,
} from "./labels";
import { DeniedNotice, ErrorNotice, isDenied } from "./states";
import { useLocalTimeZone, useMinuteClock } from "./time";
import styles from "./sharing.module.css";

function fieldList(event: AccessEvent, labelFor: (key: string) => string): string {
  if (event.field_keys.length === 0) return "No fields";
  return event.field_keys.map(labelFor).join(", ");
}

export function AccessLogScreen() {
  const [limit, setLimit] = useState(50);
  const events = useAccessEvents(limit);
  const fields = useShareableFields();
  const timeZone = useLocalTimeZone();
  const now = useMinuteClock();

  const labelFor = (key: string) => fields.data?.fields.find((field) => field.key === key)?.label ?? humaniseKey(key);
  const showSkeleton = events.isLoading;

  const timelineEvents: TimelineEvent[] = (events.data ?? []).map((event) => {
    const fieldsText = fieldList(event, labelFor);
    return {
      id: event.id,
      at: event.occurred_at,
      title: actionLabel(event.action),
      meta: `${outcomeLabel(event.outcome)} · ${channelLabel(event.channel)} · ${fieldsText}`,
      tone: outcomeTone(event.outcome),
      detail: (
        <div className={styles.logDetail}>
          <Badge tone={outcomeTone(event.outcome)} size="sm">
            {outcomeLabel(event.outcome)}
          </Badge>
          <span className={styles.logDetailText}>{fieldsText}</span>
        </div>
      ),
    };
  });

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1 className={styles.title}>Access log</h1>
        <p className={styles.subtitle}>
          Every time a code is created, opened or revoked, and every read of a shared field, appears here in local
          time.
        </p>
      </header>

      {showSkeleton ? <Skeleton lines={6} label="Loading access events" /> : null}

      {events.error && !isDenied(events.error) ? (
        <ErrorNotice
          title="Could not load the access log"
          error={events.error}
          onRetry={() => void events.refetch()}
          retrying={events.isFetching}
        />
      ) : null}

      {events.error && isDenied(events.error) ? (
        <DeniedNotice title="The access log is not available" error={events.error} />
      ) : null}

      {!showSkeleton && events.data && events.data.length === 0 ? (
        <EmptyState
          title="No access events yet"
          description="When you create or share an access code, the activity appears here."
          action={
            <Link className={styles.textLink} href="/app/access">
              Create an access code
            </Link>
          }
        />
      ) : null}

      {!showSkeleton && timelineEvents.length > 0 ? (
        <>
          <Timeline
            events={timelineEvents}
            now={now}
            label="Access events"
            timeZone={timeZone}
            locale="en-GB"
            headingLevel={2}
            defaultExpanded={timelineEvents.map((event) => event.id)}
          />
          <div className={styles.loadMore}>
            {limit < 100 && (events.data?.length ?? 0) >= 50 ? (
              <Button
                variant="secondary"
                loading={events.isFetching && events.isPlaceholderData}
                onClick={() => setLimit(100)}
              >
                Load more
              </Button>
            ) : null}
            {limit === 100 && (events.data?.length ?? 0) > 0 ? (
              <p className={styles.meta}>Showing the latest 100 events</p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
