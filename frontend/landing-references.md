# Landing page references

Inspected in Chromium via Playwright on 2026-11-17 at 1440×900. I measured timings from computed styles, not by eye. **Nothing was copied.** All HealthAccess artwork is original SVG/CSS. CardiaTec's hero layers and photos (`shutterstock_*`) are licensed assets.

## What the references actually do

### CardiaTec (cardiatec.ai)
**Stack:** WordPress (Bricks), jQuery, GSAP 3.12 with ScrollTrigger, Lenis smooth scroll, Three.js (`waves.js` background canvas), Swiper, Slick and Lottie. That is heavy.

**Preloader (`.section--intro`, fixed, z 9999, navy `#111c5c`-ish):**

| Time | Event |
|---|---|
| 0 → 1.7 s | Blank navy screen (cold load ran about 4 s). |
| ~2.3 s | Tagline "Decoding Cardiovascular Disease Biology" fades in from a blur. |
| ~5.0 s → 6.2 s | Curtain slides up (`translateY(0 → -100vh)`, about 1.1 s, ease-in-out). |

- The timeline is fixed. It does not wait for assets to be ready, and it runs on every visit.
- **Total about 6 s. That breaks our under-2 s rule.**

**Handoff:** the hero is already rendered underneath. As the curtain lifts, the art layers scale up from about 0.92 → 1 with slight staggering, and the nav links fade in left to right.

**Hero layers:** five transparent PNGs of 1536×1395 each, stacked:

| Layer | Content |
|---|---|
| `dot-target` | Dotted ring / target |
| `molecules` | Molecule line art |
| `heart` | Hero object, slightly larger |
| `protein` | Protein line art |
| `network` | Node-link network |

- Each layer gets its own 3D tilt (`matrix3d`) driven by the mouse, with a different strength per layer. The heart moves about 2× the others; the network layer moves least but also scales. That depth difference is what creates the parallax.
- A Three.js wave canvas sits behind everything.

**Slides:** "01/03" counter, a progress line, and prev/next arrows.
- Only the **subcopy** changes; the headline and art stay fixed.
- Auto-advances about every 4 s and stops at 03/03, where "next" is disabled.

**Pill nav:** two floating pills, the logo on the left and the links on the right. Translucent light background, uppercase links.

**Scroll:** sections are cards with rounded top corners that slide over the previous section (a stacked-card effect).
- A dark "problem" panel with large statistics plus its own small 01/03 slider.
- A white "layers" section with a stacked-rhombus diagram (proteomics → genomics).
- A photo mosaic with a statistic.
- A greyscale team grid, a news list, and a dark "Let's Talk" footer.

### Manifold Bio (manifold.bio)
**Stack:** Webflow, GSAP with ScrollTrigger and MorphSVG. **Native scroll** (no Lenis). Analytics through GTM.

**Look:**
- Light mint hero with a dotted human silhouette and a dotted wave landscape.
- The landscape is a looping video, used at both the hero and the footer.
- Dark sections are deep teal-navy `rgb(6,36,51)` = `#062433`.
- Fonts: Manrope (body) and Darker Grotesque (display).

**Scroll behaviour:** restrained.
- The nav sticks to the top. Feature images stay pinned (`position: sticky`) while the text column scrolls.
- No smooth-scroll hijacking and no scroll-scrubbed transforms on the hero. I sampled 0 → 3400 px and saw no transform changes.
- Text reveals are subtle.

**Notable sections:**
- "In vitro is not in vivo": dark, with a big claim and one small diagram.
- Body silhouette with organ callouts (Lung, Heart, Brain…).
- A three-up diagram row, board and team grids, a news list.
- "Contact us" over the dotted landscape footer.

