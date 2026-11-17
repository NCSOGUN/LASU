import { SectionHeading } from "@/components/SectionHeading";
import { trust } from "./content";

const icons = [
  <path key="fields" d="M4 6h10M4 11h10M4 16h6m6-3 2 2 4-4" />,
  <path key="grant" d="M12 4a8 8 0 1 0 8 8M12 8v4l3 2m3-10v4h-4" />,
  <path key="log" d="M6 4h10l3 3v13H6zM9 10h7M9 14h7M9 18h4" />,
  <path key="ai" d="M5 11h14v9H5zM8 11V8a4 4 0 0 1 8 0v3m-4 4v2" />,
];

export function Trust() {
  return (
    <section id="trust" aria-labelledby="trust-title" className="stack-card on-deep scroll-mt-20 bg-deep text-on-deep">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
        <SectionHeading id="trust-title" eyebrow={trust.eyebrow} title={trust.title} tone="deep" />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {trust.items.map((t, i) => (
            <li key={t.title} className="rounded-[var(--radius-card)] border border-deep-line bg-deep-raised p-6" data-reveal>
              <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-mint">
                {icons[i]}
              </svg>
              <h3 className="mt-5 font-semibold">{t.title}</h3>
              <p className="mt-2 text-sm text-on-deep-muted">{t.body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8 max-w-3xl text-sm text-on-deep-muted">{trust.caveat}</p>
      </div>
    </section>
  );
}
