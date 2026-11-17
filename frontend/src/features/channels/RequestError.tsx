import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { toApiError } from "@/api/errors";
import styles from "./channels.module.css";

export function RequestError({
  title,
  error,
  onRetry,
  mutation = false,
}: {
  title: string;
  error: unknown;
  onRetry?: () => void;
  /** A timed-out mutation may have succeeded, so retrying straight away is not offered. */
  mutation?: boolean;
}) {
  const apiError = toApiError(error);
  const denied = apiError.status === 403;
  const unknownOutcome = mutation && apiError.code === "upstream_timeout";

  return (
    <div className={styles.errorBlock}>
      <Alert tone="danger" title={denied ? "Access is not available" : title}>
        <span>{apiError.message}</span>
        {denied ? <span className={styles.requestId}>Contact support if your account should have this access.</span> : null}
        {apiError.requestId ? (
          <span className={styles.requestId}>Reference {apiError.requestId}</span>
        ) : null}
        {unknownOutcome ? (
          <span className={styles.requestId}>
            Re-open this page before trying again, because the change may already be saved.
          </span>
        ) : null}
      </Alert>
      {onRetry && !denied && !unknownOutcome ? (
        <div className={styles.errorActions}>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}
