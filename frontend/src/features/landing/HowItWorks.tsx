import { SectionHeading } from "@/components/SectionHeading";
import { steps } from "./content";

/*
 * Ask -> Match -> Share -> Revoke. The stacked-layer diagram adapts CardiaTec's rhombus stack:
 * LandingMotion marks the layer for the step currently in view (data-active). Without JS all layers show.
 */
export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="stack-card scroll-mt-20 bg-wash">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
        <SectionHeading id="how-title" eyebrow="How it works" title="Ask, match, share, revoke." body="Four steps, and you confirm every one that involves your information." />

        <div className="mt-14 grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <svg viewBox="0 0 320 300" className="mx-auto w-full max-w-sm" aria-hidden="true">
              {steps.map((s, i) => {
                const y = 60 + i * 56;
                return (
                  <g key={s.key} data-layer={s.key} className="step-layer">
                    <path d={`M160 ${y - 42} L290 ${y} L160 ${y + 42} L30 ${y} Z`} />
                    <text x="160" y={y + 5} textAnchor="middle">
                      {s.title}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <ol className="grid gap-4">
            {steps.map((s, i) => (
              <li key={s.key} data-step={s.key} className="rounded-[var(--radius-card)] border border-line bg-paper p-6 sm:p-8" data-reveal>
                <div className="flex items-baseline gap-4">
                  <span className="font-mono text-sm text-brand" aria-hidden="true">
                    0{i + 1}
                  </span>
                  <h3 className="text-xl font-semibold tracking-tight">{s.title}</h3>
                </div>
                <p className="mt-3 text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
