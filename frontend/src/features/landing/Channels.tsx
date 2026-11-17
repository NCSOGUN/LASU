"use client";

import Link from "next/link";
import { useRef } from "react";
import { BlurText } from "./BlurText";
import { channels } from "./content";
import { Globe } from "./Globe";
import { RoundButton } from "./HeroPhone";
import { Chevron } from "./PillNav";

/*
 * Template "Hands-free feels like magic" carousel: native scroll-snap (works with touch, keyboard and no JS),
 * arrow buttons scroll one card. Visuals are fictional simulations (D3) and decorative.
 */
export function Channels() {
  const track = useRef<HTMLUListElement>(null);
  const scroll = (dir: 1 | -1) => {
    const el = track.current;
    const first = el?.querySelector("li");
    if (el && first) el.scrollBy({ left: dir * (first.clientWidth + 16), behavior: "smooth" });
  };

  return (
    <section id="channels" aria-labelledby="channels-title" className="scroll-mt-20 py-20 sm:py-28" data-inview>
      <div className="mx-auto max-w-5xl px-5">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <h2 id="channels-title" className="font-head text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-none tracking-[-0.04em] text-fog">
              <BlurText text={channels.title} />
            </h2>
            <p className="mt-4 text-[15px] text-fog-muted">{channels.body}</p>
          </div>
          <Link href={channels.cta.href} className="inline-flex min-h-10 items-center gap-1 rounded-full bg-pill px-4 text-sm font-medium text-night hover:bg-white">
            {channels.cta.label} <Chevron />
          </Link>
        </div>

        <div className="relative mt-10">
          <ul ref={track} aria-label="Channels" className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2">
            {channels.cards.map((c, i) => (
              <li key={c.key} className="rise w-[86%] shrink-0 snap-start sm:w-[calc(50%-8px)]" style={{ "--d": i } as React.CSSProperties}>
                <article className="h-full overflow-hidden rounded-[18px] border border-white/[0.05] bg-night-card">
                  <div aria-hidden="true" className="relative h-56 overflow-hidden">
                    <Visual k={c.key} />
                  </div>
                  <div className="p-5">
                    <h3 className="font-head text-base font-semibold text-fog">{c.title}</h3>
                    <p className="mt-1 text-sm text-fog-muted">{c.body}</p>
                  </div>
                </article>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between gap-4">
            <p className="text-xs text-fog-muted">{channels.simNote}</p>
            <div className="flex gap-1.5">
              <RoundButton label="Previous channel" onClick={() => scroll(-1)} d="M10 4 6 8l4 4" />
              <RoundButton label="Next channel" onClick={() => scroll(1)} d="m6 4 4 4-4 4" />
            </div>
          </div>
        </div>
        <hr className="mt-16 border-white/[0.06]" />
      </div>
    </section>
  );
}

function Visual({ k }: { k: (typeof channels.cards)[number]["key"] }) {
  if (k === "web")
    return (
      <div className="grid h-full place-items-center">
        <div className="rays absolute inset-0" />
        {[180, 140].map((s) => (
          <span key={s} className="absolute rounded-full border border-mint/30" style={{ width: s, height: s }} />
        ))}
        <span className="absolute size-24 rounded-full bg-night shadow-[0_0_50px_rgba(43,179,163,0.5)]" />
        <Globe size={92} className="relative" />
      </div>
    );
  if (k === "sms")
    return (
      <div className="relative flex h-full flex-col justify-center gap-2 px-8">
        <span className="absolute left-8 top-6 size-16 rounded-full bg-mint/25 blur-2xl" />
        <span className="absolute bottom-4 right-10 size-20 rounded-full bg-amber/20 blur-2xl" />
        <p className="relative ml-auto max-w-[75%] rounded-2xl rounded-br-md bg-mint px-3 py-2 text-[12px] font-medium text-night">FIND child health near Ikeja</p>
        <p className="relative mr-auto max-w-[85%] rounded-2xl rounded-bl-md bg-white/[0.07] px-3 py-2 text-[12px] text-fog">
          Demo Community Hospital, 12 Example Road, Ikeja. Approx. 2.4 km from area centre. Reply MORE.
        </p>
      </div>
    );
  if (k === "ussd")
    return (
      <div className="grid h-full place-items-center">
        <span className="absolute size-40 rounded-full bg-teal/20 blur-3xl" />
        <pre className="relative w-56 rounded-xl border border-white/10 bg-[#dfe9dc] p-3.5 font-mono text-[11px] leading-relaxed text-[#1e332a]">
          {"CON HealthAccess\n1. Find nearby care\n2. Emergency summary\n3. View shared details\n0. Exit"}
        </pre>
      </div>
    );
  return (
    <div className="grid h-full place-items-center opacity-60">
      {[160, 120, 80].map((s) => (
        <span key={s} className="absolute rounded-full border border-dashed border-white/15" style={{ width: s, height: s }} />
      ))}
      <span className="relative rounded-full border border-white/15 bg-night px-3 py-1 text-xs text-fog-muted">Later release</span>
    </div>
  );
}
