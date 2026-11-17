"use client";

import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import styles from "./app-state.module.css";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className={styles.panel} aria-labelledby="app-error-title">
      <h1 className={styles.title} id="app-error-title">
        Something went wrong
      </h1>
      <Alert tone="danger" title="This page could not load">
        <span className={styles.copy}>Try again. If it keeps happening, contact support with the reference below.</span>
        {error.digest ? <span className={styles.reference}>Reference {error.digest}</span> : null}
      </Alert>
      <Button onClick={reset}>Try again</Button>
    </section>
  );
}
