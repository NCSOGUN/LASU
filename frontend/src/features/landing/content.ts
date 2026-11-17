/*
 * All landing copy lives here (D5: English only, strings centralised for later translation).
 * Honesty rules: no invented statistics, partners or testimonials; nothing beyond Release 1 (plan §1);
 * every demo value is fictional and labelled as such.
 */

export const nav = {
  links: [
    { href: "#how-it-works", label: "How it works" },
    { href: "#your-record", label: "Your record" },
    { href: "#channels", label: "Channels" },
    { href: "#trust", label: "Trust" },
    { href: "#roadmap", label: "Roadmap" },
  ],
  cta: { href: "/assistant", label: "Open the assistant" },
};

export const hero = {
  headline: ["Care within reach.", "Your health information, on your terms."],
  slides: [
    {
      id: "ask",
      title: "Ask for care",
      body: "Describe what you need. We match it to facilities in the directory that list that service, nearest first.",
      link: { href: "/assistant", label: "Ask the assistant" },
    },
    {
      id: "summary",
      title: "Emergency summary",
      body: "Choose the fields anyone with your patient code can see, and preview exactly what they will get.",
      link: { href: "#your-record", label: "See what you control" },
    },
    {
      id: "access",
      title: "Temporary access",
      body: "Give a verified practitioner a short-lived, read-only code for extra details. Revoke it any time.",
      link: { href: "#how-it-works", label: "How sharing works" },
    },
  ],
  slideMs: 6500,
  secondary: { href: "/lookup", label: "Look up an emergency summary" },
};

export const problem = {
  eyebrow: "The problem",
  title: "The right care is often close by. Finding it, and being understood when you arrive, is the hard part.",
  points: [
    {
      title: "Finding suitable care is guesswork",
      body: "People often cannot tell which nearby facility offers the service they need, so they lose time travelling to the wrong place.",
      // [SOURCE NEEDED] Any figure on travel to unsuitable facilities must cite a published source before it is shown.
    },
    {
      title: "Critical details go missing",
      body: "Allergies, current medications and an emergency contact are rarely to hand for whoever is helping, at the moment they matter most.",
      // [SOURCE NEEDED] No statistic is shown here until a source is supplied.
    },
    {
      title: "Not everyone has mobile data",
      body: "A service that only works in a browser leaves out people on basic phones. Access has to work over SMS and USSD too.",
      // [SOURCE NEEDED] Any mobile-data or feature-phone share figure needs a cited source.
    },
  ],
};

export const steps = [
  {
    key: "ask",
    title: "Ask",
    body: "Type what you need in your own words, or pick a service and area. With no location, we ask a short question instead of guessing.",
  },
  {
    key: "match",
    title: "Match",
    body: "Facilities are filtered by the service they list, then ranked by approximate distance. Results come from the directory, never invented by the AI.",
  },
  {
    key: "share",
    title: "Share",
    body: "You choose which fields go in your emergency summary, and create a temporary code for anything extra. Nothing is shared until you confirm.",
  },
  {
    key: "revoke",
    title: "Revoke",
    body: "Revoke a code or let it expire, and later reads are blocked. Every read is logged so you can see who looked, through which channel and when.",
  },
] as const;

export const record = {
  eyebrow: "Your record",
  title: "You decide what each field is for.",
  body: "Each field is private until you choose to share it. Pick some for your emergency summary, and grant others for a limited time.",
  fields: [
    // x/y: anchor on the figure in % of its box (figure space 200x440). side: which column the label sits in.
    { key: "full_name", label: "Name and date of birth", note: "Who the record belongs to", x: 50, y: 9, side: "left" },
    { key: "allergies", label: "Allergies", note: "Often the first thing to check", x: 50, y: 19, side: "right" },
    { key: "conditions", label: "Health conditions", note: "Shared only if you choose", x: 46, y: 34, side: "left" },
    { key: "blood_group", label: "Blood group", note: "Optional emergency field", x: 72, y: 40, side: "right" },
    { key: "current_medications", label: "Current medications", note: "Read-only, current values", x: 15, y: 56, side: "left" },
    { key: "emergency_contact", label: "Emergency contact", note: "Name and phone shared separately", x: 85, y: 56, side: "right" },
  ],
  footnote: "Selecting a hospital never sends it your record.",
} as const;

