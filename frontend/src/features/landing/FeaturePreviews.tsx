import type { FeatureKey } from "./content";

/*
 * Small static rebuilds of prototype UI states. Decorative (aria-hidden by the caller); every value is
 * fictional, and codes show only their last digits, as the plan requires on operational screens.
 */
export function FeaturePreview({ k }: { k: FeatureKey }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-wash p-4 sm:p-5">
      <p className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-soft px-2 py-1 text-[11px] font-medium text-brand">
        <span className="size-1.5 rounded-full bg-brand" /> Illustration · fictional data
      </p>
      {previews[k]}
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between gap-4 border-b border-line/70 py-2 text-[13px] last:border-0">
    <span className="text-muted">{k}</span>
    <span className="text-right">{v}</span>
  </div>
);

const Check = ({ label, on }: { label: string; on: boolean }) => (
  <div className="flex items-center gap-2 py-1 text-[13px]">
    <span className={`grid size-4 place-items-center rounded border ${on ? "border-brand bg-brand text-white" : "border-line bg-paper"}`}>
      {on && (
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="m2 5 2 2 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" />
        </svg>
      )}
    </span>
    {label}
  </div>
);

const previews: Record<FeatureKey, React.ReactNode> = {
  assistant: (
    <div className="grid gap-3 text-[13px]">
      <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-[#e4eee7] px-3.5 py-2.5">Find child care near Ikeja</p>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">HealthAccess</p>
        <p className="mt-1">These directory results offer child health near Ikeja.</p>
        <div className="mt-2 rounded-xl border border-line bg-paper p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] text-muted">Closest suitable result</p>
              <p className="font-semibold">Demo Community Hospital</p>
            </div>
            <span className="whitespace-nowrap text-xs text-brand">Approx. 2.4 km</span>
          </div>
          <p className="mt-1.5 text-xs text-muted">Child health · 12 Example Road, Ikeja</p>
          <p className="mt-1 text-[11px] text-muted">Distance from the area centre, not driving distance.</p>
        </div>
      </div>
    </div>
  ),
  find: (
    <div className="grid gap-3 text-[13px]">
      <label className="grid gap-1 font-medium">
        Service
        <span className="rounded-lg border border-line bg-paper px-3 py-2 font-normal">Maternity care</span>
      </label>
      <label className="grid gap-1 font-medium">
        Area or landmark
        <span className="rounded-lg border border-line bg-paper px-3 py-2 font-normal">Yaba</span>
      </label>
      <p className="rounded-lg bg-warn px-3 py-2 text-xs text-[#755024]">Location permission denied. Searching by the area you typed instead.</p>
      <span className="justify-self-start rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white">Find suitable care</span>
    </div>
  ),
  summary: (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Check label="Name" on={false} />
        <Check label="Allergies" on />
        <Check label="Medications" on={false} />
        <Check label="Blood group" on />
        <Check label="Contact name" on />
        <Check label="Contact phone" on={false} />
      </div>
      <div className="rounded-xl bg-[#f2f7f0] p-3">
        <p className="text-[11px] text-muted">What a code lookup reveals</p>
        <Row k="Allergies" v="Penicillin" />
        <Row k="Blood group" v="O+" />
        <Row k="Contact name" v="Chika" />
      </div>
    </div>
  ),
  grant: (
    <div className="rounded-xl bg-[#edf6ec] p-4 text-[13px]">
      <span className="rounded-md bg-soft px-2 py-1 text-[11px] font-medium text-brand">Read-only access created</span>
      <p className="mt-3 font-mono text-xl font-semibold tracking-[0.15em]">4821 0937</p>
      <p className="mt-1 text-xs text-muted">Shown once. The recipient also needs your patient code.</p>
      <Row k="Fields" v="Medications, Conditions" />
      <Row k="Channels" v="Practitioner portal · USSD" />
      <Row k="Expires" v="in 1 hour" />
      <div className="mt-3 flex gap-2">
        <span className="rounded-full border border-line bg-paper px-3 py-1.5 text-xs">Copy code</span>
        <span className="rounded-full border border-line bg-paper px-3 py-1.5 text-xs text-error">Revoke access</span>
      </div>
    </div>
  ),
  log: (
    <div className="text-[13px]">
      {[
        ["Web lookup", "Allowed", "Allergies, Contact name", "10:42"],
        ["USSD", "Allowed", "Medications", "09:15"],
        ["Practitioner portal", "Denied: grant revoked", "No fields shown", "08:03"],
      ].map(([ch, res, f, t]) => (
        <div key={t} className="border-b border-line/70 py-2.5 last:border-0">
          <div className="flex justify-between gap-3">
            <span className="font-semibold">
              {ch} · {res}
            </span>
            <span className="text-xs text-muted">{t}</span>
          </div>
          <p className="text-xs text-muted">{f}</p>
        </div>
      ))}
    </div>
  ),
  practitioner: (
    <div className="grid gap-3 text-[13px]">
      <label className="grid gap-1 font-medium">
        Patient code
        <span className="rounded-lg border border-line bg-paper px-3 py-2 font-mono font-normal tracking-widest">•••• •••• 9054</span>
      </label>
      <label className="grid gap-1 font-medium">
        Temporary access code
        <span className="rounded-lg border border-line bg-paper px-3 py-2 font-mono font-normal tracking-widest">•••• 0937</span>
      </label>
      <div className="rounded-xl border border-line bg-paper p-3">
        <p className="text-[11px] text-muted">Read-only · session ends with the grant</p>
        <Row k="Medications" v="Demo medication entry" />
        <Row k="Conditions" v="Demo condition entry" />
      </div>
    </div>
  ),
};
