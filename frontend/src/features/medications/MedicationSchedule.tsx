"use client";

import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { DateRangePicker, type DateRange } from "@/components/arc/date-range-picker/date-range-picker";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Progress } from "@/components/arc/progress/progress";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { ApiError, toApiError } from "@/api/errors";
import { useAddMedication, useDeleteSchedule, useMedication, useRemoveMedication, useUpdateMoment } from "@/api/hooks/medications";
import type { MedicationMoment } from "@/api/schemas";
import { CalendarDays, Pill } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearAiCreated, isAiCreated } from "./ai-created";
import { DrugFields, emptyDrug, toMedicationEntry, type DrugDraft } from "./DrugFields";
import {
  formatMomentDay,
  formatMomentTime,
  formatScheduleRange,
  formatScore,
  groupMomentsByDay,
  localDateFromUtc,
  parseDecimal,
  toIsoDate,
} from "./format";
import styles from "./medications.module.css";

const statusOptions = [
  { value: "TAKEN", label: "Taken" },
  { value: "MISSED", label: "Missed" },
  { value: "PENDING", label: "Pending" },
];

function statusLabel(status: string) {
  if (status === "TAKEN") return "taken";
  if (status === "MISSED") return "missed";
  return "pending";
}

export function MedicationSchedule({ id }: { id: string }) {
  const router = useRouter();
  const detail = useMedication(id);
  const updateMoment = useUpdateMoment(id);
  const addMedication = useAddMedication(id);
  const removeMedication = useRemoveMedication(id);
  const deleteSchedule = useDeleteSchedule(id);

  const [showAiBanner, setShowAiBanner] = useState(() => isAiCreated(id));
  useEffect(() => () => clearAiCreated(id), [id]);

  const [status, setStatus] = useState("");
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [savingMoments, setSavingMoments] = useState<string[]>([]);

  const [addOpen, setAddOpen] = useState(false);
  const [addRange, setAddRange] = useState<DateRange | null>(null);
  const [addDrug, setAddDrug] = useState<DrugDraft>(emptyDrug());
  const [addError, setAddError] = useState<string | null>(null);

  const [removeDrug, setRemoveDrug] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const schedule = detail.data?.schedule;
  const error = detail.error ? toApiError(detail.error) : null;
  const denied = error?.status === 403;
  const missing = error?.status === 404;
  const moments = schedule?.moments ?? [];
  const groups = groupMomentsByDay(moments);

  function openAdd() {
    setAddError(null);
    setAddDrug(emptyDrug());
    if (schedule) {
      setAddRange({
        start: localDateFromUtc(schedule.start_date),
        end: localDateFromUtc(schedule.end_date),
      });
    }
    setAddOpen(true);
  }

  function markMoment(moment: MedicationMoment, value: string) {
    if (value !== "TAKEN" && value !== "MISSED" && value !== "PENDING") return;
    if (savingMoments.includes(moment.id)) return;
    setActionError(null);
    setSavingMoments((current) => [...current, moment.id]);
    updateMoment.mutate(
      { momentId: moment.id, status: value },
      {
        onSuccess: () => setStatus(`${moment.drug} marked ${statusLabel(value)}.`),
        onError: (caught) => setActionError(toApiError(caught)),
        onSettled: () => setSavingMoments((current) => current.filter((id) => id !== moment.id)),
      },
    );
  }

  async function submitAdd() {
    setAddError(null);
    if (!addRange) {
      setAddError("Choose the first and last day for these doses.");
      return;
    }
    const entry = toMedicationEntry(addDrug);
    if (!entry) {
      setAddError("Enter a drug name and at least one dose time.");
      return;
    }
    const startDate = toIsoDate(addRange.start);
    const endDate = toIsoDate(addRange.end);
    if (endDate < startDate) {
      setAddError("The end date must not be before the start date.");
      return;
    }
    try {
      await addMedication.mutateAsync({ startDate, endDate, medications: [entry] });
      setAddOpen(false);
      setStatus(`${entry.drug} added. Check the dose times below.`);
    } catch (caught) {
      setAddError(toApiError(caught).message);
    }
  }

  async function confirmRemove() {
    if (!removeDrug) return;
    setActionError(null);
    try {
      await removeMedication.mutateAsync({ drug: removeDrug });
      setStatus(`${removeDrug} removed. Its pending doses were deleted.`);
      setRemoveDrug(null);
    } catch (caught) {
      setActionError(toApiError(caught));
    }
  }

  async function confirmDelete() {
    setActionError(null);
    try {
      await deleteSchedule.mutateAsync();
      router.push("/app/medications");
    } catch (caught) {
      setActionError(toApiError(caught));
    }
  }

  if (detail.isLoading) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Medication schedule</h1>
        <div className={styles.skeletonWrap}>
          <Skeleton lines={6} label="Loading schedule" />
        </div>
      </div>
    );
  }

  if (error || !schedule) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Medication schedule</h1>
        <Alert
          tone={denied || missing ? "warning" : "danger"}
          title={
            denied
              ? "This schedule is not available for this account"
              : missing
                ? "This item is not available"
                : "Could not load this schedule"
          }
        >
          {denied
            ? "A patient profile is required to open medication schedules. Contact support if you think this is wrong."
            : missing
              ? "It may have been deleted, or it does not exist."
              : error?.message}
          {error?.requestId ? <span className={styles.requestId}>Request {error.requestId}</span> : null}
        </Alert>
        <div className={styles.stateActions}>
          <Link className={styles.hint} href="/app/medications">
            Back to medications
          </Link>
          {!denied && !missing && error ? (
            <Button variant="secondary" size="sm" onClick={() => void detail.refetch()}>
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const title = schedule.title || schedule.summary || "Medication schedule";

  return (
    <div className={styles.page}>
      <div>
        <Link className={styles.hint} href="/app/medications">
          Back to medications
        </Link>
      </div>

      {showAiBanner ? (
        <Alert
          tone="warning"
          title="Check this schedule before relying on it"
          onDismiss={() => {
            setShowAiBanner(false);
            clearAiCreated(id);
          }}
        >
          Created by AI from your text. Check every drug, dose and time before relying on it.
        </Alert>
      ) : null}

      <header className={styles.detailHeader}>
        <div className={styles.detailTop}>
          <div className={styles.detailHeading}>
            <h1 className={styles.detailTitle}>{title}</h1>
            <div className={styles.detailMeta}>
              <Badge tone="neutral" icon={<CalendarDays size={12} aria-hidden="true" />}>
                {formatScheduleRange(schedule.start_date, schedule.end_date)}
              </Badge>
              <span>Updated {formatMomentDay(schedule.updated_at)}</span>
            </div>
          </div>
          <div className={styles.stateActions}>
            <Button onClick={openAdd}>Add drug</Button>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              Delete schedule
            </Button>
          </div>
        </div>
        {schedule.summary ? <p className={styles.summary}>{schedule.summary}</p> : null}

        <div className={styles.metrics}>
          <div className={styles.metric}>
            <p className={styles.metricLabel}>Adherence</p>
            <Progress value={parseDecimal(schedule.progress)} label="Adherence" showValue />
          </div>
          <div className={styles.metric}>
            <p className={styles.metricLabel}>Score</p>
            <p className={styles.metricValue}>{formatScore(schedule.score)}</p>
          </div>
        </div>

        <p className={styles.statusLine} role="status">
          {status}
        </p>
      </header>

      {actionError ? (
        <Alert tone="danger" title="Could not save this change">
          {actionError.message}
          {actionError.requestId ? <span className={styles.requestId}>Request {actionError.requestId}</span> : null}
        </Alert>
      ) : null}

      <section aria-labelledby="drugs-title">
        <h2 id="drugs-title" className={styles.listTitle}>
          Drugs
        </h2>
        {schedule.medications.length ? (
          <ul className={styles.drugList}>
            {schedule.medications.map((medication, index) => (
              <li className={styles.drugRow} key={`${medication.drug}-${index}`}>
                <div className={styles.drugCopy}>
                  <p className={styles.drugName}>
                    {medication.drug}
                    {medication.dose ? `, ${medication.dose}` : ""}
                  </p>
                  <p className={styles.drugDetail}>
                    {[medication.frequency, medication.times.map((time) => formatTimeParts(time.hour, time.minute)).join(", ")]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setRemoveDrug(medication.drug)}>
                  Remove {medication.drug}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<Pill size={24} />}
            title="No drugs in this schedule"
            description="Add a drug with its dose times to create doses."
            action={
              <Button variant="secondary" onClick={openAdd}>
                Add a drug
              </Button>
            }
            label="Drugs"
          />
        )}
      </section>

      <section aria-labelledby="timeline-title">
        <h2 id="timeline-title" className={styles.listTitle}>
          Dose timeline
        </h2>
        {groups.length ? (
          <div className={styles.dayGroups}>
            {groups.map((group) => (
              <section className={styles.dayGroup} key={group.key} aria-labelledby={`day-${group.key}`}>
                <h3 id={`day-${group.key}`} className={styles.dayTitle}>
                  {group.label}
                </h3>
                <ol className={styles.momentList}>
                  {group.moments.map((moment) => {
                    const saving = savingMoments.includes(moment.id);
                    const time = formatMomentTime(moment.time);
                    return (
                      <li className={styles.momentRow} key={moment.id}>
                        <span className={styles.momentTime}>{time}</span>
                        <div className={styles.momentCopy}>
                          <p className={styles.momentDrug}>
                            {moment.drug}
                            {moment.dose ? `, ${moment.dose}` : ""}
                          </p>
                          <p className={styles.momentDetail}>
                            {[moment.frequency, saving ? "Saving" : null].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <div className={styles.momentControl}>
                          <SegmentedControl
                            label={`Status for ${moment.drug} at ${time} on ${formatMomentDay(moment.time)}`}
                            value={moment.status}
                            onValueChange={(value) => markMoment(moment, value)}
                            options={statusOptions}
                            fullWidth
                          />
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Pill size={24} />}
            title="No doses yet"
            description="Add a drug and its dose times to create the timeline."
            action={
              <Button variant="secondary" onClick={openAdd}>
                Add a drug
              </Button>
            }
            label="Dose timeline"
          />
        )}
      </section>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent title="Add a drug" description="New pending doses are created for the chosen days. Existing doses stay as they are.">
          <div className={styles.dialogBody}>
            <DateRangePicker label="Dose dates" value={addRange} onChange={setAddRange} weekStartsOn={1} />
            <DrugFields
              index={0}
              value={addDrug}
              onChange={setAddDrug}
              removable={false}
              disabled={addMedication.isPending}
            />
            {addError ? (
              <Alert tone="danger" title="Could not add this drug">
                {addError}
              </Alert>
            ) : null}
            <div className={styles.dialogActions}>
              <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={addMedication.isPending}>
                Cancel
              </Button>
              <Button loading={addMedication.isPending} onClick={() => void submitAdd()}>
                Add drug
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={removeDrug !== null} onOpenChange={(open) => (open ? null : setRemoveDrug(null))}>
        <DialogContent
          title={removeDrug ? `Remove ${removeDrug}?` : "Remove drug?"}
          description="Its pending doses are deleted. Doses already marked taken or missed are kept."
        >
          <div className={styles.dialogBody}>
            {actionError ? (
              <Alert tone="danger" title="Could not remove this drug">
                {actionError.message}
              </Alert>
            ) : null}
            <div className={styles.dialogActions}>
              <Button variant="secondary" onClick={() => setRemoveDrug(null)} disabled={removeMedication.isPending}>
                Keep drug
              </Button>
              <Button variant="danger" loading={removeMedication.isPending} onClick={() => void confirmRemove()}>
                Remove drug
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent title="Delete this schedule?" description="The schedule and all of its doses are removed. This cannot be undone.">
          <div className={styles.dialogBody}>
            {actionError ? (
              <Alert tone="danger" title="Could not delete this schedule">
                {actionError.message}
              </Alert>
            ) : null}
            <div className={styles.dialogActions}>
              <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleteSchedule.isPending}>
                Keep schedule
              </Button>
              <Button variant="danger" loading={deleteSchedule.isPending} onClick={() => void confirmDelete()}>
                Delete schedule
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatTimeParts(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
