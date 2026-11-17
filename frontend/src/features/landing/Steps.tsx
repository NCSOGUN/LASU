"use client";

import { useEffect, useRef, useState } from "react";
import { steps } from "./content";
import { Phone } from "./Phone";
import { PhoneScreen } from "./PhoneScreens";

const icons = [
  "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  "M4 6h16M4 12h10M4 18h6",
  "M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z",
  "M8 11V8a4 4 0 0 1 8 0v3M6 11h12v9H6z",
  "M5 5l14 14M19 5 5 19",
];

/*
 * Template scrollytelling: step list on the left, a sticky phone on the right whose screen follows the step
 * nearest the middle of the viewport. Below lg there is no sticky phone; each step shows its own screen.
 */
export function Steps() {
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-step]") ?? []);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <section id="how-it-works" aria-labelledby="steps-title" className="scroll-mt-20 py-10 sm:py-16">
      <h2 id="steps-title" className="sr-only">
        How it works
      </h2>
      <div className="mx-auto grid max-w-5xl gap-10 px-5 lg:grid-cols-[1fr_320px] lg:gap-20">
        <ol ref={listRef}>
          {steps.map((s, i) => {
            const on = active === i;
            return (
              <li key={s.key} data-step={i} className="flex min-h-[46vh] flex-col justify-center py-8 lg:min-h-[62vh]">
                <div className="flex items-start gap-4">
                  <span
                    aria-hidden="true"
                    className={`mt-1 grid size-11 shrink-0 place-items-center rounded-full border transition-colors duration-500 ${on ? "border-mint/50 bg-mint/10 text-mint shadow-[0_0_24px_-4px_rgba(127,209,174,0.6)]" : "border-white/10 text-fog-muted lg:text-fog-dim"}`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d={icons[i]} />
                    </svg>
                  </span>
                  <div>
                    <h3 className={`font-head text-[clamp(1.6rem,3.4vw,2.4rem)] font-semibold leading-[1.1] tracking-[-0.03em] transition-colors duration-500 ${on ? "text-fog" : "text-fog lg:text-fog-dim"}`}>
                      {s.title}
                    </h3>
                    <p className={`mt-3 max-w-md text-[15px] transition-colors duration-500 ${on ? "text-fog-muted" : "text-fog-muted lg:text-fog-dim"}`}>{s.body}</p>
                  </div>
                </div>
                <div aria-hidden="true" className="mt-6 h-[340px] overflow-hidden rounded-[1.6rem] border border-white/[0.06] bg-[#0a1112] lg:hidden">
                  <PhoneScreen k={s.key} />
                </div>
              </li>
            );
          })}
        </ol>

        <div aria-hidden="true" className="hidden lg:block">
          <div className="sticky top-[calc(50vh-320px)]">
            <Phone>
              <PhoneScreen k={steps[active].key} />
            </Phone>
          </div>
        </div>
      </div>
    </section>
  );
}
