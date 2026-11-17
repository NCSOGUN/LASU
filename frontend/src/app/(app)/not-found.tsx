import Link from "next/link";
import styles from "./app-state.module.css";

export default function AppNotFound() {
  return (
    <section className={styles.panel} aria-labelledby="app-not-found-title">
      <h1 className={styles.title} id="app-not-found-title">
        This page is not available
      </h1>
      <p className={styles.copy}>The address may be wrong, or the item may have been removed.</p>
      <Link className={styles.link} href="/app">
        Back to overview
      </Link>
    </section>
  );
}
