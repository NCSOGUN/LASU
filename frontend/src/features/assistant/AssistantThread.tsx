"use client";

import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { ChatComposer, type ChatDraft } from "@/components/arc/chat-thread/chat-thread";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { Input } from "@/components/arc/input/input";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { Textarea } from "@/components/arc/textarea/textarea";
import { ApiError, toApiError } from "@/api/errors";
import { useDeleteSymptom, useSymptom, useSymptomFollowUp, useUpdateSymptom } from "@/api/hooks/symptom";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AssistantMessage } from "./AssistantMessage";
import { AssistantSafetyNote } from "./SafetyNote";
import { formatDateTime, normaliseSeverity, severityLabel, severityTone, type Severity } from "./format";
import styles from "./assistant.module.css";

const MAX_MESSAGE = 8000;

type Phase = "idle" | "pending" | "error" | "cancelled";

function retryable(error: ApiError) {
  return ["ai_unavailable", "ai_invalid_response", "upstream_timeout", "upstream_unavailable", "network", "invalid_response", "timeout"].includes(
    error.code,
  );
}

export function AssistantThread({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const detail = useSymptom(id);
  const followUp = useSymptomFollowUp(id);
  const update = useUpdateSymptom(id);
  const remove = useDeleteSymptom(id);

  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [severityDraft, setSeverityDraft] = useState<Severity | null>(null);
  const [status, setStatus] = useState("");
  const [editError, setEditError] = useState<ApiError | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [pendingMessage, setPendingMessage] = useState("");
  const [lastMessage, setLastMessage] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [tooLongDraft, setTooLongDraft] = useState<string | null>(null);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);

  const symptom = detail.data?.symptom;
  const messages = detail.data?.messages ?? [];
  const errorState = detail.error ? toApiError(detail.error) : null;
  const denied = errorState?.status === 403;
  const missing = errorState?.status === 404;
  const title = titleDraft ?? symptom?.name ?? "";
  const severity = severityDraft ?? normaliseSeverity(symptom?.severity) ?? "";

  async function saveTitle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTitleError(null);
    setEditError(null);
    const next = title.trim();
    if (!next || next.length > 200) {
      setTitleError(next ? "Keep the title to 200 characters or fewer." : "Enter a title.");
      return;
    }
    try {
      await update.mutateAsync({ name: next });
      setTitleDraft(null);
      setStatus("Title updated.");
    } catch (caught) {
      setEditError(toApiError(caught));
    }
  }

  function changeSeverity(next: string) {
    if (next === severity) return;
    const previous = severity;
    const parsed = normaliseSeverity(next);
    if (!parsed) return;
    setSeverityDraft(parsed);
    setEditError(null);
    update.mutate(
      { severity: parsed },
      {
        onSuccess: () => {
          setSeverityDraft(null);
          setStatus("Severity updated.");
        },
        onError: (caught) => {
          setSeverityDraft(previous || null);
          setEditError(toApiError(caught));
        },
      },
    );
  }

  async function submitFollowUp(message: string) {
    if (busy.current) return;
    const trimmed = message.trim();
    if (!trimmed || trimmed.length > MAX_MESSAGE) return;
    busy.current = true;
    setError(null);
    setPendingMessage(trimmed);
    setLastMessage(trimmed);
    setPhase("pending");

    const abort = new AbortController();
    controller.current = abort;
    try {
      await followUp.mutateAsync({ message: trimmed, files: [], signal: abort.signal });
      setPhase("idle");
      setPendingMessage("");
      setStatus("Reply received.");
    } catch (caught) {
      if (abort.signal.aborted) {
        setPhase("cancelled");
        setPendingMessage("");
        queryClient.invalidateQueries({ queryKey: ["symptom", id] });
        queryClient.invalidateQueries({ queryKey: ["symptoms"] });
      } else {
        const failure = toApiError(caught);
        // A timed-out follow-up may still have been saved: refresh the thread before the user retries.
        if (failure.code === "upstream_timeout") void queryClient.invalidateQueries({ queryKey: ["symptom", id] });
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
      setError(null);
      return;
    }
    void submitFollowUp(message);
  }

  async function confirmDelete() {
    setEditError(null);
    try {
      await remove.mutateAsync();
      router.push("/app/assistant");
    } catch (caught) {
      setEditError(toApiError(caught));
    }
  }

  if (detail.isLoading) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Conversation</h1>
        <div className={styles.skeletonWrap}>
          <Skeleton lines={6} label="Loading conversation" />
        </div>
      </div>
    );
  }

  if (errorState || !detail.data) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Conversation</h1>
        <Alert
          tone={denied || missing ? "warning" : "danger"}
          title={
            denied
              ? "This conversation is not available for this account"
              : missing
                ? "This item is not available"
                : "Could not load this conversation"
          }
        >
          {denied
            ? "A patient profile is required to open symptom conversations. Contact support if you think this is wrong."
            : missing
              ? "It may have been deleted, or it does not exist."
              : errorState?.message}
          {errorState?.requestId ? <span className={styles.requestId}>Request {errorState.requestId}</span> : null}
        </Alert>
        <div className={styles.stateActions}>
          <Link className={styles.hint} href="/app/assistant">
            Back to assistant
          </Link>
          {!denied && !missing && errorState ? (
            <Button variant="secondary" size="sm" onClick={() => void detail.refetch()}>
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const showSevere = normaliseSeverity(symptom?.severity) === "SEVERE";

  return (
    <div className={styles.page}>
      <div>
        <Link className={styles.hint} href="/app/assistant">
          Back to assistant
        </Link>
      </div>

      <header className={styles.threadHeader}>
        <div className={styles.threadTop}>
          <div className={styles.threadHeading}>
            <h1 className={styles.threadTitle}>{symptom?.name || "Untitled conversation"}</h1>
            <div className={styles.threadMeta}>
              <Badge tone={severityTone(symptom?.severity)} dot>
                {severityLabel(symptom?.severity)}
              </Badge>
              <span>Started {formatDateTime(symptom?.created_at ?? "")}</span>
            </div>
          </div>
          <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
            Delete conversation
          </Button>
        </div>

        <section className={styles.editGrid} aria-labelledby="conversation-details-title">
          <h2 id="conversation-details-title" className={styles.editLabel}>
            Conversation details
          </h2>
          <form className={styles.editRow} onSubmit={saveTitle} noValidate>
            <Input
              label="Conversation title"
              value={title}
              onChange={(event) => setTitleDraft(event.target.value)}
              maxLength={200}
              error={titleError ?? undefined}
              disabled={update.isPending}
            />
            <div className={styles.editActions}>
              <Button type="submit" variant="secondary" size="sm" loading={update.isPending} disabled={!title.trim()}>
                Save title
              </Button>
              <span className={styles.hint}>Rename how this conversation appears in your list.</span>
            </div>
          </form>

          <div className={styles.editRow}>
            <p className={styles.editLabel} id="severity-label">
              Severity
            </p>
            <SegmentedControl
              label="Severity"
              value={severity}
              onValueChange={changeSeverity}
              options={[
                { value: "MILD", label: "Mild" },
                { value: "MODERATE", label: "Moderate" },
                { value: "SEVERE", label: "Severe" },
              ]}
            />
            <span className={styles.hint}>Change this if the record no longer matches how you feel.</span>
          </div>

          {editError ? (
            <Alert tone="danger" title="Could not save this change">
              {editError.message}
              {editError.requestId ? <span className={styles.requestId}>Request {editError.requestId}</span> : null}
            </Alert>
          ) : null}

          <p className={styles.statusLine} role="status">
            {status}
          </p>
        </section>
      </header>

      {showSevere ? (
        <Alert tone="warning" title="Seek urgent care now">
          Severe symptoms can need emergency care. Call your local emergency number or go to the nearest emergency department
          now. Do not wait for an online reply.
        </Alert>
      ) : null}

      <section aria-labelledby="messages-title">
        <h2 id="messages-title" className={styles.listTitle}>
          Messages
        </h2>
        <ol className={styles.messageList} aria-label="Conversation messages">
          {messages.map((message, index) => (
            <li
              key={`${message.type}-${index}`}
              className={`${styles.message} ${message.type === "Human" ? styles.messageHuman : styles.messageAi}`}
            >
              <span className={styles.messageAuthor}>{message.type === "Human" ? "You" : "Assistant"}</span>
              {message.type === "AI" ? (
                <div className={styles.messageBubble}>
                  <AssistantMessage content={message.content} />
                </div>
              ) : (
                <div className={`${styles.messageBubble} ${styles.userBubble}`}>{message.content}</div>
              )}
            </li>
          ))}

          {phase === "pending" ? (
            <>
              <li className={`${styles.message} ${styles.messageHuman}`}>
                <span className={styles.messageAuthor}>You</span>
                <div className={`${styles.messageBubble} ${styles.userBubble}`}>{pendingMessage}</div>
                <Badge tone="neutral" dot>
                  Sending
                </Badge>
              </li>
              <li className={`${styles.message} ${styles.messageAi}`}>
                <span className={styles.messageAuthor}>Assistant</span>
                <p className={styles.placeholder}>
                  <span className={styles.dots} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  Thinking. This can take up to 3 minutes.
                </p>
              </li>
            </>
          ) : null}
        </ol>
      </section>

      <div className={styles.composer}>
        {error ? (
          <Alert
            tone="danger"
            title={
              error.code === "ai_unavailable"
                ? "The assistant is unavailable right now"
                : error.code === "upstream_timeout" || error.code === "timeout"
                  ? "This took too long"
                  : "Could not send the follow-up"
            }
          >
            {error.message}
            {error.requestId ? <span className={styles.requestId}>Request {error.requestId}</span> : null}
            {error.code === "upstream_timeout" || error.code === "timeout" ? (
              <span> The reply may still arrive. Reload this conversation before trying again.</span>
            ) : null}
          </Alert>
        ) : null}

        {error && retryable(error) ? (
          <div className={styles.stateActions}>
            <Button variant="secondary" size="sm" onClick={() => void submitFollowUp(lastMessage)}>
              Try again
            </Button>
          </div>
        ) : null}

        {phase === "cancelled" ? (
          <Alert tone="warning" title="Request cancelled">
            We stopped waiting for the reply. The record may still have been updated, and it was refreshed. Check the messages
            before sending again.
          </Alert>
        ) : null}

        {phase === "pending" ? (
          <div className={styles.formActions}>
            <Button type="button" variant="secondary" onClick={() => controller.current?.abort()}>
              Cancel
            </Button>
            <span className={styles.hint}>Cancelling does not remove a reply the server already saved.</span>
          </div>
        ) : tooLongDraft !== null ? (
          <div className={styles.form}>
            <Textarea
              label="Your follow-up"
              value={tooLongDraft}
              onChange={(event) => setTooLongDraft(event.target.value)}
              rows={5}
              maxLength={MAX_MESSAGE}
              description={`${tooLongDraft.length.toLocaleString()} of ${MAX_MESSAGE.toLocaleString()} characters`}
              error={tooLongDraft.length > MAX_MESSAGE ? "Keep the follow-up to 8,000 characters or fewer." : undefined}
            />
            <div className={styles.formActions}>
              <Button
                type="button"
                disabled={!tooLongDraft.trim() || tooLongDraft.length > MAX_MESSAGE}
                onClick={() => {
                  const next = tooLongDraft;
                  setTooLongDraft(null);
                  void submitFollowUp(next);
                }}
              >
                Try sending again
              </Button>
              <Button type="button" variant="ghost" onClick={() => setTooLongDraft(null)}>
                Discard draft
              </Button>
            </div>
          </div>
        ) : (
          <ChatComposer onSend={handleSend} placeholder="Ask a follow-up" allowAttachments={false} />
        )}

        <AssistantSafetyNote />
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent
          title="Delete this conversation?"
          description="This removes the conversation and its attachments. It cannot be undone."
        >
          <div className={styles.dialogBody}>
            {editError ? (
              <Alert tone="danger" title="Could not delete this conversation">
                {editError.message}
                {editError.requestId ? <span className={styles.requestId}>Request {editError.requestId}</span> : null}
              </Alert>
            ) : null}
            <div className={styles.dialogActions}>
              <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
                Keep conversation
              </Button>
              <Button variant="danger" loading={remove.isPending} onClick={() => void confirmDelete()}>
                Delete conversation
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
