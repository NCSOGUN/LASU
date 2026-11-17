import Link from "next/link";
import { footer } from "./content";
import { LogoMark } from "./PillNav";

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06]">
      <div className="mx-auto grid max-w-5xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr]">
        <div>
          <Link href="/" className="inline-flex items-center gap-2 font-head text-lg font-semibold tracking-tight text-fog">
            <LogoMark />
            HealthAccess
          </Link>
          <p className="mt-4 max-w-sm text-sm text-fog-muted">{footer.blurb}</p>
        </div>
        <div className="grid grid-cols-2 gap-6 text-sm">
          <FooterNav label="Explore" links={footer.explore} />
          <FooterNav label="On this page" links={footer.page} />
        </div>
      </div>
      <div className="mx-auto flex max-w-5xl flex-col gap-2 border-t border-white/[0.06] px-5 py-6 text-xs text-fog-muted sm:flex-row sm:justify-between">
        <p className="font-medium text-fog">{footer.emergency}</p>
        <p>{footer.demo}</p>
      </div>
    </footer>
  );
}

function FooterNav({ label, links }: { label: string; links: { href: string; label: string }[] }) {
  return (
    <nav aria-label={label}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fog">{label}</p>
      <ul className="mt-3">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="inline-flex min-h-10 items-center text-fog-muted hover:text-fog">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
