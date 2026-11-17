/*
 * All landing copy lives here (D5: English only, strings centralised for later translation).
 * Honesty rules: no invented statistics, partners or testimonials; nothing beyond Release 1 (plan §1);
 * every demo value is fictional and labelled as such.
 */

export const nav = {
  links: [
    { href: "#features", label: "Features" },
    { href: "#how-it-works", label: "How it works" },
    { href: "#channels", label: "Channels" },
    { href: "#trust", label: "Trust" },
  ],
  cta: { href: "/assistant", label: "Open the assistant" },
};

export const hero = {
  // Two lines of equal weight, as in the reference template ("Think Out Loud, / Beautifully Heard").
  headline: ["Care Within Reach,", "Wherever You Are"],
  body: "Find suitable care nearby, keep a short emergency summary ready, and choose exactly who can read anything more, for how long.",
  primary: { href: "#features", label: "See features" },
  secondary: { href: "/lookup", label: "Look up an emergency summary" },
  slideMs: 6500,
};

export type ScreenKey = "ask" | "match" | "summary" | "share" | "revoke";

/** The phone in the hero cycles through the three core journeys (plan §2). */
export const heroScreens: { key: ScreenKey; label: string }[] = [
  { key: "ask", label: "Ask for care" },
  { key: "summary", label: "Emergency summary" },
  { key: "share", label: "Temporary access" },
];

export const bento = {
  title: "Everything in one calm place.",
  threads: {
    title: "Ask in your own words",
    body: "Describe what you need. If something is unclear, you get one short question with choices, not a guess.",
    items: [
      {
        name: "Child health near Ikeja",
        preview: "3 suitable facilities in the directory",
      },
      { name: "Maternity care", preview: "Which area should I search?" },
      { name: "My emergency summary", preview: "Allergies, contact name" },
    ],
  },
  summary: {
    title: "Emergency summary",
    body: "Pick the fields anyone with your patient code can see.",
  },
  directory: {
    title: "Real facilities, never invented",
    body: "Results come from the facility directory: filtered by the service listed, then ranked by approximate distance.",
  },
  ask: {
    placeholder: "Find child care near Ikeja",
    title: "Or skip the chat",
    body: "Choose a service and an area or landmark.",
  },
};

export const steps: { key: ScreenKey; title: string; body: string }[] = [
  {
    key: "ask",
    title: "Ask for care, wherever you are",
    body: "Type what you need, or pick a service and area. Location permission is optional: an area or landmark works too.",
  },
  {
    key: "match",
    title: "Match to facilities that fit",
    body: "Service first, then approximate distance from your area. Up to three options, with contact details where the directory lists them.",
  },
  {
    key: "summary",
    title: "Keep an emergency summary ready",
    body: "Choose the fields a code lookup reveals and preview exactly what someone will see before you save.",
  },
  {
    key: "share",
    title: "Share more, only for a while",
    body: "Create a read-only code for extra fields, channels you allow, and 15 minutes to 24 hours. It is shown once.",
  },
  {
    key: "revoke",
    title: "Revoke, and see every read",
    body: "Revoke a code and later reads are blocked. Your access log shows who looked, through which channel and when.",
  },
];

export const channels = {
  title: "Signal, not mobile data.",
  body: "SMS and USSD work on basic phones over the cellular network. The web works on any browser. Same directory, same permissions.",
  cta: { href: "/assistant", label: "Try the web assistant" },
  cards: [
    {
      key: "web",
      title: "Web, on any browser",
      body: "The full assistant, find-care form and patient portal, kept light for mid-range phones.",
    },
    {
      key: "sms",
      title: "SMS, on any phone",
      body: "Text FIND or LOOKUP. Facility details come back by text. Extra record fields are never sent by SMS.",
    },
    {
      key: "ussd",
      title: "USSD, step by step",
      body: "A guided menu for finding care and reading an emergency summary, a page at a time.",
    },
    {
      key: "voice",
      title: "Voice, in a later release",
      body: "Real-time voice is planned after telecom audio checks. It is not part of Release 1.",
    },
  ],
  simNote: "Simulations · fictional data · not a live dial code",
} as const;

export const trust = {
  title: "Built so you stay in control.",
  body: "Every share starts with your confirmation. Nothing about a recommendation sends your record anywhere.",
  items: [
    { title: "Fields you choose", body: "New fields are private by default." },
    {
      title: "Grants that end",
      body: "Every code expires and can be revoked.",
    },
    {
      title: "Every read logged",
      body: "Channel, time, field names and outcome.",
    },
    {
      title: "Codes stay out of the AI",
      body: "Codes are never sent to the AI provider.",
    },
  ],
  caveat:
    "Revoking cannot undo what someone has already seen or copied. HealthAccess gives general information and care navigation. It does not diagnose, prescribe or book appointments.",
  release1: [
    "Web assistant",
    "Find care",
    "Patient portal",
    "Emergency summary",
    "Temporary grants",
    "Practitioner lookup",
    "SMS and USSD",
  ],
  later: ["Voice"],
  separate: [
    "Clinical document upload",
    "Prescribing",
    "Appointment booking",
    "Hospital EHR integration",
  ],
};

export const finalCta = {
  kicker: "Ready when you need it",
  title: "Find suitable care, and share only what you choose.",
  cardKicker: "Start in seconds",
  cardTitle: "No account needed to ask for care.",
  cardBody:
    "Sign in only to manage your record, emergency summary and temporary codes.",
  primary: { href: "/assistant", label: "Open the assistant" },
  secondary: { href: "/register", label: "Create a patient account" },
};

export const footer = {
  blurb:
    "HealthAccess helps you find suitable care nearby and decide exactly what health information you share.",
  explore: [
    { href: "/assistant", label: "Assistant" },
    { href: "/find-care", label: "Find care" },
    { href: "/lookup", label: "Emergency lookup" },
    { href: "/login", label: "Sign in" },
  ],
  page: [
    { href: "#features", label: "Features" },
    { href: "#how-it-works", label: "How it works" },
    { href: "#channels", label: "Channels" },
    { href: "#trust", label: "Trust" },
  ],
  emergency:
    "In an emergency, seek local emergency care immediately. Do not wait for a chat or message reply.",
  demo: "Facility names, addresses, codes and records shown on this site are fictional.",
};
