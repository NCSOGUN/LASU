import "@/components/arc/foundation.css";
import "@/styles/arc-theme.css";
import type { ReactNode } from "react";
import { Providers } from "@/features/shell/Providers";
import { AppShell } from "@/features/shell/AppShell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
