"use client";

import { useSyncExternalStore } from "react";
import { Alert } from "@/components/arc/alert/alert";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

/** The server render assumes online; the client corrects after hydration without a mismatch. */
function getServerSnapshot() {
  return true;
}

export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (online) return null;
  return (
    <Alert tone="warning" title="You are offline">
      Changes stay in this tab. Reconnect before saving, and your draft will still be here.
    </Alert>
  );
}
