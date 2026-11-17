import Link from "next/link";
import { BlurText } from "./BlurText";
import { hero } from "./content";
import { HeroPhone } from "./HeroPhone";
import { Chevron } from "./PillNav";

/*
 * Murmur-style hero: a bold two-line headline at the back, the hand-held phone in front overlapping its
 * lower line, a black fade over the wrist, then the paragraph and CTAs. No coloured glow behind the phone.
 * The hand is an original generated photo (public/landing/hero/hand-phone.webp), not the template's.
 */
export function Hero() {
  return (
    <section
      aria-labelledby='hero-title'
      className='relative overflow-x-clip pb-20 pt-12 sm:pt-16'
      data-inview>
      <div className='relative mx-auto max-w-7xl px-5 text-center'>
        <h1
          id='hero-title'
          className='relative z-0 text-balance font-head text-[clamp(2.1rem,8.8vw,6.5rem)] font-bold leading-[1.06] tracking-[-0.04em] text-fog'>
          <span className='block'>
            <BlurText text={hero.headline[0]} />
          </span>
          <span className='block'>
            <BlurText text={hero.headline[1]} offset={3} />
          </span>
        </h1>

        {/* Pulled up so the phone sits over the lower half of the second headline line. */}
        <div className='relative z-10 -mt-[clamp(1.4rem,3.6vw,3.4rem)]'>
          <HeroPhone />
        </div>

        <p className='relative mx-auto mt-10 max-w-md text-[15px] leading-relaxed text-fog-muted'>
          {hero.body}
        </p>
        <div className='mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-3'>
          <a
            href={hero.primary.href}
            className='inline-flex min-h-11 items-center gap-1 rounded-full bg-pill px-5 text-sm font-medium text-night hover:bg-white'>
            {hero.primary.label} <Chevron />
          </a>
          <Link
            href={hero.secondary.href}
            className='inline-flex min-h-11 items-center rounded-full border border-white/10 px-5 text-sm text-fog hover:border-mint'>
            {hero.secondary.label}
          </Link>
          <Link
            href={hero.findCare.href}
            className='inline-flex min-h-11 items-center text-sm text-fog-muted underline decoration-white/20 underline-offset-4 hover:text-fog'>
            {hero.findCare.label}
          </Link>
        </div>
        <hr className='mx-auto mt-20 max-w-5xl border-white/[0.06]' />
      </div>
    </section>
  );
}
