import { SectionHeading } from "@/components/SectionHeading";
import { roadmap } from "./content";

/* Scope taken from plan §1, word for word in meaning. Do not add items without updating the plan. */
export function Roadmap() {
  return (
    <section id="roadmap" aria-labelledby="roadmap-title" className="stack-card scroll-mt-20 bg-wash">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
        <SectionHeading id="roadmap-title" eyebrow={roadmap.eyebrow} title={roadmap.title} />
        <div className="mt-12 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-[var(--radius-card)] border border-brand/30 bg-paper p-6 sm:p-8" data-reveal>
            <h3 className="flex items-center gap-3 text-lg font-semibold">
              Release 1 <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-medium text-white">In build</span>
            </h3>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {roadmap.release1.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm">
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" className="mt-0.5 shrink-0 text-brand">
                    <path d="m4 9 3.5 3.5L14 6" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-5">
            <div className="rounded-[var(--radius-card)] border border-dashed border-line bg-paper/60 p-6" data-reveal>
              <h3 className="text-lg font-semibold">Later</h3>
              <ul className="mt-3 grid gap-2 text-sm text-muted">
                {roadmap.later.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-[var(--radius-card)] border border-line bg-soft/60 p-6" data-reveal>
              <h3 className="text-lg font-semibold">Separate projects, not planned here</h3>
              <ul className="mt-3 flex flex-wrap gap-2 text-sm">
                {roadmap.separate.map((item) => (
                  <li key={item} className="rounded-full border border-line bg-paper px-3 py-1 text-muted">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