## Decisions per section
| # | Section | Decision | Reason / adaptation |
|---|---|---|---|
| 1 | Preloader | **Adapt** | Keep the curtain-lift handoff and the blur-in tagline.<br>Cut the fixed 6 s timeline. Ours finishes when fonts and the hero SVG are ready: at least 600 ms, capped at 1.6 s.<br>Shown once per session (`sessionStorage` flag, wrapped in try/catch). Has a skip button. Skipped entirely under `prefers-reduced-motion` and when JS is off.<br>Content: the brand "+" assembles from the dot grid, then the curtain lifts. |
| 2a | Pill nav | **Keep** | Two pills: logo and links. Collapses to a menu button below 768 px. Sentence-case links, not uppercase (readability). |
| 2b | Hero and slides | **Adapt** | Same model: fixed headline, three subcopy slides with a counter, progress line and arrows.<br>Our version pauses on hover/focus, has `aria-live="polite"` on the subcopy only, does **not** auto-advance under reduced motion, and loops instead of dead-ending at 03.<br>The slides are Ask for care / Emergency summary / Temporary access. |
| 2c | Hero art | **Adapt** | Same layer structure, original content. Five SVG files in `/public/landing/hero/`: `dot-field.svg`, `network.svg`, `body.svg` (hero object: dotted figure), `facility-nodes.svg` (pins plus a "+"), `code-ring.svg` (a ring of digits standing for patient and temporary codes).<br>Mouse-driven tilt depth, scaled down. Off on touch devices and under reduced motion.<br>**Skip the Three.js waves:** the dot field is static SVG with a CSS drift. |
| 3 | Problem block | **Adapt** | Manifold's dark "in vitro" block, laid out like CardiaTec's problem panel.<br>**Keep the layout, skip the big numbers**: we have no sourced statistics. Use three qualitative statements, each tagged `[SOURCE NEEDED]` in a code comment wherever a number would go. |
| 4 | Body map | **Adapt** | Manifold's dotted silhouette with callouts, but the callouts point to **the record fields the patient controls** (allergies, medications, conditions, blood group, emergency contact), not organs or symptoms. This avoids reading as a symptom checker. Each callout links to the matching capability. |
| 5 | How it works | **Adapt** | CardiaTec's stacked-rhombus "layers" diagram becomes Ask → Match → Share → Revoke. Steps reveal on scroll with ScrollTrigger (no scrubbing). |
| 6 | Feature accordion | **Adapt** | Manifold's sticky-image pattern: the accordion runs on the left and a pinned preview on the right shows the open item. Previews are small HTML/CSS rebuilds of prototype states (facility card, emergency preview, grant receipt), all labelled "fictional". |
| 7 | Channels | **New** | Three pillars: Web, SMS, USSD. Voice has a "later" tag. Each pillar plays a short scripted simulation (D3), labelled "Simulation · fictional data". Example: a USSD `CON` menu. |
| 8 | Trust strip | **New** | Four items: patient-chosen fields, revocable time-limited grants, every read logged, codes never sent to the AI provider. Plain cards, no animation. |
| 9 | Roadmap | **New** | Two columns. **Release 1:** web assistant and find-care, patient portal, emergency summary, temporary grants, practitioner lookup, SMS/USSD. **Later:** voice. **Separate projects, not planned:** clinical document ingestion, prescribing, appointment booking, hospital EHR integration. Taken word for word from plan §1. |
| 10a | Team | **Skip** for now | No real team data. Placeholder cards would be invented content. Easy to add later. |
| 10b | CTA and footer | **Keep** | Manifold-style dotted landscape footer as static SVG, not video. CTA buttons: "Open the assistant" (`/assistant`) and "Look up an emergency summary" (`/lookup`). |
| — | Stacked-card scroll | **Keep, lightly** | Rounded-top dark and light sections overlap the one before with a negative margin. Plain CSS, no pinning. |
| — | Smooth scroll (Lenis) | **Skip** | It hijacks native scrolling, costs bytes and hurts low-end Android. Manifold shows it isn't needed. |
| — | News, photo mosaic | **Skip** | No content, and the photos are licensed stock. |

## Section order: one change
I swapped how-it-works and the body map compared with the brief: Hero → Problem → **How it works** → **Body map** → Features → Channels → Trust → Roadmap → CTA/footer.

**Why:** a reader needs the Ask → Match → Share → Revoke flow before a close-up of "your record" makes sense. Otherwise the body map arrives without context and looks like a symptom checker.

## Performance budget (Lagos, mid-range Android, 4G)
- **JS:** GSAP core plus ScrollTrigger (about 40 KB gzipped), lazy-loaded after first paint. No Three.js, Lenis, Swiper or video.
- **Hero:** inline/critical SVG under about 30 KB total. Text is LCP. Below-the-fold art is lazy-loaded.
- **Font:** one variable Inter WOFF2 via `next/font`, latin subset.
- **Fallbacks:** every animation has a static end state and a reduced-motion branch. Without JS the page is complete, with no preloader.

---

## v2 reference: 21st.dev voice-app template (user request, 2026-11-17)
Source: https://voice-ai-app-dark-landing-page-v2.21st.app/, inspected in Chromium at 1440 px.
- **Stack:** custom fonts embedded as data URLs, CSS keyframes (`mm-spin`, `mm-rot`), canvases for the orbs. No GSAP or Three.js.
- **Structure:**
  - sticky nav;
  - hero: 100 px headline that blurs in word by word, with a hand-held phone photo rising;
  - "Think smarter" bento grid;
  - pinned-phone scroll steps (`position: sticky`, `top: 80px`);
  - "Hands-free" carousel;
  - "Plus" section with glossy 3D objects;
  - call to action with an email form;
  - footer.
- **Kept:** layout, dark palette structure, word blur-in, pinned-phone scroll steps, bento, carousel, glossy-object section.
- **Adapted:** purple and orange iridescence becomes mint, teal and amber. The hand photo becomes a CSS phone. The 3D objects are redrawn as original SVGs: cross, shield, pin.
- **Skipped:** the email form (D12) and the template's photos and webp objects (licensed to the template, not ours).
