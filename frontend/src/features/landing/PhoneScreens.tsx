import type { ScreenKey } from "./content";

/*
 * Dark-mode rebuilds of prototype states, shown inside the CSS phone. Decorative (the phone is aria-hidden);
 * all values are fictional. Codes appear only on the grant receipt, as the prototype does on issuance.
 */
const Bubble = ({ children }: { children: React.ReactNode }) => (
  <p className="ml-auto max-w-[82%] rounded-2xl rounded-br-md bg-white/[0.07] px-3 py-2 text-[11px] leading-snug text-fog">{children}</p>
);

const Glow = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-2xl border border-mint/30 bg-gradient-to-b from-mint/[0.08] to-transparent p-3 shadow-[0_0_30px_-8px_rgba(127,209,174,0.45)] ${className}`}>
    {children}
  </div>
);

const Facility = ({ name, km, tag }: { name: string; km: string; tag: string }) => (
  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5">
    <div className="flex items-start justify-between gap-2">
      <p className="text-[11px] font-semibold text-fog">{name}</p>
      <span className="whitespace-nowrap text-[10px] text-mint">≈ {km} km</span>
    </div>
    <p className="mt-0.5 text-[9.5px] text-fog-muted">{tag}</p>
  </div>
);

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between gap-3 border-b border-white/[0.06] py-1.5 text-[10.5px] last:border-0">
    <span className="text-fog-muted">{k}</span>
    <span className="text-right text-fog">{v}</span>
  </div>
);

const Toggle = ({ label, on }: { label: string; on: boolean }) => (
  <div className="flex items-center justify-between py-1.5 text-[11px] text-fog">
    {label}
    <span className={`flex h-4 w-7 items-center rounded-full p-0.5 ${on ? "justify-end bg-mint" : "bg-white/10"}`}>
      <span className={`size-3 rounded-full ${on ? "bg-night" : "bg-fog-muted"}`} />
    </span>
  </div>
);

const Composer = () => (
  <div className="absolute inset-x-3 bottom-2 flex items-center justify-between rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] text-fog-muted">
    Tell us what you need…
    <span className="grid size-5 place-items-center rounded-full bg-mint text-[10px] font-bold text-night">↑</span>
  </div>
);

const screens: Record<ScreenKey, React.ReactNode> = {
  ask: (
    <div className="flex h-full flex-col gap-2.5 p-3 pb-14">
      <Bubble>Find child care near Ikeja</Bubble>
      <Glow>
        <p className="text-[10.5px] leading-snug text-fog">
          Here are facilities in the directory that offer <b className="text-mint">child health</b> near Ikeja.
        </p>
        <div className="mt-2.5 grid gap-1.5">
          <Facility name="Demo Community Hospital" km="2.4" tag="Child health · 12 Example Road" />
          <Facility name="Demo Specialist Hospital" km="5.2" tag="Child health · 25 Illustration Way" />
        </div>
        <p className="mt-2 text-[9px] text-fog-muted">Distance from the area centre, not driving distance.</p>
      </Glow>
      <Composer />
    </div>
  ),
  match: (
    <div className="flex h-full flex-col gap-2 p-3">
      <p className="text-[10px] uppercase tracking-wider text-fog-muted">Maternity care · Yaba</p>
      {[
        ["Demo Family & Maternity Centre", "2.1", "Closest suitable result"],
        ["Demo Specialist Hospital", "4.4", "Lists maternity care"],
      ].map(([n, k, t]) => (
        <Glow key={n} className="!p-2.5">
          <Facility name={n} km={k} tag={t} />
        </Glow>
      ))}
      <div className="rounded-xl border border-dashed border-white/10 p-2.5 text-[10px] text-fog-muted">
        Demo Community Hospital is closer but is not listed for maternity care, so it is not shown.
      </div>
    </div>
  ),
  summary: (
    <div className="flex h-full flex-col gap-2 p-3">
      <p className="text-[10px] uppercase tracking-wider text-fog-muted">Emergency visibility</p>
      <div className="rounded-xl bg-white/[0.03] px-3 py-1">
        <Toggle label="Allergies" on />
        <Toggle label="Medications" on={false} />
        <Toggle label="Blood group" on />
        <Toggle label="Contact name" on />
        <Toggle label="Contact phone" on={false} />
      </div>
      <Glow>
        <p className="mb-1 text-[9.5px] text-fog-muted">What a code lookup reveals</p>
        <Row k="Allergies" v="Penicillin" />
        <Row k="Blood group" v="O+" />
        <Row k="Contact name" v="Chika" />
      </Glow>
    </div>
  ),
  share: (
    <div className="flex h-full flex-col gap-2 p-3">
      <p className="text-[10px] uppercase tracking-wider text-fog-muted">Temporary access</p>
      <Glow>
        <span className="rounded-md bg-mint/15 px-1.5 py-0.5 text-[9px] font-medium text-mint">Read-only access created</span>
        <p className="mt-2.5 font-mono text-xl font-semibold tracking-[0.18em] text-fog">4821 0937</p>
        <p className="text-[9.5px] text-fog-muted">Shown once. The recipient also needs your patient code.</p>
        <div className="mt-2">
          <Row k="Fields" v="Medications, Conditions" />
          <Row k="Channels" v="Practitioner · USSD" />
          <Row k="Expires" v="in 1 hour" />
        </div>
      </Glow>
      <div className="flex gap-1.5 text-[10px]">
        <span className="flex-1 rounded-full bg-white/[0.06] py-1.5 text-center text-fog">Copy code</span>
        <span className="flex-1 rounded-full border border-[#e08a8a]/40 py-1.5 text-center text-[#f0b0b0]">Revoke</span>
      </div>
    </div>
  ),
  revoke: (
    <div className="flex h-full flex-col gap-2 p-3">
      <p className="text-[10px] uppercase tracking-wider text-fog-muted">Access log</p>
      {[
        ["Practitioner portal", "Denied · grant revoked", "No fields shown", "11:02", false],
        ["Web lookup", "Allowed", "Allergies, Contact name", "10:42", true],
        ["USSD", "Allowed", "Medications", "09:15", true],
      ].map(([ch, res, f, t, ok]) => (
        <div key={String(t)} className={`rounded-xl border p-2.5 ${ok ? "border-white/[0.06] bg-white/[0.03]" : "border-amber/40 bg-amber/[0.06]"}`}>
          <div className="flex justify-between text-[10.5px]">
            <span className="font-semibold text-fog">{ch}</span>
            <span className="text-fog-muted">{t}</span>
          </div>
          <p className={`text-[10px] ${ok ? "text-mint" : "text-amber"}`}>{res}</p>
          <p className="text-[9.5px] text-fog-muted">{f}</p>
        </div>
      ))}
    </div>
  ),
};

export function PhoneScreen({ k }: { k: ScreenKey }) {
  return (
    <div key={k} className="swap-in h-full">
      {screens[k]}
    </div>
  );
}
