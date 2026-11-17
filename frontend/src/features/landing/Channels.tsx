"use client";

import { useEffect, useRef, useState } from "react";
import { SectionHeading } from "@/components/SectionHeading";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import { channels } from "./content";

/*
 * D3: scripted, fictional simulations of each channel (scripts follow the prototype and Plan 2 menus).
 * They play only while visible, can be paused (WCAG 2.2.2), and show their final state under reduced motion.
 * The animated mocks are aria-hidden; each pillar has an sr-only description of the same exchange.
 */
const STEP_MS = 1500;
const HOLD_MS = 3500;

type Line = { from: "user" | "bot"; text: string };

const webScript: Line[] = [
  { from: "user", text: "I need maternity care" },
  { from: "bot", text: "Which area should I search?  [Ikeja] [Yaba] [Lekki]" },
  { from: "user", text: "Yaba" },
  { from: "bot", text: "Demo Family & Maternity Centre · Approx. 2.1 km from Yaba centre" },
];
const smsScript: Line[] = [
  { from: "user", text: "FIND child health near Ikeja" },
  { from: "bot", text: "Demo Community Hospital, 12 Example Road, Ikeja (fictional). Approx. 2.4 km from area centre. Contact not listed. Reply MORE." },
  { from: "user", text: "LOOKUP •••• •••• 9054" },
  { from: "bot", text: "Emergency summary: Allergies: Penicillin; Contact name: Chika" },
];
const ussdScreens = [
  "CON HealthAccess\n1. Find nearby care\n2. Emergency summary\n3. View shared details\n0. Exit",
  "CON Choose care\n1. General care\n2. Child health\n3. Maternity care\n4. Dental care",
  "CON Enter area or landmark:\n> Ikeja",
  "CON Demo Community Hospital\n12 Example Road, Ikeja\nApprox. 2.4 km (demo)\n1. Next  2. Send SMS  0. Exit",
];

const srText = {
  web: "Example: a user asks for maternity care, is asked which area, chooses Yaba, and sees a fictional facility about 2.1 km from the area centre.",
  sms: "Example: texting FIND child health near Ikeja returns one fictional facility with approximate distance; texting LOOKUP with a patient code returns the selected emergency fields.",
  ussd: "Example: the USSD menu offers find care, emergency summary and shared details; choosing child health and Ikeja shows a fictional facility.",
};

function useStep(count: number, running: boolean, reduced: boolean) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (reduced || !running) return;
    const t = setTimeout(() => setStep((s) => (s + 1) % count), step === count - 1 ? HOLD_MS : STEP_MS);
    return () => clearTimeout(t);
  }, [step, running, reduced, count]);
  return reduced ? count - 1 : step;
}

export function Channels() {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(false);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const running = visible && !paused;
  const web = useStep(webScript.length, running, reduced);
  const sms = useStep(smsScript.length, running, reduced);
  const ussd = useStep(ussdScreens.length, running, reduced);

  return (
    <section ref={ref} id="channels" aria-labelledby="channels-title" className="stack-card scroll-mt-20 bg-paper">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeading id="channels-title" eyebrow={channels.eyebrow} title={channels.title} body={channels.body} />
          {!reduced && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="min-h-11 rounded-full border border-line px-4 text-sm font-medium text-ink hover:bg-soft"
            >
              {paused ? "Play simulations" : "Pause simulations"}
            </button>
          )}
        </div>

        <ul className="mt-12 grid gap-5 md:grid-cols-3">
          {channels.pillars.map((p) => (
            <li key={p.key} className="flex flex-col rounded-[var(--radius-card)] border border-line bg-wash p-5 sm:p-6" data-reveal>
              <h3 className="text-xl font-semibold tracking-tight">{p.name}</h3>
              <p className="mt-2 text-sm text-muted">{p.body}</p>
              <p className="sr-only">{srText[p.key]}</p>
              <div aria-hidden="true" className="mt-6 flex-1">
                {p.key === "web" && <ChatMock lines={webScript} step={web} />}
                {p.key === "sms" && <SmsMock lines={smsScript} step={sms} />}
                {p.key === "ussd" && <UssdMock screen={ussdScreens[ussd]} />}
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-muted">{channels.simNote}</p>
          <p className="inline-flex items-center gap-2 rounded-full border border-dashed border-line px-4 py-2 text-muted">
            <span className="font-semibold text-ink">{channels.later.name}</span>
            <span className="rounded-full bg-soft px-2 py-0.5 text-xs font-medium text-brand">{channels.later.note}</span>
          </p>
        </div>
      </div>
    </section>
  );
}

function ChatMock({ lines, step }: { lines: Line[]; step: number }) {
  return (
    <div className="flex h-72 flex-col rounded-2xl border border-line bg-paper">
      <div className="flex items-center gap-1.5 border-b border-line px-3 py-2">
        <span className="size-2 rounded-full bg-line" />
        <span className="size-2 rounded-full bg-line" />
        <span className="ml-2 truncate rounded bg-wash px-2 py-0.5 text-[10px] text-muted">healthaccess / assistant</span>
      </div>
      <div className="flex flex-1 flex-col justify-end gap-2 overflow-hidden p-3 text-[12px]">
        {lines.slice(0, step + 1).map((l, i) => (
          <p
            key={i}
            className={`animate-[fade-up_300ms_var(--ease-out-soft)_both] rounded-2xl px-3 py-2 ${l.from === "user" ? "ml-auto max-w-[80%] rounded-br-sm bg-[#e4eee7]" : "mr-4 rounded-bl-sm border border-line bg-wash"}`}
          >
            {l.text}
          </p>
        ))}
      </div>
    </div>
  );
}

function SmsMock({ lines, step }: { lines: Line[]; step: number }) {
  return (
    <div className="mx-auto flex h-72 max-w-[15rem] flex-col rounded-[2rem] border-[6px] border-ink bg-[#eef3ee] p-2">
      <p className="text-center text-[10px] text-muted">HealthAccess · SMS</p>
      <div className="flex flex-1 flex-col justify-end gap-1.5 overflow-hidden text-[11px]">
        {lines.slice(0, step + 1).map((l, i) => (
          <p key={i} className={`animate-[fade-up_300ms_var(--ease-out-soft)_both] rounded-xl px-2.5 py-1.5 ${l.from === "user" ? "ml-6 bg-brand text-white" : "mr-3 bg-paper"}`}>
            {l.text}
          </p>
        ))}
      </div>
    </div>
  );
}

function UssdMock({ screen }: { screen: string }) {
  return (
    <div className="mx-auto h-72 max-w-[15rem] rounded-[1.75rem] bg-[#1e332a] p-3.5">
      <div className="flex justify-between px-1 pb-2 text-[10px] text-[#afc7b7]">
        <span>USSD</span>
        <span>Cellular · data off</span>
      </div>
      <pre key={screen} className="h-[13.5rem] animate-[fade-up_300ms_var(--ease-out-soft)_both] overflow-hidden whitespace-pre-wrap rounded-md bg-[#e3ead7] p-3 font-mono text-[11px] leading-relaxed text-[#243d2f]">
        {screen}
      </pre>
    </div>
  );
}
