"use client";

import { useEffect } from "react";

const MIN_MS = 600;
const MAX_MS = 1600;

// 7x7 dot grid; the "+" cross lights up in sequence.
const GRID = Array.from({ length: 49 }, (_, i) => {
  const r = Math.floor(i / 7);
  const c = i % 7;
  const cross = (c >= 2 && c <= 4 && r >= 0 && r <= 6) || (r >= 2 && r <= 4 && c >= 0 && c <= 6);
  return { r, c, cross, order: Math.abs(r - 3) + Math.abs(c - 3) };
});

function finish() {
  const d = document.documentElement;
  if (d.classList.contains("ha-preload-done")) return;
  d.classList.add("ha-preload-done");
  d.setAttribute("data-intro", "play");
  try {
    sessionStorage.setItem("ha-intro", "1");
  } catch {
    /* storage blocked: the intro may show again, which is harmless */
  }
}

/**
 * Curtain preloader (CardiaTec pattern, adapted): lifts as soon as fonts and hero layers are ready,
 * with a 600ms floor so it does not flash and a 1.6s ceiling. Visibility is controlled by the inline
 * head script (.ha-preload), so it never renders without JS, under reduced motion, or twice per session.
 */
export function Preloader() {
  useEffect(() => {
    const d = document.documentElement;
    if (!d.classList.contains("ha-preload")) return;

    const images = Array.from(document.querySelectorAll<HTMLImageElement>("img[data-hero-layer]"));
    const ready = Promise.all([
      document.fonts?.ready,
      ...images.map((img) => img.decode().catch(() => undefined)),
    ]);
    const elapsed = performance.now();
    const floor = new Promise((r) => setTimeout(r, Math.max(0, MIN_MS - elapsed)));
    const ceiling = new Promise((r) => setTimeout(r, Math.max(0, MAX_MS - elapsed)));

    let cancelled = false;
    Promise.race([Promise.all([ready, floor]), ceiling]).then(() => {
      if (!cancelled) finish();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="preloader fixed inset-0 z-[9999] flex-col items-center justify-center gap-6 bg-night text-fog"
      data-testid="preloader"
    >
      <svg aria-hidden="true" width="84" height="84" viewBox="0 0 84 84">
        {GRID.map((d, i) => (
          <circle
            key={i}
            className="preloader-dot"
            data-cross={d.cross}
            cx={6 + d.c * 12}
            cy={6 + d.r * 12}
            r={d.cross ? 3.6 : 2}
            fill="#9fb8b0"
            style={{ "--i": d.order } as React.CSSProperties}
          />
        ))}
      </svg>
      <p className="preloader-tagline text-lg font-medium tracking-tight">Care within reach.</p>
      <button
        type="button"
        onClick={finish}
        className="absolute bottom-6 right-6 min-h-11 rounded-full px-4 text-sm text-fog-muted underline-offset-4 hover:text-fog hover:underline"
      >
        Skip intro
      </button>
    </div>
  );
}
