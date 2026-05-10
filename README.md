# DokanAI

**AI Business Growth Assistant for SMEs.** Submission for **The Infinity AI BuildFest 2026 (Track 4, E-commerce)**.

Forecast demand, automate marketing, and grow sales. In Bangla, on a phone, offline-capable.

## Features

1. **Festival-Aware Demand Forecasting.** Moving-average + seasonal + festival boost.
2. **AI Pricing & Smart Bundles.** Elasticity heuristic + co-purchase mining.
3. **Personalized Recommendations.** Item-to-item collaborative filtering.
4. **Auto-Marketing with Smart Timing.** Bilingual message generation + best-send-hour.
5. **Customer Churn (RFM).** Recency-Frequency-Monetary scoring with segments.
6. **Bangla Voice Co-pilot.** Web Speech API STT/TTS, real Bangla.
7. **RTO Risk Predictor.** Logistic risk scoring on pending COD orders.
8. **Khata-to-Cloud Onboarding.** File upload + structured-record extraction.

Bilingual UI: **English + বাংলা**.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Root redirects to `/en`.

## Build

```bash
npm run build
npm run start
```

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. Go to https://vercel.com/new and import the repo.
3. No env vars required. Every feature ships functional out of the box.
4. Click **Deploy**.

Optional: to enable real LLM marketing copy or real Vision OCR, add `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` in Vercel project settings. The relevant API routes will switch from deterministic stubs to real model calls.

## Tech

- Next.js 14 (App Router), TypeScript, Tailwind CSS
- Recharts for visualizations
- Web Speech API (browser-native Bangla voice)
- In-memory deterministic seed data (220 customers, ~1500 orders, 40 products, ~6 months of history)

## Project structure

```
app/[locale]/dashboard/{forecast, pricing, recommendations, marketing, customers, voice, rto, onboarding}/
app/api/{recommend, marketing, voice-query, khata}/
lib/ai/        algorithms (forecast, pricing, recommend, churn, timing, marketing, rto, voice-query)
lib/data/      festival calendar + deterministic seed generator + in-memory store
lib/i18n/      Bangla + English translations
components/    shared UI primitives
```
