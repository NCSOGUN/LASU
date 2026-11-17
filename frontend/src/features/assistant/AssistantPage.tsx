"use client";

import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Pagination } from "@/components/arc/pagination/pagination";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { useSymptoms } from "@/api/hooks/symptom";
import { toApiError } from "@/api/errors";
import { useQueryClient } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NewConversation } from "./NewConversation";
import { formatDateTime, severityLabel, severityTone } from "./format";
import styles from "./assistant.module.css";

export function AssistantPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const symptoms = useSymptoms(page);
  const error = symptoms.error ? toApiError(symptoms.error) : null;
  const denied = error?.status === 403 || error?.code === "patient_profile_required";

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1 className={styles.title}>Assistant</h1>
        <p className={styles.subtitle}>
          Describe a symptom and get general guidance on what to do next. Every conversation is saved so you can follow up
          later.
        </p>
      </header>

      <NewConversation
        onCreated={(id) => router.push(`/app/assistant/${id}`)}
        onCancelled={() => {
          void queryClient.invalidateQueries({ queryKey: ["symptoms"] });
        }}
      />

      <section className={styles.listSection} aria-labelledby="conversations-title">
        <div className={styles.listHeader}>
          <h2 id="conversations-title" className={styles.listTitle}>
            Conversations
          </h2>
          {symptoms.data && !symptoms.isLoading ? (
            <p className={styles.listCount}>
              {symptoms.data.total} {symptoms.data.total === 1 ? "conversation" : "conversations"}
            </p>
          ) : null}
        </div>

        {symptoms.isLoading ? (
          <div className={styles.skeletonWrap}>
            <Skeleton lines={5} label="Loading conversations" />
          </div>
        ) : error ? (
          <Alert
            tone={denied ? "warning" : "danger"}
            title={denied ? "The assistant is not available for this account" : "Could not load conversations"}
          >
            {denied
              ? "A patient profile is required. Contact support if you think this is wrong."
              : error.message}
            {error.requestId ? <span className={styles.requestId}>Request {error.requestId}</span> : null}
          </Alert>
        ) : symptoms.data && symptoms.data.symptoms.length === 0 ? (
          <EmptyState
            icon={<MessageSquare size={24} />}
            title="No conversations yet"
            description="Start one above with a short description of how you feel."
            action={
              <Button
                variant="secondary"
                onClick={() => document.getElementById("new-conversation-title")?.scrollIntoView({ behavior: "smooth" })}
              >
                Start a conversation
              </Button>
            }
            label="Conversations"
          />
        ) : symptoms.data ? (
          <>
            <ul className={styles.list}>
              {symptoms.data.symptoms.map((symptom) => (
                <li key={symptom.id}>
                  <Link className={styles.rowLink} href={`/app/assistant/${symptom.id}`}>
                    <span className={styles.rowTop}>
                      <span className={styles.rowTitle}>{symptom.name || "Untitled conversation"}</span>
                      <Badge tone={severityTone(symptom.severity)} dot>
                        {severityLabel(symptom.severity)}
                      </Badge>
                    </span>
                    <span className={styles.rowSummary}>{symptom.summary || "No summary yet."}</span>
                    <span className={styles.rowDate}>{formatDateTime(symptom.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {symptoms.data.totalPages > 1 ? (
              <Pagination page={page} pageCount={symptoms.data.totalPages} onPageChange={setPage} label="Conversation pages" />
            ) : null}
          </>
        ) : null}

        {error && !denied ? (
          <div className={styles.stateActions}>
            <Button variant="secondary" size="sm" onClick={() => void symptoms.refetch()}>
              Try again
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
