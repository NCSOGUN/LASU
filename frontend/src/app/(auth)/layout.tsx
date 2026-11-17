import "@/components/arc/foundation.css";
import "@/styles/arc-theme.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { Providers } from "@/features/shell/Providers";
import styles from "./auth-layout.module.css";

export default function AuthLayout({ children }: { children: ReactNode }) {
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
        </header>
        <main id="main" className={styles.main}>
          {children}
        </main>
        <p className={styles.note}>Care within reach. You choose what you share.</p>
      </div>
    </Providers>
  );
}
