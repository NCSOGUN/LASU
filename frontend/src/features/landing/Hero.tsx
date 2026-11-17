import Link from "next/link";
import { BlurText } from "./BlurText";
import { hero } from "./content";
import { HeroPhone } from "./HeroPhone";
import { Chevron } from "./PillNav";

/*
 * Template hero: oversized centred headline that blurs in word by word, a phone rising over its lower edge
 * on a soft glow, then a short paragraph and a light pill button. The hand photo is replaced by a CSS phone
 * (the template's photo is not ours to reuse).
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden pb-20 pt-14 sm:pt-20" data-inview>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[38%] h-[720px] w-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(43,179,163,0.28)_0%,rgba(127,209,174,0.08)_40%,transparent_70%)] blur-2xl"
      />
      <div className="relative mx-auto max-w-6xl px-5 text-center">
        <h1 id="hero-title" className="font-head font-bold tracking-[-0.04em] text-fog">
          <span className="block text-[clamp(2.6rem,9vw,6.25rem)] leading-[1.02]">
            <BlurText text={hero.headline} />
          </span>
          <span className="mt-3 block text-[clamp(1.4rem,3.6vw,2.6rem)] font-semibold leading-tight tracking-[-0.03em] text-fog-muted">
            <BlurText text={hero.subline} offset={3} />
          </span>
        </h1>

        <div className="relative mt-10 sm:mt-12">
          <HeroPhone />
        </div>

        <p className="mx-auto mt-12 max-w-md text-[15px] leading-relaxed text-fog-muted">{hero.body}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a href={hero.primary.href} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-pill px-5 text-sm font-medium text-night hover:bg-white">
            {hero.primary.label} <Chevron />
          </a>
          <Link href={hero.secondary.href} className="inline-flex min-h-11 items-center rounded-full border border-white/10 px-5 text-sm text-fog hover:border-mint">
            {hero.secondary.label}
          </Link>
        </div>
        <hr className="mx-auto mt-20 max-w-5xl border-white/[0.06]" />
      </div>
    </section>
  );
}
