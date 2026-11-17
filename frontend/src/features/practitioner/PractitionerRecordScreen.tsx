"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { useCloseReadSession, useReadSession } from "@/api/hooks/practitioner";
import { formatFieldValue } from "@/features/sharing/code";
import { formatLocalDateTime } from "@/features/sharing/labels";
import { DeniedNotice, ErrorNotice, isDenied, isNotFound } from "@/features/sharing/states";
import { formatRemaining, useLocalTimeZone, useSecondClock } from "@/features/sharing/time";
import styles from "./practitioner.module.css";

const endedMessage = "Access has ended. It may have expired or been revoked.";

export function PractitionerRecordScreen({ id }: { id: string }) {
  const record = useReadSession(id);
  const close = useCloseReadSession(id);
  const router = useRouter();
  const timeZone = useLocalTimeZone();
  const now = useSecondClock();
  const refetched = useRef(false);
  const { refetch } = record;

  const expiresAt = record.data?.expires_at ? new Date(record.data.expires_at).getTime() : null;
  const expired = now > 0 && expiresAt !== null && now >= expiresAt;

  useEffect(() => {
    if (!expired) {
      refetched.current = false;
      return;
    }
    if (refetched.current) return;
    refetched.current = true;
    void refetch();
  }, [expired, refetch]);

  // A return to the tab is a natural moment to re-check whether the grant is still live.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetch]);

  async function closeRecord() {
    if (close.isPending) return;
    try {
      await close.mutateAsync();
      router.push("/practitioner/lookup");
    } catch {
      // The error stays on screen with a retry path.
    }
  }

  const ended = expired || record.data?.available === false;

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1 className={styles.title}>Shared record</h1>
        <p className={styles.subtitle}>
          Read-only information the patient shared for this session. It is refreshed automatically and when you
          return to this tab.
        </p>
      </header>

      {record.isLoading ? <Skeleton lines={6} label="Loading the shared record" /> : null}

      {record.error && !isDenied(record.error) && !isNotFound(record.error) ? (
        <ErrorNotice
          title="Could not load this record"
          error={record.error}
          onRetry={() => void record.refetch()}
          retrying={record.isFetching}
        />
      ) : null}

      {record.error && isDenied(record.error) ? (
        <DeniedNotice title="This record is not available" error={record.error} />
      ) : null}

      {record.error && isNotFound(record.error) ? (
        <div className={styles.panel}>
          <Alert tone="info" title="This item is not available">
            This record is not available. It may have expired or been revoked.
          </Alert>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => router.push("/practitioner/lookup")}>
              Back to lookup
            </Button>
          </div>
        </div>
      ) : null}

      {record.data && ended ? (
        <section className={styles.panel} aria-labelledby="record-ended-title">
          <h2 id="record-ended-title" className={styles.panelTitle}>
            Record access
          </h2>
          <Alert tone="warning" title="Access ended">
            {endedMessage}
          </Alert>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => router.push("/practitioner/lookup")}>
              Back to lookup
            </Button>
          </div>
        </section>
      ) : null}

      {record.data && !ended ? (
        <section className={styles.panel} aria-labelledby="record-fields-title">
          <div className={styles.panelHead}>
            <div className={styles.panelIntro}>
              <div className={styles.badgeRow}>
                <h2 id="record-fields-title" className={styles.panelTitle}>
                  Shared fields
                </h2>
                <Badge tone="info" size="sm">
                  Read-only
                </Badge>
              </div>
              <p className={styles.panelCopy}>Every value below comes from the current patient record.</p>
            </div>
          </div>

          <div className={styles.countdown} role="timer" aria-live="off" aria-label="Time left in this access session">
            {expiresAt !== null ? (
              <p className={styles.countdownText}>Access ends in {formatRemaining(expiresAt - now)}.</p>
            ) : null}
            {record.data.expires_at ? (
              <p className={styles.meta}>
                Access ends at {formatLocalDateTime(record.data.expires_at, timeZone)}
              </p>
            ) : null}
          </div>

          {(record.data.fields?.length ?? 0) > 0 ? (
            <dl className={styles.recordList}>
              {record.data.fields?.map((field) => (
                <div key={field.key}>
                  <dt>{field.label}</dt>
                  <dd>{formatFieldValue(field.value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <Alert tone="info" title="No fields were shared">
              This session has no shared fields to show.
            </Alert>
          )}

          {close.error ? <ErrorNotice title="Could not close the record" error={close.error} /> : null}

          <div className={styles.actions}>
            <Button loading={close.isPending} onClick={() => void closeRecord()}>
              Close record
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