export type FeatureKey = "assistant" | "find" | "summary" | "grant" | "log" | "practitioner";

export const features: { key: FeatureKey; title: string; body: string }[] = [
  {
    key: "assistant",
    title: "A health assistant that shows, not just tells",
    body: "Ask in plain language. Answers come back as clear cards: a short question when something is unclear, or suitable facilities with distance and contact where the directory lists them.",
  },
  {
    key: "find",
    title: "Find care without chatting",
    body: "Prefer a form? Choose a service and an area or landmark. If location permission is denied, typing an area works just as well.",
  },
  {
    key: "summary",
    title: "Emergency summary you can preview",
    body: "Tick the fields to include and see exactly what a code lookup will show before you save. An empty selection turns sharing off.",
  },
  {
    key: "grant",
    title: "Temporary, read-only access",
    body: "Pick extra fields, the channels allowed and how long access lasts: 15 minutes to 24 hours. The code is shown once, and the recipient also needs your patient code.",
  },
  {
    key: "log",
    title: "An access log you can read",
    body: "See every lookup: the channel, the time, which field names were shown, and whether it was allowed. Values and codes are never stored in the log.",
  },
  {
    key: "practitioner",
    title: "For verified practitioners",
    body: "An approved practitioner enters both codes to open a short read session. Each read checks the grant again, so a revoked code stops working at once.",
  },
];

export const channels = {
  eyebrow: "Channels",
  title: "One service. Web, SMS and USSD.",
  body: "SMS and USSD work on basic phones over the cellular network, without mobile data. They need signal, not internet.",
  pillars: [
    {
      key: "web",
      name: "Web",
      body: "The full assistant, find-care form and patient portal, built to stay light on mid-range phones.",
    },
    {
      key: "sms",
      name: "SMS",
      body: "Send FIND, LOOKUP or a question. Facility details come back by text. Extra record fields are never sent by SMS.",
    },
    {
      key: "ussd",
      name: "USSD",
      body: "A guided menu for finding care and reading an emergency summary, page by page.",
    },
  ],
  later: { name: "Voice", note: "Later release" },
  simNote: "Simulation · fictional data · not a live dial code",
} as const;

export const trust = {
  eyebrow: "Trust",
  title: "Built so you stay in control.",
  items: [
    { title: "Fields you choose", body: "New fields are private by default. Your emergency summary contains only what you tick." },
    { title: "Grants that end", body: "Every temporary code has an expiry and can be revoked. Revoking blocks later reads." },
    { title: "Every read logged", body: "Each lookup records the channel, time, field names and outcome. You can review it at any time." },
    { title: "Codes stay out of the AI", body: "Patient and access codes are never sent to the AI provider. Record reads never go through the AI." },
  ],
  caveat:
    "Revoking cannot undo what someone has already seen or copied. HealthAccess gives general information and care navigation. It does not diagnose, prescribe or book appointments.",
};

export const roadmap = {
  eyebrow: "Roadmap",
  title: "What Release 1 includes, and what it does not.",
  release1: [
    "Web assistant with structured answer cards",
    "Find care by service and area, with list results",
    "Patient portal: profile, emergency summary, access log",
    "Temporary read-only grants with revocation",
    "Verified practitioner lookup",
    "SMS and USSD access through the offline service",
  ],
  later: ["Real-time voice access, after telecom audio checks"],
  separate: ["Clinical document upload", "Prescribing", "Appointment booking", "Hospital EHR integration"],
};

export const finalCta = {
  title: "Find suitable care, and share only what you choose.",
  primary: { href: "/assistant", label: "Open the assistant" },
  secondary: { href: "/lookup", label: "Look up an emergency summary" },
};

export const footer = {
  links: [
    { href: "/assistant", label: "Assistant" },
    { href: "/find-care", label: "Find care" },
    { href: "/lookup", label: "Emergency lookup" },
    { href: "/login", label: "Sign in" },
  ],
  emergency: "In an emergency, seek local emergency care immediately. Do not wait for a chat or message reply.",
  demo: "Facility names, addresses, codes and records shown on this site are fictional.",
};
