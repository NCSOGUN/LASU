import Link from "next/link";

/** Brand mark from the prototype: a "+" in a rounded brand square. */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`grid size-8 place-items-center rounded-[10px] bg-brand text-white ${className}`}>
      <svg width="14" height="14" viewBox="0 0 14 14">
        <path d="M5.5 0h3v5.5H14v3H8.5V14h-3V8.5H0v-3h5.5z" fill="currentColor" />
      </svg>
    </span>
  );
}

export function Logo({ tone = "ink" }: { tone?: "ink" | "light" }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 text-lg font-semibold tracking-tight ${tone === "light" ? "text-on-deep" : "text-ink"}`}>
      <BrandMark />
      HealthAccess
    </Link>
  );
}
