import { problem } from "./content";

/* Manifold-style dark statement block. Qualitative only: see [SOURCE NEEDED] notes in content.ts. */
export function Problem() {
  return (
    <section aria-labelledby="problem-title" className="stack-card on-deep bg-deep text-on-deep">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mint" data-reveal>
          {problem.eyebrow}
        </p>
        <h2 id="problem-title" className="mt-4 max-w-4xl text-3xl font-normal leading-tight tracking-tight sm:text-5xl" data-reveal>
          {problem.title}
        </h2>
        <ol className="mt-14 grid gap-px overflow-hidden rounded-[var(--radius-card)] bg-deep-line sm:grid-cols-3">
          {problem.points.map((p, i) => (
            <li key={p.title} className="bg-deep p-6 sm:p-8" data-reveal>
              <p className="font-mono text-sm text-mint" aria-hidden="true">
                0{i + 1}
              </p>
              <h3 className="mt-6 text-lg font-semibold">{p.title}</h3>
              <p className="mt-3 text-on-deep-muted">{p.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
