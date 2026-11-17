"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { useEmergencyLookup } from "@/api/hooks/sharing";
import type { EmergencyLookupResponse } from "@/api/schemas";
import { PATIENT_CODE_LENGTH, digitsOnly, formatFieldValue } from "./code";
import { DeniedNotice, ErrorNotice, isDenied } from "./states";
import styles from "./sharing.module.css";

const unavailableMessage = "No shared information is available for these codes.";

export function EmergencyLookupScreen() {
  const lookup = useEmergencyLookup();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<EmergencyLookupResponse | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const error = lookup.error;
  const { reset: resetLookup } = lookup;

  useEffect(() => {
    return () => {
      resetLookup();
    };
  }, [resetLookup]);

  async function submitLookup() {
    setFieldError(null);
    if (code.length !== PATIENT_CODE_LENGTH) {
      setFieldError(`Enter the ${PATIENT_CODE_LENGTH}-digit patient code.`);
      input.current?.focus();
      return;
    }
    setResult(null);
    lookup.reset();
    try {
      const data = await lookup.mutateAsync({ patient_code: code });
      setResult(data);
    } catch {
      // The error state below keeps the code so the person can retry.
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitLookup();
  }

  function clear() {
    setCode("");
    setResult(null);
    setFieldError(null);
    lookup.reset();
    input.current?.focus();
  }

  const showResult = result && result.available && (result.fields?.length ?? 0) > 0;

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1 className={styles.title}>Emergency lookup</h1>
        <p className={styles.subtitle}>
          Enter the 12-digit patient code to read the emergency fields the patient chose to share. The code is used
          once for this lookup and is not added to the address bar.
        </p>
      </header>

      <section className={styles.panel} aria-labelledby="lookup-title">
        <div className={styles.panelHead}>
          <div className={styles.panelIntro}>
            <h2 id="lookup-title" className={styles.panelTitle}>
              Enter the patient code
            </h2>
            <p className={styles.panelCopy}>Ask the patient for their code. It is 12 digits and contains no letters.</p>
          </div>
        </div>

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <Input
            ref={input}
            label="Patient code"
            name="patient-code"
            description="12 digits, shared by the patient."
            value={code}
            onChange={(event) => {
              setCode(digitsOnly(event.target.value, PATIENT_CODE_LENGTH));
              setFieldError(null);
              setResult(null);
            }}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={PATIENT_CODE_LENGTH}
            error={fieldError ?? undefined}
            required
          />

          {lookup.isPending ? <Skeleton lines={3} label="Looking up the patient code" /> : null}

          {error && !isDenied(error) ? (
            <ErrorNotice
              title="Could not look up this code"
              error={error}
              onRetry={() => void submitLookup()}
              retrying={lookup.isPending}
            />
          ) : null}

          {error && isDenied(error) ? <DeniedNotice title="Lookup is not available" error={error} /> : null}

          <div className={styles.actions}>
            <Button type="submit" loading={lookup.isPending}>
              Look up record
            </Button>
            {code || result ? (
              <Button type="button" variant="secondary" onClick={clear}>
                Clear
              </Button>
            ) : null}
          </div>
        </form>
      </section>

      {result ? (
        <section className={styles.panel} aria-labelledby="lookup-result-title">
          <div className={styles.panelHead}>
            <div className={styles.panelIntro}>
              <h2 id="lookup-result-title" className={styles.panelTitle}>
                Shared emergency information
              </h2>
              <p className={styles.panelCopy}>Read-only. This is the order the patient chose.</p>
            </div>
          </div>

          {showResult ? (
            <dl className={styles.resultList}>
              {result.fields?.map((field) => (
                <div key={field.key}>
                  <dt>{field.label}</dt>
                  <dd>{formatFieldValue(field.value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <Alert tone="info" title="No shared information">
              {unavailableMessage}
            </Alert>
          )}
        </section>
      ) : null}
    </div>
  );
}
