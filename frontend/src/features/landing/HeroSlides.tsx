"use client";

import Link from "next/link";
import { useState } from "react";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { Arrow } from "@/components/ButtonLink";
import { hero } from "./content";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Slide counter + rotating subcopy (headline stays fixed, as on CardiaTec).
 * Auto-advance is driven by the progress bar's animationend, so pausing the bar pauses the carousel.
 * WCAG 2.2.2: explicit pause button; also pauses on hover/focus. No auto-advance under reduced motion.
 * Screen readers: live region only announces changes the user triggers.
 */
export function HeroSlides() {
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [announce, setAnnounce] = useState(false);

  const autoplay = !usePrefersReducedMotion();

  const total = hero.slides.length;
  const go = (next: number, byUser: boolean) => {
    setAnnounce(byUser);
    setIndex((next + total) % total);
  };
  const slide = hero.slides[index];
  const running = autoplay && !userPaused && !hoverPaused;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="What HealthAccess does"
      className="mt-8"
      onPointerEnter={() => setHoverPaused(true)}
      onPointerLeave={() => setHoverPaused(false)}
      onFocus={() => setHoverPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHoverPaused(false);
      }}
    >
      <div aria-live={announce ? "polite" : "off"} className="min-h-[9.5rem] sm:min-h-[8rem]">
        <div key={slide.id} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${total}`} className="animate-[fade-up_420ms_var(--ease-out-soft)_both]">
          <p className="text-sm font-semibold text-brand">{slide.title}</p>
          <p className="mt-2 max-w-md text-base text-muted sm:text-lg">{slide.body}</p>
          <Link href={slide.link.href} className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand underline-offset-4 hover:underline">
            {slide.link.label} <Arrow />
          </Link>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <p className="font-mono text-sm tabular-nums text-muted" aria-hidden="true">
          {pad(index + 1)}/{pad(total)}
        </p>
        <div className="h-px w-24 overflow-hidden bg-line sm:w-32">
          {autoplay && (
            <div
              key={`${index}-${userPaused}`}
              className="slide-progress h-full bg-brand"
              data-paused={!running}
              style={{ "--slide-ms": `${hero.slideMs}ms` } as React.CSSProperties}
              onAnimationEnd={() => go(index + 1, false)}
            />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <CircleButton label="Previous slide" onClick={() => go(index - 1, true)}>
            <path d="M10 4 6 8l4 4" />
          </CircleButton>
          <CircleButton label="Next slide" onClick={() => go(index + 1, true)}>
            <path d="m6 4 4 4-4 4" />
          </CircleButton>
          {autoplay && (
            <CircleButton label={userPaused ? "Play slides" : "Pause slides"} onClick={() => setUserPaused((v) => !v)}>
              {userPaused ? <path d="M6 4.5v7l5.5-3.5z" fill="currentColor" /> : <path d="M6 4.5v7M10 4.5v7" />}
            </CircleButton>
          )}
        </div>
      </div>
    </section>
  );
}

function CircleButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid size-11 place-items-center rounded-full border border-line bg-paper/70 text-ink transition-colors hover:border-brand hover:text-brand"
    >
      <span className="sr-only">{label}</span>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}
