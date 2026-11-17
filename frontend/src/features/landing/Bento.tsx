import { BlurText } from "./BlurText";
import { bento } from "./content";
import { Globe } from "./Globe";

/* Template "Think smarter, together" bento, mapped to HealthAccess capabilities. Card visuals are decorative. */
const card = "rise relative overflow-hidden rounded-[18px] border border-white/[0.05] bg-night-card p-5 sm:p-6";

const pins = [
  { top: "14%", left: "18%", d: "0s" },
  { top: "22%", left: "78%", d: "1.2s" },
  { top: "62%", left: "10%", d: "2.1s" },
  { top: "70%", left: "84%", d: "0.6s" },
  { top: "40%", left: "90%", d: "1.6s" },
];

export function Bento() {
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-20 py-20 sm:py-28" data-inview>
      <div className="mx-auto max-w-5xl px-5">
        <h2 id="features-title" className="text-center font-head text-[clamp(2rem,5vw,4rem)] font-semibold leading-none tracking-[-0.04em] text-fog">
          <BlurText text={bento.title} />
        </h2>

        <div className="mt-12 grid gap-4 md:grid-cols-3 md:grid-rows-[auto_auto]">
          {/* Threads */}
          <article className={card} style={{ "--d": 0 } as React.CSSProperties}>
            <h3 className="font-head text-lg font-semibold text-fog">{bento.threads.title}</h3>
            <p className="mt-1.5 text-sm text-fog-muted">{bento.threads.body}</p>
            <ul aria-hidden="true" className="mt-5 grid gap-2">
              {bento.threads.items.map((t, i) => (
                <li
                  key={t.name}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${i === 0 ? "border border-mint/40 bg-mint/[0.06] shadow-[0_0_24px_-6px_rgba(127,209,174,0.5)]" : ""}`}
                  style={{ opacity: [1, 0.7, 0.4][i] }}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/[0.06] text-[11px] text-mint">+</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-fog">{t.name}</span>
                    <span className="block truncate text-[11.5px] text-fog-muted">{t.preview}</span>
                  </span>
                </li>
              ))}
            </ul>
          </article>

          {/* Emergency summary + glossy cross */}
          <article className={`${card} flex flex-col justify-end`} style={{ "--d": 1 } as React.CSSProperties}>
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative static SVG */}
            <img src="/landing/objects/cross.svg" alt="" aria-hidden="true" width={150} height={150} loading="lazy" className="float mx-auto mb-4 w-32 drop-shadow-[0_20px_40px_rgba(43,179,163,0.35)] sm:w-36" />
            <h3 className="font-head text-lg font-semibold text-fog">{bento.summary.title}</h3>
            <p className="mt-1.5 text-sm text-fog-muted">{bento.summary.body}</p>
          </article>

          {/* Directory globe (tall) */}
          <article className={`${card} md:row-span-2`} style={{ "--d": 2 } as React.CSSProperties}>
            <h3 className="font-head text-lg font-semibold text-fog">{bento.directory.title}</h3>
            <p className="mt-1.5 text-sm text-fog-muted">{bento.directory.body}</p>
            <div aria-hidden="true" className="relative mx-auto mt-8 grid aspect-square w-full max-w-[280px] place-items-center">
              <div className="absolute inset-[18%] rounded-full bg-[radial-gradient(circle,rgba(43,179,163,0.45),rgba(215,151,56,0.12)_55%,transparent_70%)] blur-xl" />
              <Globe size={190} className="relative" />
              {pins.map((p) => (
                <span
                  key={p.left}
                  className="float absolute grid size-8 place-items-center rounded-full border border-white/10 bg-night-raised text-xs font-bold text-mint shadow-[0_0_20px_-4px_rgba(127,209,174,0.6)]"
                  style={{ top: p.top, left: p.left, "--delay": p.d } as React.CSSProperties}
                >
                  +
                </span>
              ))}
            </div>
          </article>

          {/* Find-care form (wide) */}
          <article className={`${card} grid items-center gap-5 md:col-span-2 md:grid-cols-[1.3fr_1fr]`} style={{ "--d": 3 } as React.CSSProperties}>
            <div aria-hidden="true">
              <div className="flex items-center justify-between rounded-full border border-mint/40 bg-white/[0.03] px-4 py-3 text-[13px] text-fog shadow-[0_0_30px_-8px_rgba(127,209,174,0.5)]">
                {bento.ask.placeholder}
                <span className="grid size-7 place-items-center rounded-full bg-mint text-night">↑</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
                {["Child health", "Maternity care", "General care", "Dental care"].map((s) => (
                  <span key={s} className="rounded-full border border-white/10 px-3 py-1.5 text-fog-muted">
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-head text-lg font-semibold text-fog">{bento.ask.title}</h3>
              <p className="mt-1.5 text-sm text-fog-muted">{bento.ask.body}</p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
