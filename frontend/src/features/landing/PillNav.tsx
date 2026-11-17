"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { BrandMark } from "@/components/Logo";
import { nav } from "./content";

/** Floating two-pill nav (CardiaTec pattern). Below md the links collapse into a disclosure menu. */
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

  const pill = "rounded-full border border-white/60 bg-paper/92 shadow-[0_6px_24px_rgba(24,61,53,0.06)] backdrop-blur-md";

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-3 sm:px-6 sm:pt-4">
      <nav aria-label="Main" className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <Link href="/" className={`${pill} nav-item flex min-h-12 items-center gap-2.5 py-2 pl-2 pr-4 font-semibold tracking-tight text-ink`} style={{ "--i": 0 } as React.CSSProperties}>
          <BrandMark />
          HealthAccess
        </Link>

        <div className={`${pill} hidden items-center gap-1 p-1.5 md:flex`}>
          {nav.links.map((l, i) => (
            <a
              key={l.href}
              href={l.href}
              className="nav-item rounded-full px-3.5 py-2 text-sm text-muted transition-colors hover:bg-soft hover:text-ink"
              style={{ "--i": i + 1 } as React.CSSProperties}
            >
              {l.label}
            </a>
          ))}
          <Link
            href={nav.cta.href}
            className="nav-item ml-1 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-dark"
            style={{ "--i": nav.links.length + 1 } as React.CSSProperties}
          >
            {nav.cta.label}
          </Link>
        </div>

        <button
          ref={buttonRef}
          type="button"
          className={`${pill} grid size-12 place-items-center text-ink md:hidden`}
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
          </svg>
        </button>
      </nav>

      <div id={menuId} hidden={!open} className="mx-auto mt-2 max-w-7xl md:hidden">
        <div className="rounded-3xl border border-line bg-paper p-2 shadow-lg">
          {nav.links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="flex min-h-12 items-center rounded-2xl px-4 text-ink hover:bg-soft">
              {l.label}
            </a>
          ))}
          <Link href={nav.cta.href} className="mt-1 flex min-h-12 items-center justify-center rounded-2xl bg-brand px-4 font-semibold text-white">
            {nav.cta.label}
          </Link>
        </div>
      </div>
    </header>
  );
}
