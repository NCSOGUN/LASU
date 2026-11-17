"use client";

import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Pagination } from "@/components/arc/pagination/pagination";
import { Progress } from "@/components/arc/progress/progress";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { toApiError } from "@/api/errors";
import { MEDICATION_PAGE_SIZE, useMedications } from "@/api/hooks/medications";
import { Pill } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CreateScheduleForm } from "./CreateScheduleForm";
import { formatScheduleRange, formatScore, parseDecimal } from "./format";
import styles from "./medications.module.css";

export function MedicationsPage() {
  const [page, setPage] = useState(1);
  const schedules = useMedications(page, MEDICATION_PAGE_SIZE);
  const error = schedules.error ? toApiError(schedules.error) : null;
  const denied = error?.status === 403 || error?.code === "patient_profile_required";

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1 className={styles.title}>Medications</h1>
        <p className={styles.subtitle}>
          Keep dose schedules in one place, record what you took, and check how closely a schedule has been followed.
        </p>
      </header>

      <CreateScheduleForm />

      <section className={styles.listSection} aria-labelledby="schedules-title">
        <div className={styles.listHeader}>
          <h2 id="schedules-title" className={styles.listTitle}>
            Schedules
          </h2>
          {schedules.data && !schedules.isLoading ? (
            <p className={styles.listCount}>
              {schedules.data.total} {schedules.data.total === 1 ? "schedule" : "schedules"}
            </p>
          ) : null}
        </div>

        {schedules.isLoading ? (
          <div className={styles.skeletonWrap}>
            <Skeleton lines={5} label="Loading medication schedules" />
          </div>
        ) : error ? (
          <Alert
            tone={denied ? "warning" : "danger"}
            title={denied ? "Medication schedules are not available for this account" : "Could not load medication schedules"}
          >
            {denied ? "A patient profile is required. Contact support if you think this is wrong." : error.message}
            {error.requestId ? <span className={styles.requestId}>Request {error.requestId}</span> : null}
          </Alert>
        ) : schedules.data && schedules.data.schedules.length === 0 ? (
          <EmptyState
            icon={<Pill size={24} />}
            title="No schedules yet"
            description="Create a schedule above, by hand or from a description, and its doses will appear here."
            action={
              <Button
                variant="secondary"
                onClick={() => document.getElementById("new-schedule-title")?.scrollIntoView({ behavior: "smooth" })}
              >
                Create a schedule
              </Button>
            }
            label="Medication schedules"
          />
        ) : schedules.data ? (
          <>
            <ul className={styles.list}>
              {schedules.data.schedules.map((schedule) => (
                <li key={schedule.id}>
                  <Link className={styles.rowLink} href={`/app/medications/${schedule.id}`}>
                    <span className={styles.rowTop}>
                      <span className={styles.rowTitle}>
                        {schedule.title || schedule.summary || "Medication schedule"}
                      </span>
                      <span className={styles.rowDate}>{formatScheduleRange(schedule.start_date, schedule.end_date)}</span>
                    </span>
                    {schedule.summary && schedule.title ? <span className={styles.rowSummary}>{schedule.summary}</span> : null}
                    <span className={styles.rowMeta}>
                      <span className={styles.rowProgress}>
                        <Progress
                          value={parseDecimal(schedule.progress)}
                          label="Adherence"
                          showValue
                        />
                      </span>
                      <span className={styles.rowDate}>Score {formatScore(schedule.score)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {schedules.data.totalPages > 1 ? (
              <Pagination page={page} pageCount={schedules.data.totalPages} onPageChange={setPage} label="Schedule pages" />
            ) : null}
          </>
        ) : null}

        {error && !denied ? (
          <div className={styles.stateActions}>
            <Button variant="secondary" size="sm" onClick={() => void schedules.refetch()}>
              Try again
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
