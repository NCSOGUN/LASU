"use client";

import { useState } from "react";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogClose, DialogContent } from "@/components/arc/dialog/dialog";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { KeyRound } from "lucide-react";
import { useGrants, useRevokeGrant } from "@/api/hooks/sharing";
import type { FieldsResponse, Grant } from "@/api/schemas";
import { channelLabel, formatLocalDateTime, grantStatusLabel, grantStatusTone, humaniseKey } from "./labels";
import { DeniedNotice, ErrorNotice, isDenied } from "./states";
import { useLocalTimeZone } from "./time";
import styles from "./sharing.module.css";

export function GrantList({
  fields,
  onCreateAction,
}: {
  fields?: FieldsResponse;
  onCreateAction: () => void;
}) {
  const grants = useGrants();
  const revoke = useRevokeGrant();
  const timeZone = useLocalTimeZone();
  const [target, setTarget] = useState<Grant | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  function fieldLabels(keys: string[]) {
    return keys.map((key) => fields?.fields.find((field) => field.key === key)?.label ?? humaniseKey(key)).join(", ");
  }

  async function confirmRevoke() {
    if (!target || revoke.isPending) return;
    try {
      await revoke.mutateAsync(target.id);
      setStatus("Access revoked. The person can no longer open this record.");
      setTarget(null);
    } catch {
      // The error stays in the dialog so the person can retry without losing context.
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="grant-list-title">
      <div className={styles.panelHead}>
        <div className={styles.panelIntro}>
          <h2 id="grant-list-title" className={styles.panelTitle}>
            Access codes
          </h2>
          <p className={styles.panelCopy}>Every code you created, newest first. Codes are never shown in this list.</p>
        </div>
      </div>

      {status ? (
        <p className={styles.status} role="status">
          {status}
        </p>
      ) : null}

      {grants.isLoading ? <Skeleton lines={4} label="Loading access codes" /> : null}

      {grants.error && !isDenied(grants.error) ? (
        <ErrorNotice
          title="Could not load your access codes"
          error={grants.error}
          onRetry={() => void grants.refetch()}
          retrying={grants.isFetching}
        />
      ) : null}

      {grants.error && isDenied(grants.error) ? (
        <DeniedNotice title="Access codes are not available" error={grants.error} />
      ) : null}

      {grants.data && grants.data.length === 0 ? (
        <EmptyState
          icon={<KeyRound width={24} height={24} strokeWidth={1.5} />}
          title="No access codes yet"
          description="Create a code to share chosen fields for a short time."
          action={
            <Button variant="secondary" onClick={onCreateAction}>
              Create an access code
            </Button>
          }
        />
      ) : null}

      {grants.data && grants.data.length > 0 ? (
        <ul className={styles.grantList}>
          {grants.data.map((grant) => (
            <li key={grant.id} className={styles.grantItem}>
              <div className={styles.grantHead}>
                <Badge tone={grantStatusTone(grant.status)} dot={grant.status === "active"}>
                  {grantStatusLabel(grant.status)}
                </Badge>
                <span className={styles.grantExpiry}>
                  Expires {formatLocalDateTime(grant.expires_at, timeZone)}
                </span>
              </div>
              <dl className={styles.grantMeta}>
                <div>
                  <dt>Fields</dt>
                  <dd>{fieldLabels(grant.field_keys)}</dd>
                </div>
                <div>
                  <dt>Channels</dt>
                  <dd>{grant.channels.map(channelLabel).join(", ")}</dd>
                </div>
              </dl>
              {grant.revoked_at ? (
                <p className={styles.meta}>Revoked {formatLocalDateTime(grant.revoked_at, timeZone)}</p>
              ) : null}
              {grant.status === "active" ? (
                <div className={styles.actions}>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      revoke.reset();
                      setTarget(grant);
                    }}
                  >
                    Revoke
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog
        open={Boolean(target)}
        onOpenChange={(open) => {
          if (!open) {
            setTarget(null);
            revoke.reset();
          }
        }}
      >
        <DialogContent title="Revoke access code?" description="The person loses access immediately.">
          <div className={styles.dialogBody}>
            <p>
              This access code stops working now. Any open session created from it is also closed. Revoking cannot
              undo what the person has already seen.
            </p>
            {target ? (
              <dl className={styles.receiptMeta}>
                <div>
                  <dt>Fields</dt>
                  <dd>{fieldLabels(target.field_keys)}</dd>
                </div>
                <div>
                  <dt>Channels</dt>
                  <dd>{target.channels.map(channelLabel).join(", ")}</dd>
                </div>
              </dl>
            ) : null}
            {revoke.error ? <ErrorNotice title="Could not revoke the code" error={revoke.error} /> : null}
            <div className={styles.dialogActions}>
              <DialogClose asChild>
                <Button variant="secondary">Keep access</Button>
              </DialogClose>
              <Button variant="danger" loading={revoke.isPending} onClick={() => void confirmRevoke()}>
                Revoke access
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
