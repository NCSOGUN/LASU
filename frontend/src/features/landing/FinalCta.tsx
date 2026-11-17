import Link from "next/link";
import { BlurText } from "./BlurText";
import { finalCta } from "./content";
import { Phone } from "./Phone";
import { PhoneScreen } from "./PhoneScreens";
import { Chevron } from "./PillNav";

/* Template closing block. The email form is replaced by real entry points: there is no newsletter backend,
   and a form here would collect data with nowhere safe to send it. */
export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="py-20 sm:py-28" data-inview>
      <div className="mx-auto max-w-5xl px-5">
        <p className="text-center text-sm text-fog-muted">{finalCta.kicker}</p>
        <h2 id="cta-title" className="mx-auto mt-3 max-w-3xl text-center font-head text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-fog">
          <BlurText text={finalCta.title} />
        </h2>

        <div className="rise relative mt-12 grid overflow-hidden rounded-[22px] border border-white/[0.06] bg-night-card md:grid-cols-[1.2fr_1fr]">
          <div className="p-7 sm:p-10">
            <p className="text-sm text-fog-muted">{finalCta.cardKicker}</p>
            <h3 className="mt-2 font-head text-2xl font-semibold tracking-[-0.03em] text-fog sm:text-3xl">{finalCta.cardTitle}</h3>
            <p className="mt-3 max-w-sm text-[15px] text-fog-muted">{finalCta.cardBody}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href={finalCta.primary.href} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-pill px-5 text-sm font-medium text-night hover:bg-white">
                {finalCta.primary.label} <Chevron />
              </Link>
              <Link href={finalCta.secondary.href} className="inline-flex min-h-11 items-center rounded-full border border-white/10 px-5 text-sm text-fog hover:border-mint">
                {finalCta.secondary.label}
              </Link>
            </div>
          </div>
          <div aria-hidden="true" className="relative hidden h-full min-h-[320px] md:block">
            <div className="absolute -bottom-40 left-1/2 w-[240px] -translate-x-1/2 rotate-[-6deg]">
              <Phone>
                <PhoneScreen k="ask" />
              </Phone>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
