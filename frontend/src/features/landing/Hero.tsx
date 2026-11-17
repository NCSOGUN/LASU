import { ButtonLink, Arrow } from "@/components/ButtonLink";
import { hero, nav } from "./content";
import { HeroArt } from "./HeroArt";
import { HeroSlides } from "./HeroSlides";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden bg-wash pb-20 pt-28 sm:pt-32 lg:pb-28">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_75%_40%,#e2efe6_0%,transparent_70%)]"
      />
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-6">
        <div>
          <h1 id="hero-title" className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-ink sm:text-6xl lg:text-[4.25rem]">
            <span className="block">{hero.headline[0]}</span>
            <span className="block font-normal text-brand">{hero.headline[1]}</span>
          </h1>
          <HeroSlides />
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href={nav.cta.href}>
              {nav.cta.label} <Arrow />
            </ButtonLink>
            <ButtonLink href={hero.secondary.href} variant="secondary">
              {hero.secondary.label}
            </ButtonLink>
          </div>
        </div>
        <HeroArt />
      </div>
    </section>
  );
}
