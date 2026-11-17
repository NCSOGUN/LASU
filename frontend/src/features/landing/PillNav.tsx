"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { nav } from "./content";

export function LogoMark() {
  return (
    <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-mint to-teal text-night">
      <svg width="12" height="12" viewBox="0 0 14 14">
        <path d="M5.5 0h3v5.5H14v3H8.5V14h-3V8.5H0v-3h5.5z" fill="currentColor" />
      </svg>
    </span>
  );
}

export const Chevron = () => (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 4 4 4-4 4" />
  </svg>
);

/** Sticky dark nav (template pattern): logo left, quiet links, light pill CTA. Below md: disclosure menu. */
export function PillNav() {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.04] bg-night/75 backdrop-blur-xl">
      <nav aria-label="Main" className="mx-auto flex h-[70px] max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2 font-head text-lg font-semibold tracking-tight text-fog">
          <LogoMark />
          HealthAccess
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {nav.links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-fog-muted transition-colors hover:text-fog">
              {l.label}
            </a>
          ))}
          <Link
            href={nav.cta.href}
            className="inline-flex min-h-10 items-center gap-1 rounded-full bg-pill px-4 text-sm font-medium text-night transition-colors hover:bg-white"
          >
            {nav.cta.label} <Chevron />
          </Link>
        </div>

        <button
          ref={buttonRef}
          type="button"
          className="grid size-11 place-items-center rounded-full border border-white/10 text-fog md:hidden"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 7h14M3 13h14" />}
          </svg>
        </button>
      </nav>

      <div id={menuId} hidden={!open} className="border-t border-white/5 px-5 pb-5 md:hidden">
        {nav.links.map((l) => (
          <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="flex min-h-12 items-center border-b border-white/5 text-fog">
            {l.label}
          </a>
        ))}
        <Link href={nav.cta.href} className="mt-4 flex min-h-12 items-center justify-center gap-1 rounded-full bg-pill font-medium text-night">
          {nav.cta.label} <Chevron />
        </Link>
      </div>
    </header>
  );
}
