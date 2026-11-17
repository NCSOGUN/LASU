export function SectionHeading({
  id,
  eyebrow,
  title,
  body,
  tone = "light",
  className = "",
}: {
  id: string;
  eyebrow: string;
  title: string;
  body?: string;
  tone?: "light" | "deep";
  className?: string;
}) {
  const deep = tone === "deep";
  return (
    <div className={`max-w-2xl ${className}`} data-reveal>
      <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${deep ? "text-mint" : "text-brand"}`}>{eyebrow}</p>
      <h2 id={id} className={`mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl ${deep ? "text-on-deep" : "text-ink"}`}>
        {title}
      </h2>
      {body && <p className={`mt-4 text-base ${deep ? "text-on-deep-muted" : "text-muted"}`}>{body}</p>}
    </div>
  );
}
