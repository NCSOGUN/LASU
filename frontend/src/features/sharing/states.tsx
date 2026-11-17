"use client";

import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { toApiError } from "@/api/errors";
import styles from "./sharing.module.css";

export function isDenied(error: unknown): boolean {
  const apiError = toApiError(error);
  return (
    apiError.status === 403 ||
    apiError.code === "forbidden" ||
    apiError.code === "patient_profile_required" ||
    apiError.code === "account_inactive"
  );
}

export function isNotFound(error: unknown): boolean {
  return toApiError(error).status === 404 || toApiError(error).code === "not_found";
}

export function ErrorNotice({
  title,
  error,
  onRetry,
  retrying,
}: {
  title: string;
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const apiError = toApiError(error);
  return (
    <div className={styles.errorBlock}>
      <Alert tone="danger" title={title}>
        {apiError.message}
      </Alert>
      {apiError.requestId ? <p className={styles.requestId}>Request {apiError.requestId}</p> : null}
      {onRetry && !isNotFound(error) ? (
        <Button variant="secondary" size="sm" loading={retrying} onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function DeniedNotice({ title, error }: { title: string; error?: unknown }) {
  const apiError = error ? toApiError(error) : null;
  const detail =
    apiError?.code === "patient_profile_required"
      ? "A patient profile is needed for this. Contact support if you think this is wrong."
      : apiError?.code === "account_inactive"
        ? "This account is not active. Contact support if you need help."
        : "You do not have access to this. Contact support if you think this is wrong.";
  return (
    <div className={styles.errorBlock}>
      <Alert tone="warning" title={title}>
        {detail}
      </Alert>
    </div>
  );
}
