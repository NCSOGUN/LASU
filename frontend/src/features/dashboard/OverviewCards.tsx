"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { MetricCard } from "@/components/arc/metric-card/metric-card";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { formatDate, formatTime } from "@/lib/format";
import type { SymptomRecord } from "@/api/schemas";
import styles from "./overview-cards.module.css";

export type RegionState = "loading" | "error" | "empty" | "ready";

interface SurfaceProps {
  title: string;
  action?: { href: string; label: string };
  state: RegionState;
  error?: string;
  requestId?: string;
  onRetry?: () => void;
  empty?: ReactNode;
  children: ReactNode;
}

function Surface({ title, action, state, error, requestId, onRetry, empty, children }: SurfaceProps) {
  return (
    <section className={styles.surface} aria-labelledby={`card-${title.replace(/\s+/g, "-").toLowerCase()}`} aria-busy={state === "loading"}>
      <div className={styles.head}>
        <h2 className={styles.title} id={`card-${title.replace(/\s+/g, "-").toLowerCase()}`}>
          {title}
        </h2>
        {action ? (
          <Link className={styles.action} href={action.href}>
            {action.label}
          </Link>
        ) : null}
      </div>

      {state === "loading" ? <Skeleton lines={4} label={`Loading ${title.toLowerCase()}`} /> : null}

      {state === "error" ? (
        <Alert tone="danger" title={`Could not load ${title.toLowerCase()}`}>
          <span className={styles.errorCopy}>
            {error}
            {requestId ? <span className={styles.requestId}>Request {requestId}</span> : null}
          </span>
          {onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry} className={styles.retry}>
              Try again
            </Button>
          ) : null}
        </Alert>
      ) : null}

      {state === "empty" ? empty : null}
      {state === "ready" ? children : null}
    </section>
  );
}

export function CompletenessCard({ state, filled, total, onRetry, error, requestId }: { state: RegionState; filled: number; total: number; onRetry?: () => void; error?: string; requestId?: string }) {
  return (
    <Surface title="Profile completeness" state={state} onRetry={onRetry} error={error} requestId={requestId} action={{ href: "/app/record", label: "Edit record" }}>
      <MetricCard label="Fields with a value" value={filled} suffix={` of ${total}`} context="Shareable record fields" />
    </Surface>
  );
}

export function EmergencyCard({ state, available, count, onRetry, error, requestId }: { state: RegionState; available: boolean; count: number; onRetry?: () => void; error?: string; requestId?: string }) {
  return (
    <Surface title="Emergency summary" state={state} onRetry={onRetry} error={error} requestId={requestId} action={{ href: "/app/emergency-summary", label: "Choose fields" }}>
      <div className={styles.statusRow}>
        <Badge tone={available ? "success" : "neutral"} dot>
          {available ? "Available by code" : "Not set up"}
        </Badge>
        <p className={styles.value}>{count}</p>
      </div>
      <p className={styles.copy}>{available ? `${count} fields are revealed to a valid patient code.` : "No fields are shared in an emergency lookup yet."}</p>
    </Surface>
  );
}

export function GrantsCard({ state, count, onRetry, error, requestId }: { state: RegionState; count: number; onRetry?: () => void; error?: string; requestId?: string }) {
  return (
    <Surface title="Active access codes" state={state} onRetry={onRetry} error={error} requestId={requestId} action={{ href: "/app/access", label: "Manage access" }}>
      <MetricCard label="Codes still valid" value={count} context="Expired and revoked codes are excluded" />
    </Surface>
  );
}

function severityTone(severity: string | null | undefined) {
  if (severity === "SEVERE") return "danger" as const;
  if (severity === "MODERATE") return "warning" as const;
  if (severity === "MILD") return "success" as const;
  return "neutral" as const;
}

export function SymptomsCard({ state, records, onRetry, error, requestId }: { state: RegionState; records: SymptomRecord[]; onRetry?: () => void; error?: string; requestId?: string }) {
  return (
    <Surface
      title="Recent conversations"
      state={state}
      onRetry={onRetry}
      error={error}
      requestId={requestId}
      action={{ href: "/app/assistant", label: "Open assistant" }}
      empty={
        <EmptyState
          title="No conversations yet"
          description="Describe how you feel to start a private symptom record."
          action={
            <Link className={styles.emptyAction} href="/app/assistant">
              Start a conversation
            </Link>
          }
        />
      }
    >
      <ul className={styles.list}>
        {records.map((record) => (
          <li key={record.id} className={styles.row}>
            <div className={styles.rowMain}>
              <Link className={styles.rowTitle} href={`/app/assistant/${record.id}`}>
                {record.name ?? "Symptom conversation"}
              </Link>
              <p className={styles.rowMeta}>{formatDate(record.created_at)}</p>
            </div>
            <Badge tone={severityTone(record.severity)}>{record.severity ?? "Unknown"}</Badge>
          </li>
        ))}
      </ul>
    </Surface>
  );
}

export function DosesCard({
  state,
  moments,
  onMark,
  pendingId,
  onRetry,
  error,
  requestId,
}: {
  state: RegionState;
  moments: Array<{ id: string; drug: string; dose?: string | null; time: string }>;
  onMark: (momentId: string, status: "TAKEN" | "MISSED") => void;
  pendingId?: string | null;
  onRetry?: () => void;
  error?: string;
  requestId?: string;
}) {
  return (
    <Surface
      title="Today's doses"
      state={state}
      onRetry={onRetry}
      error={error}
      requestId={requestId}
      action={{ href: "/app/medications", label: "All schedules" }}
      empty={
        <EmptyState
          title="No doses today"
          description="Create a medication schedule to see today's doses here."
          action={
            <Link className={styles.emptyAction} href="/app/medications">
              Create a schedule
            </Link>
          }
        />
      }
    >
      <ul className={styles.list}>
        {moments.map((moment) => {
          const pending = pendingId === moment.id;
          return (
            <li key={moment.id} className={styles.row}>
              <div className={styles.rowMain}>
                <p className={styles.doseTime}>{formatTime(moment.time)}</p>
                <p className={styles.rowMeta}>
                  {moment.drug}
                  {moment.dose ? ` · ${moment.dose}` : ""}
                </p>
              </div>
              <div className={styles.doseActions}>
                <Button variant="secondary" size="sm" loading={pending} onClick={() => onMark(moment.id, "TAKEN")}>
                  Taken
                </Button>
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => onMark(moment.id, "MISSED")}>
                  Missed
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Surface>
  );
}

export function OverviewGrid({ children }: { children: ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}
