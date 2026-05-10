# DokanAI — Implementation Plan

**Target:** Vercel-deployed Next.js 14 MVP covering all 8 features from `DokanAI-Plan.md`.
**Working dir:** `c:\Users\HP\Desktop\Hackathon`
**Goal:** Every feature in the .md is functional end-to-end in the browser, in Bangla + English, with realistic AI output.

---

## What "Functional" Means Here

Real production integrations (bKash merchant API, Daraz/Pathao APIs, real-time Claude/Gemini calls, real Whisper STT on a server, MCP agents, Neo4j/GraphDB clusters, WhatsApp Business API) all require **paid accounts, API keys, and merchant-verified credentials** I cannot create. So the plan ships every feature with two paths:

- **Real algorithm where free** — forecasting (moving avg + seasonal decomposition + festival boost), recommendations (item-item collaborative filtering), churn scoring, RTO risk scoring, smart timing prediction. These run server-side on seeded data — no API key needed.
- **Drop-in stub for paid services** — LLM message generation, Bangla TTS, Whisper STT, OCR. Each is wired behind an API route with a deterministic high-quality stub, so the demo works offline. A single env var (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`) flips it to real calls when you add a key.
- **Browser-native where possible** — Bangla voice uses the **Web Speech API** (works in Chrome/Edge for free, real STT + TTS, Bangla supported), so this is genuinely real on Day 1.

Every UI flow, every chart, every dashboard page is fully functional. No "Coming Soon" pages.

---

## Stack

- **Framework:** Next.js 14 (App Router) + TypeScript
- **Styling:** Tailwind CSS + shadcn/ui components
- **i18n:** `next-intl` (Bangla + English toggle)
- **Charts:** Recharts
- **Data:** JSON seed files + in-memory store (works in Vercel serverless without a DB). Supabase wiring left as a commented adapter.
- **AI/ML algorithms:** Custom TypeScript implementations (no Python at runtime).
- **Voice:** Web Speech API (browser-native, free, real Bangla support)
- **Deploy:** Vercel (zero-config for Next.js)

---

## File Structure (Planned)

```
Hackathon/
├── DokanAI-Plan.md            (already there)
├── PLAN.md                    (this file)
├── package.json
├── next.config.mjs
├── tsconfig.json
├── tailwind.config.ts
├── .env.example
├── README.md
├── app/
│   ├── [locale]/
│   │   ├── layout.tsx
│   │   ├── page.tsx                        (landing/login)
│   │   ├── dashboard/
│   │   │   ├── page.tsx                    (overview + KPIs)
│   │   │   ├── forecast/page.tsx           (Feature 1)
│   │   │   ├── pricing/page.tsx            (Feature 2)
│   │   │   ├── recommendations/page.tsx    (Feature 3)
│   │   │   ├── marketing/page.tsx          (Feature 4)
│   │   │   ├── customers/page.tsx          (Feature 5 churn)
│   │   │   ├── voice/page.tsx              (Feature 6 Bangla voice)
│   │   │   ├── rto/page.tsx                (Feature 7)
│   │   │   └── onboarding/page.tsx         (Feature 8 khata-to-cloud)
│   ├── api/
│   │   ├── forecast/route.ts
│   │   ├── pricing/route.ts
│   │   ├── recommend/route.ts
│   │   ├── marketing/route.ts
│   │   ├── churn/route.ts
│   │   ├── rto/route.ts
│   │   ├── khata/route.ts
│   │   └── voice-query/route.ts
├── lib/
│   ├── ai/
│   │   ├── forecast.ts          (moving avg + seasonal + festival boost)
│   │   ├── recommend.ts         (item-item CF)
│   │   ├── pricing.ts           (elasticity heuristic + bundle gen)
│   │   ├── churn.ts             (RFM scoring)
│   │   ├── rto.ts               (logistic-style risk score)
│   │   ├── timing.ts            (best-send-hour predictor)
│   │   ├── llm.ts               (provider abstraction: real or stub)
│   │   └── festivals.ts         (BD festival calendar 2026)
│   ├── data/
│   │   ├── seed-products.json
│   │   ├── seed-customers.json
│   │   ├── seed-orders.json
│   │   └── store.ts             (in-memory access layer)
│   └── i18n/
│       ├── messages/bn.json
│       └── messages/en.json
├── components/
│   ├── ui/                      (shadcn primitives)
│   ├── DashboardShell.tsx
│   ├── KpiCard.tsx
│   ├── LangSwitcher.tsx
│   ├── ForecastChart.tsx
│   ├── BundleSuggestionCard.tsx
│   ├── RecommendationList.tsx
│   ├── MessageComposer.tsx
│   ├── ChurnTable.tsx
│   ├── VoiceMic.tsx
│   ├── RtoBadge.tsx
│   └── KhataUploader.tsx
└── public/
    └── (assets, logos)
```

---

## Step-by-Step Build Order

1. **Scaffold** Next.js 14 + TS + Tailwind + shadcn in `Hackathon/`.
2. **Seed data** — generate ~6 months of synthetic but realistic Bangladeshi SME data: 60 products, 200 customers, 1500 orders, with festival spikes pre-baked.
3. **i18n + Layout shell** — bilingual layout, language switcher, dashboard sidebar with all 8 feature links.
4. **Overview Dashboard** — KPI cards (revenue, orders, RTO%, repeat rate) + sales chart.
5. **Feature 1 — Demand Forecast** — server route that runs moving-avg + seasonal decomp + festival boost; UI shows next-30-day forecast chart, dead-stock list, festival pre-alerts.
6. **Feature 2 — Pricing & Bundles** — elasticity heuristic per product; bundle generator that uses co-purchase frequency from order data.
7. **Feature 3 — Recommendations** — item-item collaborative filtering; per-customer "next best product" panel.
8. **Feature 4 — Auto-Marketing** — message composer that generates Bangla + English templated messages (via LLM if key set, else high-quality template engine); smart-timing widget shows best send hour per customer.
9. **Feature 5 — Churn / Customer Insights** — RFM (Recency-Frequency-Monetary) scoring → at-risk / VIP / dormant buckets; "send 15% coupon to win back" action.
10. **Feature 6 — Bangla Voice Co-pilot** — Web Speech API mic button; user says a question in Bangla → transcribed → routed to a query interpreter → reads back the answer in Bangla TTS.
11. **Feature 7 — RTO Risk Predictor** — risk score per pending order using customer history, order size, location, courier; UI shows risk badge + "require advance payment" suggestion.
12. **Feature 8 — Khata-to-Cloud Onboarding** — file uploader (image or audio); simulated multi-modal extraction returns structured records (real vision OCR if `OPENAI_API_KEY` set).
13. **Polish** — empty states, loading spinners, error toasts, mobile responsiveness.
14. **README + .env.example** — instructions for running locally and deploying to Vercel.
15. **Local smoke test** — `npm run build` then `npm run start` on `localhost:3000`; click through every feature, verify each route returns real output.
16. **Deploy to Vercel** — push to GitHub or use `vercel` CLI; verify live URL.
17. **Iterate** — if any feature is broken on the deployed instance, fix and redeploy until all 8 work.

---

## Realism Checklist (per Feature)

| # | Feature | What's Real | What's Simulated (key flips it real) |
|---|---|---|---|
| 1 | Demand Forecast | Moving-avg + seasonal + festival boost on seed data | — |
| 2 | Pricing & Bundles | Co-purchase mining + elasticity heuristic | — |
| 3 | Recommendations | Item-item collaborative filtering | — |
| 4 | Auto-Marketing | Smart-timing prediction; Bangla/English template messages | LLM rephrasing → real with API key |
| 5 | Churn | RFM scoring on real seed orders | — |
| 6 | Bangla Voice | Web Speech API STT + TTS (real, browser-native) | Server-side Whisper if you prefer |
| 7 | RTO Risk | Logistic-style risk scoring | — |
| 8 | Khata-to-Cloud | File upload + structured-record output flow | Vision OCR → real with API key |

---

## Vercel Deployment

- Project will be a vanilla Next.js 14 app — no special config required.
- `.env.example` will list optional keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).
- I'll either deploy via the `vercel` CLI (needs your Vercel login) or give you exact one-line commands.

---

## Acceptance Criteria

Plan is "done" when:

1. `npm run build` succeeds with zero errors.
2. Every dashboard route renders without runtime errors.
3. Every feature accepts input → returns real, sensible output.
4. The Bangla/English toggle changes UI text on every page.
5. The app is deployed to a live Vercel URL.
6. I've smoke-tested all 8 features on the live URL.

---

## What I Need From You After Approval

Nothing required to start. Optional but nice:

- A Vercel account (so I can deploy under your name) — or I'll output the commands and you click "deploy."
- An `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` if you want real LLM-generated marketing copy. Without it, the app still works with deterministic templates.

---

## Estimated Scope

~30–40 files, ~3000–4000 lines of TypeScript/TSX. I'll work through the todo list sequentially, marking each feature complete only after I've verified it returns sensible output in the browser.
