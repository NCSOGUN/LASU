"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { useSession } from "@/api/hooks/session";
import { useOpenGrant } from "@/api/hooks/practitioner";
import { toApiError } from "@/api/errors";
import { qk } from "@/api/keys";
import { GRANT_CODE_LENGTH, PATIENT_CODE_LENGTH, digitsOnly } from "@/features/sharing/code";
import { DeniedNotice, ErrorNotice, isDenied } from "@/features/sharing/states";
import styles from "./practitioner.module.css";

const unavailableMessage = "No shared information is available for these codes.";

export function PractitionerLookupScreen() {
  const session = useSession();
  const openGrant = useOpenGrant();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [patientCode, setPatientCode] = useState("");
  const [grantCode, setGrantCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [unavailable, setUnavailable] = useState(false);
  const [unexpected, setUnexpected] = useState(false);
  const patientInput = useRef<HTMLInputElement>(null);
  const grantInput = useRef<HTMLInputElement>(null);
  const error = openGrant.error;
  const { reset: resetOpenGrant } = openGrant;

  useEffect(() => {
    return () => {
      resetOpenGrant();
    };
  }, [resetOpenGrant]);

  async function submitOpen() {
    const nextErrors: Record<string, string> = {};
    if (patientCode.length !== PATIENT_CODE_LENGTH) nextErrors.patient_code = "Enter the 12-digit patient code.";
    if (grantCode.length !== GRANT_CODE_LENGTH) nextErrors.grant_code = "Enter the 8-digit access code.";
    setErrors(nextErrors);
    setUnavailable(false);
    setUnexpected(false);
    if (Object.keys(nextErrors).length > 0) {
      if (nextErrors.patient_code) patientInput.current?.focus();
      else grantInput.current?.focus();
      return;
    }

    openGrant.reset();
    try {
      const data = await openGrant.mutateAsync({ patient_code: patientCode, grant_code: grantCode });
      if (!data.available) {
        setUnavailable(true);
        return;
      }
      if (!data.read_session_id || !data.expires_at) {
        setUnexpected(true);
        return;
      }
      queryClient.setQueryData(qk.readSession(data.read_session_id), data);
      setPatientCode("");
      setGrantCode("");
      router.push(`/practitioner/records/${data.read_session_id}`);
    } catch (caught) {
      const apiError = toApiError(caught);
      if (apiError.code === "validation_error") {
        const mapped: Record<string, string> = {};
        for (const issue of apiError.issues ?? []) {
          const key = issue.path.split(".").pop() ?? issue.path;
          if (key === "patient_code" || key === "grant_code") mapped[key] = issue.message;
        }
        setErrors(mapped);
        if (mapped.patient_code) patientInput.current?.focus();
        else if (mapped.grant_code) grantInput.current?.focus();
      }
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitOpen();
  }

  const isPractitioner = session.data?.roles.includes("PRACTITIONER") ?? false;
  const roleDenied = session.isSuccess && !isPractitioner;

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1 className={styles.title}>Practitioner lookup</h1>
        <p className={styles.subtitle}>
          Open a record when a patient has given you their patient code and an access code for the verified
          practitioner portal. Both codes stay out of the address bar.
        </p>
      </header>

      {session.isLoading ? <Skeleton lines={3} label="Checking practitioner access" /> : null}

      {roleDenied || (session.error && isDenied(session.error)) ? (
        <div className={styles.panel}>
          <Alert tone="warning" title="Practitioner access required">
            This page is for approved practitioners. Sign in with a practitioner account, or ask the care team to
            approve your account.
          </Alert>
          <div className={styles.actions}>
            <Link className={styles.textLink} href="/app">
              Go to overview
            </Link>
          </div>
        </div>
      ) : null}

      {session.error && !isDenied(session.error) ? (
        <ErrorNotice
          title="Could not check practitioner access"
          error={session.error}
          onRetry={() => void session.refetch()}
          retrying={session.isFetching}
        />
      ) : null}

      {isPractitioner ? (
        <section className={styles.panel} aria-labelledby="practitioner-lookup-title">
          <div className={styles.panelHead}>
            <div className={styles.panelIntro}>
              <h2 id="practitioner-lookup-title" className={styles.panelTitle}>
                Open a shared record
              </h2>
              <p className={styles.panelCopy}>
                The patient gives you the 12-digit patient code and the 8-digit access code.
              </p>
            </div>
          </div>

          <form className={styles.form} onSubmit={onSubmit} noValidate>
            <Input
              ref={patientInput}
              label="Patient code"
              name="patient-code"
              description="12 digits."
              value={patientCode}
              onChange={(event) => {
                setPatientCode(digitsOnly(event.target.value, PATIENT_CODE_LENGTH));
                setErrors((current) => ({ ...current, patient_code: "" }));
                setUnavailable(false);
              }}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={PATIENT_CODE_LENGTH}
              error={errors.patient_code || undefined}
              required
            />
            <Input
              ref={grantInput}
              label="Access code"
              name="grant-code"
              description="8 digits."
              value={grantCode}
              onChange={(event) => {
                setGrantCode(digitsOnly(event.target.value, GRANT_CODE_LENGTH));
                setErrors((current) => ({ ...current, grant_code: "" }));
                setUnavailable(false);
              }}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={GRANT_CODE_LENGTH}
              error={errors.grant_code || undefined}
              required
            />

            {unavailable ? (
              <Alert tone="info" title="No shared information">
                {unavailableMessage}
              </Alert>
            ) : null}

            {unexpected ? (
              <Alert tone="danger" title="Could not open the record">
                The service returned an unexpected response. Try again.
              </Alert>
            ) : null}

            {error && !isDenied(error) ? (
              <ErrorNotice
                title="Could not open the record"
                error={error}
                onRetry={() => void submitOpen()}
                retrying={openGrant.isPending}
              />
            ) : null}

            {error && isDenied(error) ? <DeniedNotice title="Practitioner access is required" error={error} /> : null}

            <div className={styles.actions}>
              <Button type="submit" loading={openGrant.isPending}>
                Open record
              </Button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
