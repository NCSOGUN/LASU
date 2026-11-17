# HealthAccess frontend

Next.js (App Router) + TypeScript + Tailwind + GSAP.

```bash
cp .env.example .env.local   # set HEALTHACCESS_API_ORIGIN to the FastAPI origin
npm install
npm run dev
```

- Browser code calls same-origin `/api/v1/*`; `next.config.ts` proxies it to FastAPI.
- Contract: `docs/01_Online_FastAPI_UI_and_Database_Plan.md`. UI states: `docs/HealthAccess_Interactive_Prototype.html`.
- Progress and decisions: `progress.md`.
