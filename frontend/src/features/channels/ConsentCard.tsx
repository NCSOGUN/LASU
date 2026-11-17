"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog";
import { MultiSelect } from "@/components/arc/multi-select/multi-select";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { useRevokeConsent, useSaveConsent, type ConsentChannel } from "@/api/hooks/channels";
import { toApiError } from "@/api/errors";
import type { Consent, FieldDefinition } from "@/api/schemas";
import {
  consentScopeCopy,
  fieldLabels,
  formatLocalDateTime,
} from "./channel-data";
import { RequestError } from "./RequestError";
import styles from "./channels.module.css";

const DURATIONS = [
  { value: "1440", label: "1 day" },
  { value: "10080", label: "7 days" },
  { value: "43200", label: "30 days" },
];

const CHANNEL_COPY: Record<ConsentChannel, string> = {
  SMS: "SMS replies can include the current values of the fields you allow here.",
  USSD: "The USSD menu can show the current values of the fields you allow here.",
};

export function ConsentCard({
  channel,
  fields,
  consent,
  phoneVerifiedAt,
}: {
  channel: ConsentChannel;
  fields: FieldDefinition[];
  consent: Consent | null | undefined;
  phoneVerifiedAt: string | null;
}) {
  const save = useSaveConsent();
  const revoke = useRevokeConsent();

  // The draft is null until someone edits the selection, so a consent returned
  // by PUT (or kept in the session cache) is what the form shows first.
  const [draft, setDraft] = useState<string[] | null>(null);
  const selected = draft ?? consent?.field_keys ?? [];
  const [duration, setDuration] = useState("43200");
  const [fieldError, setFieldError] = useState<string>();
  const [saveError, setSaveError] = useState<unknown>();
  const [revokeError, setRevokeError] = useState<unknown>();
  const [deniedFor, setDeniedFor] = useState<string | undefined>(undefined);
  const [announcement, setAnnouncement] = useState<string>();
  const [dialogOpen, setDialogOpen] = useState(false);

  // A new phone verification clears an earlier "verify a phone first" state,
  // while keeping its message if the API rejects the new link too.
  const phoneGeneration = phoneVerifiedAt ?? "unverified";
  const channelLinkRequired = deniedFor !== undefined && deniedFor === phoneGeneration;

  async function allow() {
    if (save.isPending) return;

    setFieldError(undefined);
    setSaveError(undefined);
    setAnnouncement(undefined);

    if (selected.length === 0) {
      setFieldError(`Choose at least one field for ${channel}.`);
      return;
    }

    try {
      await save.mutateAsync({
        channel,
        field_keys: selected,
        expires_in_minutes: Number(duration),
      });
      setDraft(null);
      setDeniedFor(undefined);
      setAnnouncement(`${channel} permission saved.`);
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.code === "channel_link_required") {
        setSaveError(undefined);
        setDeniedFor(phoneGeneration);
        return;
      }
      setSaveError(apiError);
    }
  }

  function submitAllow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void allow();
  }

  async function revokeConsent() {
    if (revoke.isPending) return;
    setRevokeError(undefined);

    try {
      await revoke.mutateAsync({ channel });
      setDialogOpen(false);
      setDraft(null);
      setAnnouncement(`${channel} permission revoked.`);
      setSaveError(undefined);
    } catch (error) {
      setRevokeError(toApiError(error));
    }
  }

  const selectedLabels = fieldLabels(selected, fields);
  const savedLabels = consent ? fieldLabels(consent.field_keys, fields) : [];

  return (
    <section className={styles.card} aria-labelledby={`${channel}-title`}>
      <div className={styles.cardHead}>
        <h3 id={`${channel}-title`} className={styles.cardTitle}>
          {channel}
        </h3>
        <p className={styles.cardCopy}>{CHANNEL_COPY[channel]}</p>
      </div>

      {announcement ? (
        <p className={styles.status} role="status">
          {announcement}
        </p>
      ) : null}

      {consent ? (
        <div className={styles.saved}>
          <p className={styles.savedTitle}>Current {channel} permission</p>
          <p className={styles.savedCopy}>{consentScopeCopy(channel, savedLabels)}</p>
          <p className={styles.hint}>Expires {formatLocalDateTime(consent.expires_at)}.</p>
          <div className={styles.actions}>
            <Dialog
              open={dialogOpen}
              onOpenChange={(open) => {
                setDialogOpen(open);
                if (open) setRevokeError(undefined);
              }}
            >
              <DialogTrigger asChild>
                <Button variant="secondary" size="sm">
                  Revoke {channel}
                </Button>
              </DialogTrigger>
              <DialogContent
                title={`Revoke ${channel} permission?`}
                description={`${channel} will no longer read your allowed fields. This takes effect immediately.`}
              >
                <p className={styles.dialogNote}>It cannot undo anything already shared.</p>
                {revokeError ? (
                  <RequestError
                    title={`Could not revoke ${channel} permission`}
                    error={revokeError}
                    mutation
                  />
                ) : null}
                <div className={styles.dialogActions}>
                  <DialogClose asChild>
                    <Button variant="secondary">Cancel</Button>
                  </DialogClose>
                  <Button
                    variant="danger"
                    loading={revoke.isPending}
                    onClick={() => void revokeConsent()}
                  >
                    Revoke {channel}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      ) : (
        <p className={styles.emptyNote}>No {channel} permission saved in this session.</p>
      )}

      {!phoneVerifiedAt && !consent && !channelLinkRequired ? (
        <p className={styles.hint}>
          {channel} needs a verified phone number. If you have not verified one on this page, start with the
          phone step above.
        </p>
      ) : null}

      {channelLinkRequired ? (
        <div className={styles.denied}>
          <Alert tone="warning" title="Verify a phone first">
            Add and confirm a phone number above before you allow {channel}.
          </Alert>
          <a className={styles.textLink} href="#phone-verification">
            Go to phone verification
          </a>
        </div>
      ) : (
        <form className={styles.form} onSubmit={submitAllow} noValidate>
          <div className={styles.field}>
            <MultiSelect
              label={`Fields ${channel} can read`}
              options={fields.map((field) => ({ value: field.key, label: field.label }))}
              value={selected}
              onValueChange={(next) => {
                setDraft(next);
                if (fieldError) setFieldError(undefined);
              }}
              placeholder="Choose fields"
              description="Only fields with a saved value are listed."
              maxVisible={2}
            />
            {fieldError ? (
              <p className={styles.fieldError} role="alert">
                {fieldError}
              </p>
            ) : null}
          </div>

          <div className={styles.field}>
            <p className={styles.fieldLabel}>Access duration</p>
            <SegmentedControl
              label={`${channel} permission duration`}
              options={DURATIONS}
              value={duration}
              onValueChange={setDuration}
              fullWidth
            />
          </div>

          <p className={styles.scope}>{consentScopeCopy(channel, selectedLabels)}</p>

          <div className={styles.actions}>
            <Button type="submit" loading={save.isPending}>
              Allow {channel}
            </Button>
          </div>
        </form>
      )}

      {saveError && !channelLinkRequired ? (
        <RequestError
          title={`Could not save ${channel} permission`}
          error={saveError}
          onRetry={() => void allow()}
          mutation
        />
      ) : null}

      {consent ? (
        <p className={styles.hint}>
          Saving again replaces this permission. Reloading the page hides it because the API has no consent
          read endpoint.
        </p>
      ) : null}
    </section>
  );
}
