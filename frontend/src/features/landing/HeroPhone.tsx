"use client";

import { useState } from "react";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { hero, heroScreens } from "./content";
import { Phone } from "./Phone";
import { PhoneScreen } from "./PhoneScreens";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Hero phone cycling the three core journeys (approved slide model: counter, timer bar, arrows).
 * Auto-advance is driven by the timer bar's animationend, so pausing the bar pauses the carousel.
 * WCAG 2.2.2: explicit pause; also pauses on hover/focus; no auto-advance under reduced motion.
 * The live region announces only slide changes the user triggers.
 */
export function HeroPhone() {
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [announce, setAnnounce] = useState(false);
  const autoplay = !usePrefersReducedMotion();

  const total = heroScreens.length;
  const go = (next: number, byUser: boolean) => {
    setAnnounce(byUser);
    setIndex((next + total) % total);
  };
  const screen = heroScreens[index];
  const running = autoplay && !userPaused && !hoverPaused;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="The three things HealthAccess helps with"
      className="hero-phone relative mx-auto"
      onPointerEnter={() => setHoverPaused(true)}
      onPointerLeave={() => setHoverPaused(false)}
      onFocus={() => setHoverPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHoverPaused(false);
      }}
    >
      <div aria-hidden="true" className="mx-auto w-[min(78vw,310px)]">
        <Phone>
          <PhoneScreen k={screen.key} />
        </Phone>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
        <p aria-live={announce ? "polite" : "off"} className="whitespace-nowrap text-sm text-fog">
          <span className="font-mono text-fog-muted">
            {pad(index + 1)}/{pad(total)}
          </span>{" "}
          <span className="sr-only">Showing: </span>
          {screen.label}
        </p>
        <div className="h-px w-14 overflow-hidden bg-white/10">
          {autoplay && (
            <div
              key={`${index}-${userPaused}`}
              className="slide-progress h-full bg-mint"
              data-paused={!running}
              style={{ "--slide-ms": `${hero.slideMs}ms` } as React.CSSProperties}
              onAnimationEnd={() => go(index + 1, false)}
            />
          )}
        </div>
        <div className="flex gap-1">
          <RoundButton label="Previous" onClick={() => go(index - 1, true)} d="M10 4 6 8l4 4" />
          <RoundButton label="Next" onClick={() => go(index + 1, true)} d="m6 4 4 4-4 4" />
          {autoplay && (
            <RoundButton
              label={userPaused ? "Play" : "Pause"}
              onClick={() => setUserPaused((v) => !v)}
              d={userPaused ? "M6 4.5v7l5.5-3.5z" : "M6 4.5v7M10 4.5v7"}
            />
          )}
        </div>
      </div>
    </section>
  );
}

export function RoundButton({ label, onClick, d }: { label: string; onClick: () => void; d: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid size-11 place-items-center rounded-full border border-white/10 text-fog transition-colors hover:border-mint hover:text-mint"
    >
      <span className="sr-only">{label}</span>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </button>
  );
}
