import { record } from "./content";

/*
 * Manifold-style dotted figure with callouts, but the callouts are the record fields a patient controls
 * (not organs or symptoms), so it never reads as a symptom checker. Numbered anchors on the figure match
 * the numbered field list; each field links to the feature that controls it.
 */
const fieldLink: Record<string, string> = {
  full_name: "#feature-summary",
  allergies: "#feature-summary",
  conditions: "#feature-grant",
  blood_group: "#feature-summary",
  current_medications: "#feature-grant",
  emergency_contact: "#feature-summary",
};

export function BodyMap() {
  const numbered = record.fields.map((f, i) => ({ ...f, n: i + 1 }));
  const left = numbered.filter((f) => f.side === "left");
  const right = numbered.filter((f) => f.side === "right");

  return (
    <section id="your-record" aria-labelledby="record-title" className="stack-card on-deep scroll-mt-20 overflow-hidden bg-deep text-on-deep">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
        <div className="max-w-2xl" data-reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">{record.eyebrow}</p>
          <h2 id="record-title" className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            {record.title}
          </h2>
          <p className="mt-4 text-on-deep-muted">{record.body}</p>
        </div>

        <div className="mt-14 grid items-center gap-10 lg:grid-cols-[1fr_auto_1fr]">
          <FieldList items={left} align="right" className="hidden lg:order-1 lg:grid" />

          <div className="relative order-1 mx-auto w-48 sm:w-56 lg:order-2 lg:w-64" data-reveal>
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative static SVG */}
            <img src="/landing/body-map.svg" alt="" width={200} height={440} loading="lazy" decoding="async" className="w-full" />
            {numbered.map((f) => (
              <span
                key={f.key}
                aria-hidden="true"
                className="absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-mint bg-deep font-mono text-xs text-mint shadow-[0_0_0_6px_rgba(127,209,174,0.12)]"
                style={{ left: `${f.x}%`, top: `${f.y}%` }}
              >
                {f.n}
              </span>
            ))}
          </div>

          <FieldList items={right} align="left" className="hidden lg:order-3 lg:grid" />
          {/* Below lg: one list in number order (the split lists above are display:none, so not read twice). */}
          <FieldList items={numbered} align="left" className="order-2 grid sm:grid-cols-2 lg:hidden" />
        </div>

        <p className="mt-12 text-center text-sm text-on-deep-muted">{record.footnote}</p>
      </div>
    </section>
  );
}

function FieldList({
  items,
  align,
  className,
}: {
  items: { key: string; label: string; note: string; n: number }[];
  align: "left" | "right";
  className: string;
}) {
  return (
    <ul className={`gap-3 ${className}`}>
      {items.map((f) => (
        <li key={f.key} data-reveal>
          <a
            href={fieldLink[f.key]}
            className={`group flex items-start gap-3 rounded-2xl border border-deep-line bg-deep-raised p-4 transition-colors hover:border-mint ${align === "right" ? "lg:flex-row-reverse lg:text-right" : ""}`}
          >
            <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full border border-mint font-mono text-xs text-mint">
              {f.n}
            </span>
            <span>
              <span className="block font-semibold text-on-deep group-hover:text-mint">{f.label}</span>
              <span className="block text-sm text-on-deep-muted">{f.note}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
