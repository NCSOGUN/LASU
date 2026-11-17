import "@/components/arc/foundation.css";
import "@/styles/arc-theme.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { Providers } from "@/features/shell/Providers";
import styles from "./public-layout.module.css";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <div className={styles.page}>
        <header className={styles.header}>
          <Link className={styles.brand} href="/">
            <span aria-hidden="true" className={styles.mark}>
              +
            </span>
            HealthAccess
          </Link>
          <nav aria-label="Account" className={styles.links}>
            <Link className={styles.link} href="/find-care">
              Find care
            </Link>
            <Link className={styles.link} href="/login">
              Sign in
            </Link>
          </nav>
        </header>
        <main id="main" className={styles.main}>
          {children}
        </main>
      </div>
    </Providers>
  );
}
