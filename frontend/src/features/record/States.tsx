"use client";

import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { toApiError } from "@/api/errors";
import styles from "./record.module.css";

export function PageIntro({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className={styles.intro}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.subtitle}>{subtitle}</p>
    </header>
  );
}

export function RequestId({ id }: { id?: string }) {
  if (!id) return null;
  return <span className={styles.requestId}>Request ID {id}</span>;
}

/** A denied read has no retry: the account needs a role or profile, and support is the next step. */
export function DeniedAlert({ error }: { error: unknown }) {
  const apiError = toApiError(error);
  return (
    <Alert tone="danger" title="You cannot open this right now">
      {apiError.message} Contact support if you believe this is wrong.
      <RequestId id={apiError.requestId} />
    </Alert>
  );
}

export function LoadError({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
}) {
  const apiError = toApiError(error);
  if (apiError.denied) return <DeniedAlert error={error} />;
  return (
    <Alert tone="danger" title={title}>
      <span>
        {apiError.message}
        <span className={styles.actions}>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </span>
        <RequestId id={apiError.requestId} />
      </span>
    </Alert>
  );
}

export function StatusLine({ children }: { children: string | null }) {
  if (!children) return null;
  return (
    <p className={styles.status} role="status">
      {children}
    </p>
  );
}

export function FormError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const apiError = toApiError(error);
  if (apiError.denied) return <DeniedAlert error={error} />;
  return (
    <Alert tone="danger" title="Could not save your changes">
      <span>
        {apiError.message}
        {onRetry ? (
          <span className={styles.actions}>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </span>
        ) : null}
        <RequestId id={apiError.requestId} />
      </span>
    </Alert>
  );
}
