"use client";

import { useEffect, useState } from "react";
import { SectionHeading } from "@/components/SectionHeading";
import { features, type FeatureKey } from "./content";
import { FeaturePreview } from "./FeaturePreviews";

/*
 * Accordion (one open at a time) + Manifold's sticky-preview pattern on large screens.
 * Below lg the preview renders inside the open panel instead. Previews are decorative (aria-hidden):
 * the panel text carries the meaning. Links to #feature-<key> open that panel.
 */
export function Features() {
  const [open, setOpen] = useState<FeatureKey>(features[0].key);

  useEffect(() => {
    const fromHash = () => {
      const key = location.hash.replace("#feature-", "") as FeatureKey;
      if (features.some((f) => f.key === key)) setOpen(key);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  return (
    <section aria-labelledby="features-title" className="stack-card bg-wash">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
        <SectionHeading id="features-title" eyebrow="Features" title="Small, clear tools for each step." />

        <div className="mt-12 grid gap-10 lg:grid-cols-2 lg:gap-16">
          <ul className="divide-y divide-line border-y border-line">
            {features.map((f) => {
              const isOpen = open === f.key;
              return (
                <li key={f.key} id={`feature-${f.key}`} className="scroll-mt-24">
                  <h3>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`feature-panel-${f.key}`}
                      onClick={() => setOpen(f.key)}
                      className="flex min-h-14 w-full items-center justify-between gap-4 py-4 text-left text-lg font-semibold tracking-tight hover:text-brand"
                    >
                      {f.title}
                      <span aria-hidden="true" className={`grid size-8 shrink-0 place-items-center rounded-full border border-line transition-transform duration-300 ${isOpen ? "rotate-45 border-brand text-brand" : ""}`}>
                        <svg width="12" height="12" viewBox="0 0 12 12">
                          <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.6" />
                        </svg>
                      </span>
                    </button>
                  </h3>
                  <div id={`feature-panel-${f.key}`} hidden={!isOpen} className="pb-6">
                    <p className="max-w-xl text-muted">{f.body}</p>
                    <div className="mt-5 lg:hidden" aria-hidden="true">
                      <FeaturePreview k={f.key} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="hidden lg:block" aria-hidden="true">
            <div className="sticky top-28">
              <div key={open} className="animate-[fade-up_400ms_var(--ease-out-soft)_both] rounded-[28px] border border-line bg-paper p-5 shadow-[0_20px_60px_rgba(24,61,53,0.08)]">
                <FeaturePreview k={open} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
