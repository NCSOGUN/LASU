"use client";

import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { ChatComposer, type ChatDraft } from "@/components/arc/chat-thread/chat-thread";
import { FileDropzone } from "@/components/arc/file-dropzone/file-dropzone";
import { Switch } from "@/components/arc/switch/switch";
import { Textarea } from "@/components/arc/textarea/textarea";
import { useCreateSymptom } from "@/api/hooks/symptom";
import { ApiError, toApiError } from "@/api/errors";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AssistantSafetyNote } from "./SafetyNote";
import styles from "./assistant.module.css";

const MAX_MESSAGE = 8000;
const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/*,application/pdf";

interface Attempt {
  message: string;
  files: File[];
  includeRecords: boolean;
  modifyHistory: boolean;
}

export function validateFiles(files: File[]) {
  if (files.length > MAX_FILES) return `Choose up to ${MAX_FILES} files.`;
  for (const file of files) {
    if (file.type !== "application/pdf" && !file.type.startsWith("image/")) {
      return `${file.name} is not an image or PDF.`;
    }
    if (file.size > MAX_FILE_BYTES) {
      return `${file.name} is larger than 10 MB.`;
    }
  }
  return null;
}

function retryable(error: ApiError) {
  return ["ai_unavailable", "ai_invalid_response", "upstream_timeout", "upstream_unavailable", "network", "invalid_response", "timeout"].includes(
    error.code,
  );
}

export function NewConversation({
  onCreated,
  onCancelled,
}: {
  onCreated: (id: string) => void;
  onCancelled: () => void;
}) {
  const create = useCreateSymptom();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [includeRecords, setIncludeRecords] = useState(false);
  const [modifyHistory, setModifyHistory] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<"idle" | "pending" | "error" | "cancelled">("idle");
  const [shortError, setShortError] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [tooLongDraft, setTooLongDraft] = useState<string | null>(null);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);

  async function submit(next: Attempt) {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setShortError(null);
    setAttempt(next);
    setPhase("pending");

    const abort = new AbortController();
    controller.current = abort;
    try {
      const data = await create.mutateAsync({ ...next, signal: abort.signal });
      onCreated(data.symptom.id);
    } catch (caught) {
      if (abort.signal.aborted) {
        setPhase("cancelled");
        queryClient.invalidateQueries({ queryKey: ["symptoms"] });
        onCancelled();
      } else {
        const failure = toApiError(caught);
        // The outcome of a timed-out create is unknown: refresh the list before the user retries.
        if (failure.code === "upstream_timeout") void queryClient.invalidateQueries({ queryKey: ["symptoms"] });
        setError(failure);
        setPhase("error");
      }
    } finally {
      busy.current = false;
      controller.current = null;
    }
  }

  function handleSend(draft: ChatDraft) {
    if (busy.current) return;
    const message = draft.text.trim();
    if (message.length > MAX_MESSAGE) {
      setTooLongDraft(draft.text);
      setShortError(`Keep your message to ${MAX_MESSAGE.toLocaleString()} characters or fewer. Your draft is saved below.`);
      return;
    }
    const fileError = validateFiles(draft.files.length ? draft.files : files);
    if (fileError) {
      setShortError(fileError);
      return;
    }
    void submit({
      message,
      files: draft.files.length ? draft.files : files,
      includeRecords,
      modifyHistory,
    });
  }

  function cancel() {
    controller.current?.abort();
  }

  function reset() {
    setPhase("idle");
    setError(null);
    setShortError(null);
    setAttempt(null);
  }

  function retry() {
    if (attempt) void submit(attempt);
  }

  function resendLongDraft() {
    if (tooLongDraft === null) return;
    const message = tooLongDraft.trim();
    if (!message || message.length > MAX_MESSAGE) return;
    setTooLongDraft(null);
    void submit({ message, files, includeRecords, modifyHistory });
  }

  const denied = error?.status === 403 || error?.code === "patient_profile_required";

  return (
    <section className={styles.panel} aria-labelledby="new-conversation-title">
      <div className={styles.panelHeader}>
        <h2 id="new-conversation-title" className={styles.panelTitle}>
          New conversation
        </h2>
        <p className={styles.panelText}>
          Describe what you are feeling. You can add an image or a PDF. The assistant replies with general information, not a
          diagnosis.
        </p>
      </div>

      {shortError ? (
        <Alert tone="danger" title="Check your message">
          {shortError}
        </Alert>
      ) : null}

      {phase === "cancelled" ? (
        <Alert tone="warning" title="Request cancelled">
          We stopped waiting for the reply. The record may still have been created, and the list was refreshed. Check it before
          starting again.
          <span className={styles.stateActions}>
            <Button type="button" variant="secondary" size="sm" onClick={reset}>
              Start again
            </Button>
          </span>
        </Alert>
      ) : null}

      {error ? (
        <Alert
          tone="danger"
          title={
            denied
              ? "The assistant needs a patient profile"
              : error.code === "ai_unavailable"
                ? "The assistant is unavailable right now"
                : error.code === "upstream_timeout" || error.code === "timeout"
                  ? "This took too long"
                  : "Could not start the conversation"
          }
        >
          {denied
            ? "A patient profile is required. Contact support if you think this is wrong."
            : error.message}
          {error.requestId ? <span className={styles.requestId}>Request {error.requestId}</span> : null}
          {error.code === "upstream_timeout" || error.code === "timeout" ? (
            <span> The record may still have been created. Check the list before trying again.</span>
          ) : null}
          {!denied && retryable(error) ? (
            <span className={styles.stateActions}>
              <Button type="button" variant="secondary" size="sm" onClick={retry}>
                Try again
              </Button>
            </span>
          ) : null}
        </Alert>
      ) : null}

      {phase === "pending" ? (
        <div className={styles.pending} aria-live="polite">
          <div className={styles.pendingHead}>
            <Badge tone="neutral" dot>
              Sending
            </Badge>
            <span className={styles.hint}>Your message is on this device only until it is sent.</span>
          </div>
          <p className={styles.pendingUser}>{attempt?.message}</p>
          <p className={styles.placeholder}>
            <span className={styles.dots} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            Thinking. This can take up to 3 minutes.
          </p>
          <div className={styles.formActions}>
            <Button type="button" variant="secondary" onClick={cancel}>
              Cancel
            </Button>
            <span className={styles.hint}>Cancelling does not delete a record the server already created.</span>
          </div>
        </div>
      ) : tooLongDraft !== null ? (
        <div className={styles.form}>
          <Textarea
            label="Your message"
            value={tooLongDraft}
            onChange={(event) => setTooLongDraft(event.target.value)}
            rows={6}
            maxLength={MAX_MESSAGE}
            description={`${tooLongDraft.length.toLocaleString()} of ${MAX_MESSAGE.toLocaleString()} characters`}
          />
          <div className={styles.formActions}>
            <Button
              type="button"
              onClick={resendLongDraft}
              disabled={!tooLongDraft.trim() || tooLongDraft.length > MAX_MESSAGE}
            >
              Try sending again
            </Button>
            <Button type="button" variant="ghost" onClick={() => setTooLongDraft(null)}>
              Discard draft
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.form}>
          <ChatComposer
            onSend={handleSend}
            placeholder="Describe how you feel"
            allowAttachments={false}
          />

          <div className={styles.toggles}>
            <div className={styles.toggle}>
              <div className={styles.toggleCopy}>
                <p className={styles.toggleTitle} id="include-records-label">
                  Use my health record for context
                </p>
                <p className={styles.toggleHint} id="include-records-hint">
                  Off by default. When on, the assistant asks the API to use your stored record fields. Codes are never sent.
                </p>
              </div>
              <Switch
                checked={includeRecords}
                onCheckedChange={setIncludeRecords}
                aria-labelledby="include-records-label"
                aria-describedby="include-records-hint"
              />
            </div>
            <div className={styles.toggle}>
              <div className={styles.toggleCopy}>
                <p className={styles.toggleTitle} id="modify-history-label">
                  Let the assistant update this record&apos;s title and severity
                </p>
                <p className={styles.toggleHint} id="modify-history-hint">
                  On by default. The assistant may rename the conversation and change its severity after reading your message.
                </p>
              </div>
              <Switch
                checked={modifyHistory}
                onCheckedChange={setModifyHistory}
                aria-labelledby="modify-history-label"
                aria-describedby="modify-history-hint"
              />
            </div>
          </div>

          <FileDropzone
            label="Add images or a PDF"
            description="Drag files here or choose from your device"
            accept={ACCEPT}
            maxFiles={MAX_FILES}
            maxSize={MAX_FILE_BYTES}
            note="Up to 5 files. Images or PDF, 10 MB each."
            onFilesChange={setFiles}
          />

          <div className={styles.formActions}>
            <span className={styles.hint}>
              {files.length ? `${files.length} of ${MAX_FILES} files attached.` : "No files attached."} Press Enter or the send
              button to start.
            </span>
          </div>
        </div>
      )}

      <AssistantSafetyNote />

      <div className={styles.formActions}>
        <Button type="button" variant="ghost" size="sm" onClick={() => router.push("/app/medications")}>
          View medication schedules
        </Button>
      </div>
    </section>
  );
}
