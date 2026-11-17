"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { hero, heroScreens } from "./content";
import { PhoneChrome } from "./Phone";
import { PhoneScreen } from "./PhoneScreens";

const pad = (n: number) => String(n).padStart(2, "0");

/*
 * Screen rectangle inside /landing/hero/hand-phone.webp (688x1024, measured from the cut-out):
 * left 26.31%, top 1.86%, width 46.66%, height 66.41%. If the image is swapped, re-measure these.
 * The UI is laid out at a fixed 300px design width and scaled to the measured screen width, so it keeps
 * the same proportions at every viewport.
 */
const SCREEN = {
  left: "26.31%",
  top: "1.86%",
  width: "46.66%",
  height: "66.41%",
};
const DESIGN_W = 300;
const DESIGN_H = Math.round(DESIGN_W * (680 / 321));

/**
 * Hero: a hand holding the phone (original generated photo, cut out), cycling the three core journeys.
 * Slide model as approved: counter, timer bar, arrows, pause. Auto-advance runs off the timer bar's
 * animationend, pauses on hover/focus, and is off under reduced motion. The live region announces only
 * slide changes the user triggers.
 */
export function HeroPhone() {
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [announce, setAnnounce] = useState(false);
  const [scale, setScale] = useState(1);
  const screenRef = useRef<HTMLDivElement>(null);
  const autoplay = !usePrefersReducedMotion();

  useEffect(() => {
    const el = screenRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setScale(e.contentRect.width / DESIGN_W),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const total = heroScreens.length;
  const go = (next: number, byUser: boolean) => {
    setAnnounce(byUser);
    setIndex((next + total) % total);
  };
  const screen = heroScreens[index];
  const running = autoplay && !userPaused && !hoverPaused;

  return (
    <section
      aria-roledescription='carousel'
      aria-label='The three things HealthAccess helps with'
      className='hero-phone relative'
      onPointerEnter={() => setHoverPaused(true)}
      onPointerLeave={() => setHoverPaused(false)}
      onFocus={() => setHoverPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHoverPaused(false);
      }}>
      {/* Stage: wider than the viewport on phones so the device itself stays large; the hand crops at the sides. */}
      <div
        aria-hidden='true'
        className='relative left-1/2 aspect-[688/860] w-[clamp(500px,140vw,820px)] -translate-x-1/2 overflow-hidden'>
        {/* eslint-disable-next-line @next/next/no-img-element -- single hero cut-out; preloaded and decoded by the preloader */}
        <img
          data-hero-layer
          src='/landing/hero/hand-phone.webp'
          alt=''
          width={688}
          height={1024}
          fetchPriority='high'
          decoding='async'
          className='absolute inset-x-0 top-0 w-full select-none'
          draggable={false}
        />
        <div
          ref={screenRef}
          className='absolute overflow-hidden rounded-[12%/5.6%] bg-[#0a1112]'
          style={SCREEN}>
          <div
            className='origin-top-left'
            style={{
              width: DESIGN_W,
              height: DESIGN_H,
              transform: `scale(${scale})`,
            }}>
            <PhoneChrome>
              <PhoneScreen k={screen.key} />
            </PhoneChrome>
          </div>
        </div>
        {/* Fade the wrist into the page (template's bottom fade). */}
        <div className='absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-b from-transparent via-night/80 to-night' />
      </div>

      <div className='relative -mt-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 sm:-mt-16'>
        <p
          aria-live={announce ? "polite" : "off"}
          className='whitespace-nowrap text-sm text-fog'>
          {/* <span className='font-mono text-fog-muted'>
            {pad(index + 1)}/{pad(total)}
          </span>{" "} */}
          <span className='sr-only'>Showing: </span>
          {screen.label}
        </p>
        <div className='h-px w-14 overflow-hidden bg-white/10'>
          {autoplay && (
            <div
              key={`${index}-${userPaused}`}
              className='slide-progress h-full bg-mint'
              data-paused={!running}
              style={
                { "--slide-ms": `${hero.slideMs}ms` } as React.CSSProperties
              }
              onAnimationEnd={() => go(index + 1, false)}
            />
          )}
        </div>
        <div className='flex gap-1'>
          <RoundButton
            label='Previous'
            onClick={() => go(index - 1, true)}
            d='M10 4 6 8l4 4'
          />
          <RoundButton
            label='Next'
            onClick={() => go(index + 1, true)}
            d='m6 4 4 4-4 4'
          />
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

export function RoundButton({
  label,
  onClick,
  d,
}: {
  label: string;
  onClick: () => void;
  d: string;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='grid size-11 place-items-center rounded-full border border-white/10 bg-night/60 text-fog transition-colors hover:border-mint hover:text-mint'>
      <span className='sr-only'>{label}</span>
      <svg
        aria-hidden='true'
        width='16'
        height='16'
        viewBox='0 0 16 16'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.6'
        strokeLinecap='round'
        strokeLinejoin='round'>
        <path d={d} />
      </svg>
    </button>
  );
}
