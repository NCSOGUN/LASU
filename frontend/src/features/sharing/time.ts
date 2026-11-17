"use client";

import { useSyncExternalStore } from "react";

const subscribeNever = () => () => {};

/**
 * The viewer's time zone. The server snapshot stays UTC so hydration matches, then the client
 * switches to the local zone. Times are always rendered in the viewer's local time.
 */
export function useLocalTimeZone(): string {
  return useSyncExternalStore(
    subscribeNever,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    () => "UTC",
  );
}

function createClock(intervalMs: number) {
  // Start with a real reading so the first client render never blocks content on a tick.
  let current = Date.now();
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setInterval> | null = null;

  const tick = () => {
    current = Date.now();
    listeners.forEach((listener) => listener());
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    if (listeners.size === 1) {
      tick();
      timer = setInterval(tick, intervalMs);
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  };

  return function useClock(): number {
    return useSyncExternalStore(subscribe, () => current, () => 0);
  };
}

/** A minute clock for relative log labels, and a second clock for the access countdown. */
export const useMinuteClock = createClock(60_000);
export const useSecondClock = createClock(1_000);

/** A short, readable remaining time. Uses minutes and seconds; hours appear only when needed. */
export function formatRemaining(milliseconds: number): string {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0) return `${minutes} min ${seconds} s`;
  return `${seconds} s`;
}
