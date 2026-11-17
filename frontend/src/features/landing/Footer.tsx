import Link from "next/link";
import { ButtonLink, Arrow } from "@/components/ButtonLink";
import { Logo } from "@/components/Logo";
import { finalCta, footer } from "./content";

/* Final CTA + footer over the dotted landscape (Manifold pattern, static SVG instead of video). */
export function Footer() {
  return (
    <footer className="stack-card on-deep relative overflow-hidden bg-deep text-on-deep">
      <div className="relative z-10 mx-auto max-w-7xl px-4 pt-20 sm:px-6 lg:pt-28">
        <h2 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl" data-reveal>
          {finalCta.title}
        </h2>
        <div className="mt-8 flex flex-wrap gap-3" data-reveal>
          <ButtonLink href={finalCta.primary.href} variant="light">
            {finalCta.primary.label} <Arrow />
          </ButtonLink>
          <Link
            href={finalCta.secondary.href}
            className="inline-flex min-h-11 items-center rounded-full border border-deep-line px-5 text-sm font-semibold text-on-deep hover:border-mint"
          >
            {finalCta.secondary.label}
          </Link>
        </div>

        <div className="mt-16 rounded-2xl border border-amber/40 bg-deep-raised/80 p-4 text-sm sm:p-5">
          <p className="font-semibold text-on-deep">{footer.emergency}</p>
        </div>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element -- decorative static SVG */}
      <img src="/landing/landscape.svg" alt="" aria-hidden="true" loading="lazy" decoding="async" className="pointer-events-none relative -mt-8 h-56 w-full object-cover sm:h-72 lg:h-80" />

      <div className="relative z-10 border-t border-deep-line bg-deep">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
          <Logo tone="light" />
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {footer.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="inline-flex min-h-11 items-center text-on-deep-muted hover:text-on-deep">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <p className="mx-auto max-w-7xl px-4 pb-8 text-xs text-on-deep-muted sm:px-6">{footer.demo}</p>
      </div>
    </footer>
  );
}
