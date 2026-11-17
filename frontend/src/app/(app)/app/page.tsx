import Link from "next/link";
import styles from "./overview.module.css";

export const metadata = { title: "Overview · HealthAccess" };

export default function OverviewPage() {
  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1 className={styles.title}>Overview</h1>
        <p className={styles.subtitle}>
          Your health record, sharing choices and care items in one place. You decide what is shared, and for how
          long.
        </p>
      </header>

      <section className={styles.start} aria-labelledby="start-title">
        <h2 id="start-title" className={styles.sectionTitle}>
          Start here
        </h2>
        <ul className={styles.links}>
          <li>
            <Link href="/app/record">Keep your record up to date</Link>
          </li>
          <li>
            <Link href="/app/emergency-summary">Choose what an emergency lookup reveals</Link>
          </li>
          <li>
            <Link href="/app/access">Create a temporary access code</Link>
          </li>
        </ul>
        <p className={styles.note}>Keep these three choices current before you share anything.</p>
      </section>
    </div>
  );
}
