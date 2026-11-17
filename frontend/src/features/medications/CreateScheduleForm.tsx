"use client";

import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { DateRangePicker, type DateRange } from "@/components/arc/date-range-picker/date-range-picker";
import { FileDropzone } from "@/components/arc/file-dropzone/file-dropzone";
import { Input } from "@/components/arc/input/input";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { Stepper } from "@/components/arc/stepper/stepper";
import { Textarea } from "@/components/arc/textarea/textarea";
import { useCreateSchedule } from "@/api/hooks/medications";
import { ApiError, toApiError } from "@/api/errors";
import { scheduleCreateBodySchema } from "@/api/schemas";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { markAiCreated } from "./ai-created";
import { DrugFields, emptyDrug, toMedicationEntry, type DrugDraft } from "./DrugFields";
import { toIsoDate } from "./format";
import styles from "./medications.module.css";

const MAX_DOCUMENT = 10 * 1024 * 1024;

function retryable(error: ApiError) {
  return ["ai_unavailable", "ai_invalid_response", "upstream_timeout", "upstream_unavailable", "network", "invalid_response", "timeout"].includes(
    error.code,
  );
}

export function CreateScheduleForm() {
  const create = useCreateSchedule();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<"manual" | "ai">("manual");
  const [range, setRange] = useState<DateRange | null>(null);
  const [title, setTitle] = useState("");
  const [drugs, setDrugs] = useState<DrugDraft[]>([emptyDrug()]);
  const [text, setText] = useState("");
  const [documents, setDocuments] = useState<File[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [phase, setPhase] = useState<"idle" | "pending" | "cancelled">("idle");
  const [pendingSummary, setPendingSummary] = useState("");
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);

  const steps = [
    { id: "method", label: "Method", description: "Manual or from text" },
    { id: "dates", label: "Dates", description: "Start and end day" },
    {
      id: "details",
      label: "Details",
      description: method === "manual" ? "Drugs and dose times" : "Text or one document",
    },
  ];

  function checkRange() {
    if (!range) {
      setFormError("Choose the first and last day of this schedule.");
      return null;
    }
    const startDate = toIsoDate(range.start);
    const endDate = toIsoDate(range.end);
    if (endDate < startDate) {
      setFormError("The end date must not be before the start date.");
      return null;
    }
    return { startDate, endDate };
  }

  async function submitManual() {
    if (busy.current) return;
    const dates = checkRange();
    if (!dates) return;
    const entries = [];
    for (const drug of drugs) {
      const entry = toMedicationEntry(drug);
      if (!entry) {
        setFormError("Each drug needs a name and at least one dose time.");
        return;
      }
      entries.push(entry);
    }
    const parsed = scheduleCreateBodySchema.safeParse({
      ...(title.trim() ? { title: title.trim() } : {}),
      startDate: dates.startDate,
      endDate: dates.endDate,
      medications: entries,
    });
    if (!parsed.success) {
      setFormError("Check the drugs, doses and times.");
      return;
    }

    if (busy.current) return;
    busy.current = true;
    setFormError(null);
    setApiError(null);
    try {
      const data = await create.mutateAsync({ mode: "manual", body: parsed.data });
      router.push(`/app/medications/${data.schedule.id}`);
    } catch (caught) {
      setApiError(toApiError(caught));
    } finally {
      busy.current = false;
    }
  }

  async function submitAi() {
    if (busy.current) return;
    const dates = checkRange();
    if (!dates) return;
    const document = documents[0] ?? null;
    if (document && text.trim()) {
      setFormError("Use the text or one document, not both.");
      return;
    }
    if (!document && !text.trim()) {
      setFormError("Add medication instructions or choose one document.");
      return;
    }
    if (document && document.size > MAX_DOCUMENT) {
      setFormError(`${document.name} is larger than 10 MB.`);
      return;
    }

    busy.current = true;
    setFormError(null);
    setApiError(null);
    setPendingSummary(text.trim() || document?.name || "Your document");
    setPhase("pending");
    const abort = new AbortController();
    controller.current = abort;
    try {
      const data = await create.mutateAsync({
        mode: "ai",
        startDate: dates.startDate,
        endDate: dates.endDate,
        text,
        document,
        signal: abort.signal,
      });
      markAiCreated(data.schedule.id);
      router.push(`/app/medications/${data.schedule.id}`);
    } catch (caught) {
      if (abort.signal.aborted) {
        setPhase("cancelled");
        queryClient.invalidateQueries({ queryKey: ["medications"] });
      } else {
        const failure = toApiError(caught);
        // A timed-out AI create may still have produced a schedule: refresh the list before the user retries.
        if (failure.code === "upstream_timeout") void queryClient.invalidateQueries({ queryKey: ["medications"] });
        setApiError(failure);
        setPhase("idle");
      }
    } finally {
      busy.current = false;
      controller.current = null;
    }
  }

  function next() {
    setFormError(null);
    if (step === 0) {
      setStep(1);
      return;
    }
    if (step === 1 && !checkRange()) return;
    setStep(2);
  }

  function back() {
    setFormError(null);
    setStep((current) => Math.max(0, current - 1));
  }

  const pending = phase === "pending";

  return (
    <section className={styles.panel} aria-labelledby="new-schedule-title">
      <div className={styles.panelHeader}>
        <h2 id="new-schedule-title" className={styles.panelTitle}>
          New schedule
        </h2>
        <p className={styles.panelText}>
          Enter a schedule yourself, or describe it and let the assistant draft the drugs, doses and times for you to check.
        </p>
      </div>

      <Stepper
        steps={steps}
        current={step}
        onStepSelect={(index) => {
          if (index <= step) setStep(index);
        }}
        label="Schedule steps"
      />

      {formError ? (
        <Alert tone="danger" title="Check this schedule">
          {formError}
        </Alert>
      ) : null}

      {apiError ? (
        <Alert
          tone="danger"
          title={
            apiError.code === "ai_unavailable"
              ? "The assistant is unavailable right now"
              : apiError.code === "upstream_timeout" || apiError.code === "timeout"
                ? "This took too long"
                : "Could not create this schedule"
          }
        >
          {apiError.message}
          {apiError.requestId ? <span className={styles.requestId}>Request {apiError.requestId}</span> : null}
          {apiError.code === "upstream_timeout" || apiError.code === "timeout" ? (
            <span> The schedule may still have been created. Check the list before trying again.</span>
          ) : null}
        </Alert>
      ) : null}

      {apiError && retryable(apiError) ? (
        <div className={styles.stepActions}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              if (method === "manual") void submitManual();
              else void submitAi();
            }}
          >
            Try again
          </Button>
        </div>
      ) : null}

      {phase === "cancelled" ? (
        <Alert tone="warning" title="Request cancelled">
          We stopped waiting for the draft. The schedule may still have been created, and the list was refreshed. Check it before
          starting again.
          <span className={styles.stateActions}>
            <Button type="button" variant="secondary" size="sm" onClick={() => setPhase("idle")}>
              Start again
            </Button>
          </span>
        </Alert>
      ) : null}

      {pending ? (
        <div className={styles.pending} aria-live="polite">
          <p className={styles.hint}>Sending your instructions. They stay on this device until the request finishes.</p>
          <p className={styles.pendingText}>{pendingSummary}</p>
          <p className={styles.placeholder}>
            <span className={styles.dots} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            Thinking. This can take up to 3 minutes.
          </p>
          <div className={styles.stepActions}>
            <Button type="button" variant="secondary" onClick={() => controller.current?.abort()}>
              Cancel
            </Button>
            <span className={styles.hint}>Cancelling does not delete a schedule the server already created.</span>
          </div>
        </div>
      ) : (
        <div className={styles.form}>
          {step === 0 ? (
            <div className={styles.options}>
              <SegmentedControl
                label="How do you want to create this schedule?"
                value={method}
                onValueChange={(value) => {
                  setMethod(value === "ai" ? "ai" : "manual");
                  setFormError(null);
                }}
                options={[
                  { value: "manual", label: "Manual" },
                  { value: "ai", label: "From text or document" },
                ]}
              />
              <div className={styles.option}>
                <p className={styles.optionTitle}>Manual</p>
                <p className={styles.optionText}>
                  Choose the dates, then enter each drug, dose, frequency and dose time. The schedule is created immediately.
                </p>
              </div>
              <div className={styles.option}>
                <p className={styles.optionTitle}>From text or document</p>
                <p className={styles.optionText}>
                  Describe the plan or add one document. The assistant drafts the schedule and you check every drug, dose and
                  time before relying on it. This can take up to 3 minutes.
                </p>
              </div>
            </div>
          ) : step === 1 ? (
            <div className={styles.form}>
              <DateRangePicker label="Schedule dates" value={range} onChange={setRange} weekStartsOn={1} />
              <p className={styles.hint}>Both days are included. A dose at 08:00 is shown in your local time.</p>
            </div>
          ) : (
            <div className={styles.form}>
              <Input
                label="Schedule title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Headache relief plan"
                maxLength={200}
              />

              {method === "manual" ? (
                <div className={styles.drugs}>
                  {drugs.map((drug, index) => (
                    <DrugFields
                      key={index}
                      index={index}
                      value={drug}
                      onChange={(next) => setDrugs((current) => current.map((entry, at) => (at === index ? next : entry)))}
                      onRemove={() => setDrugs((current) => current.filter((_, at) => at !== index))}
                      removable={drugs.length > 1}
                    />
                  ))}
                  <div>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setDrugs((current) => [...current, emptyDrug()])}>
                      Add another drug
                    </Button>
                  </div>
                </div>
              ) : (
                <div className={styles.form}>
                  <Textarea
                    label="Medication instructions"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Amoxicillin 500 mg three times daily for four days"
                    description="Write the plan in your own words, or leave this empty and add one document."
                    rows={4}
                  />
                  <FileDropzone
                    label="Add one document"
                    description="Drag a file here or choose from your device"
                    multiple={false}
                    maxFiles={1}
                    maxSize={MAX_DOCUMENT}
                    note="One document, up to 10 MB. Use either the text or a document."
                    onFilesChange={setDocuments}
                  />
                </div>
              )}
            </div>
          )}

          <div className={styles.stepActions}>
            {step > 0 ? (
              <Button type="button" variant="secondary" onClick={back}>
                Back
              </Button>
            ) : null}
            {step < 2 ? (
              <Button type="button" className={styles.stepActionsEnd} onClick={next}>
                Continue
              </Button>
            ) : (
              <Button
                type="button"
                className={styles.stepActionsEnd}
                loading={create.isPending}
                onClick={() => (method === "manual" ? void submitManual() : void submitAi())}
              >
                {method === "manual" ? "Create schedule" : "Create from text or document"}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
