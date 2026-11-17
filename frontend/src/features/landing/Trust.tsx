import { BlurText } from "./BlurText";
import { trust } from "./content";

/* Template "Go further with Plus" layout: copy + feature pairs on the left, floating glossy objects on the right.
   Release 1 scope sits underneath (plan §1, nothing added). */
const icons = [
  "M4 6h10M4 11h10M4 16h6m6-3 2 2 4-4",
  "M12 4a8 8 0 1 0 8 8M12 8v4l3 2",
  "M6 4h10l3 3v13H6zM9 10h7M9 14h7",
  "M5 11h14v9H5zM8 11V8a4 4 0 0 1 8 0v3",
];

const objects = [
  { src: "/landing/objects/shield.svg", w: 200, h: 220, className: "right-[8%] top-0 w-36 sm:w-44", delay: "0s" },
  { src: "/landing/objects/pin.svg", w: 180, h: 230, className: "left-[6%] top-[38%] w-24 sm:w-32", delay: "1.4s" },
  { src: "/landing/objects/cross.svg", w: 200, h: 200, className: "bottom-0 right-[22%] w-28 sm:w-32", delay: "2.6s" },
];

export function Trust() {
  return (
    <section id="trust" aria-labelledby="trust-title" className="scroll-mt-20 py-16 sm:py-24" data-inview>
      <div className="mx-auto max-w-5xl px-5">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <h2 id="trust-title" className="font-head text-[clamp(1.9rem,4vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-fog">
              <BlurText text={trust.title} />
            </h2>
            <p className="mt-4 max-w-md text-[15px] text-fog-muted">{trust.body}</p>
            <ul className="mt-8 grid gap-6 sm:grid-cols-2">
              {trust.items.map((t, i) => (
                <li key={t.title} className="rise" style={{ "--d": i } as React.CSSProperties}>
                  <span aria-hidden="true" className="grid size-9 place-items-center rounded-full border border-white/10 text-mint">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d={icons[i]} />
                    </svg>
                  </span>
                  <h3 className="mt-3 text-[15px] font-semibold text-fog">{t.title}</h3>
                  <p className="mt-1 text-sm text-fog-muted">{t.body}</p>
                </li>
              ))}
            </ul>
          </div>

          <div aria-hidden="true" className="relative h-[340px] sm:h-[440px]">
            <div className="absolute inset-[15%] rounded-full bg-[radial-gradient(circle,rgba(43,179,163,0.25),transparent_70%)] blur-2xl" />
            {objects.map((o) => (
              // eslint-disable-next-line @next/next/no-img-element -- decorative static SVG
              <img
                key={o.src}
                src={o.src}
                alt=""
                width={o.w}
                height={o.h}
                loading="lazy"
                className={`float absolute drop-shadow-[0_24px_40px_rgba(43,179,163,0.3)] ${o.className}`}
                style={{ "--delay": o.delay } as React.CSSProperties}
              />
            ))}
          </div>
        </div>

        <p className="mt-10 max-w-3xl text-sm text-fog-muted">{trust.caveat}</p>

        <div id="roadmap" className="mt-10 grid gap-4 rounded-[18px] border border-white/[0.05] bg-night-card p-5 text-sm sm:p-6 md:grid-cols-[1.6fr_0.6fr_1.4fr]">
          <Scope title="Release 1" items={trust.release1} tone="mint" />
          <Scope title="Later" items={trust.later} tone="dim" />
          <Scope title="Separate projects, not planned here" items={trust.separate} tone="dim" />
        </div>
      </div>
    </section>
  );
}

function Scope({ title, items, tone }: { title: string; items: string[]; tone: "mint" | "dim" }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-fog-muted">{title}</h3>
      <ul className="mt-3 flex flex-wrap gap-2">
        {items.map((i) => (
          <li key={i} className={`rounded-full border px-3 py-1 text-[13px] ${tone === "mint" ? "border-mint/30 text-mint" : "border-white/10 text-fog-muted"}`}>
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}
