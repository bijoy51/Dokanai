# DokanAI — 3-Minute Pitch Video Prep

**Event:** Infinity AI BuildFest 2026 · Track 4 — E-Commerce
**One-liner:** *Aapnar dokaner AI saathi* — an AI co-pilot that turns Bangladesh's 12M+ SMEs from paper-khata operators into data-driven retailers.

---

## Pre-Production Checklist

- [ ] 1080p screen-record of the live web app (Analyze my Shop page)
- [ ] Browser zoom set to 110%; close all extra tabs / extensions
- [ ] Local demo data pre-loaded (a clothing shop CSV + 5 product images)
- [ ] ML backend up on Hugging Face Spaces → "Powered by trained ML backend" banner visible
- [ ] Bangla text overlay ready for the localization beat
- [ ] One presenter on camera (energy matters more than polish)
- [ ] Slate (1 sec): logo + team name + track
- [ ] Background music bed (royalty-free, low volume)
- [ ] Captions / subtitles for English + Bangla phrases

---

## Timeline at a Glance

| Time | Beat | On-screen | Message |
|---|---|---|---|
| 0:00 – 0:30 | Problem | Paper khata + Facebook chaos B-roll | "This is real and urgent." |
| 0:30 – 1:00 | Solution | DokanAI homepage + tagline | "Here is how we solve it." |
| 1:00 – 2:00 | Demo | Live Analyze my Shop walkthrough | "This is how the system works." |
| 2:00 – 2:30 | AI approach | Architecture diagram + model names | "This is a real AI system." |
| 2:30 – 3:00 | Impact + roadmap | KPI tiles + map of BD | "We can scale this." |

---

## 0:00 – 0:30 → Problem (The Vibe)

**Goal:** Judges feel the pain in 30 seconds.

**Script (read in ~75 words):**
> "In Bangladesh, over 12 million small businesses still run on paper khata. They lose 25 to 40 percent of every Cash-on-Delivery order to returns. They miss Eid demand spikes because nobody forecasts them. Repeat customers are forgotten. Global SaaS tools? English-only, priced for Silicon Valley. The shopkeeper in Mirpur doesn't need a dashboard — she needs a partner that speaks her language and thinks for her."

**Visuals:**
- 3-second clip of a paper khata + handwritten ledger
- Facebook-shop screenshot with "Inbox 247 unread"
- Headline overlay: **"40% RTO. 12M shops. 0 AI tools in Bangla."**

**Judge hooks:** Clarity + Relevance.

---

## 0:30 – 1:00 → Solution

**Goal:** Land what DokanAI is in one breath.

**Script:**
> "DokanAI is an AI-native business co-pilot for Bangladeshi SMEs. It works in Bangla, on a phone, even on 2G. Upload your product list — or just snap a photo of your khata — and DokanAI tells you what to stock for the next festival, which customer is about to churn, and which COD order is going to bounce back. One app, mobile-first, Bangla-first."

**Visuals:**
- DokanAI logo animation
- Tagline overlay: **"Aapnar dokaner AI saathi"**
- Three-pillar graphic: **Forecast · Personalize · Retain**

**Judge hooks:** Simplicity + Uniqueness.

**Why we're different:** Bangla-native voice, RTO predictor (BD-specific), khata-to-cloud onboarding.

---

## 1:00 – 2:00 → Demo / Concept Flow (the longest beat — earn it)

**Goal:** Show the working product, not slides.

**Run-of-show (record this segment in one take):**
1. **0:00–0:10** — Open the Next.js app, click **"Analyze my Shop"**.
2. **0:10–0:25** — Upload sample CSV (50 clothing listings) + 5 product photos.
3. **0:25–0:40** — Show the ML pipeline output rolling in:
   - Detected shop type: **Clothing**
   - Festival outlook: *"Eid-ul-Fitr in 18 days — stock Panjabi sizes M/L, expect 2.3× demand"*
   - Missing goods + trend list
   - Fashion-style retrieval gallery (popular dress styles with sample images)
4. **0:40–0:55** — Open the Bangla voice co-pilot, ask *"Aaj shobcheye beshi ki bikri holo?"*, play the spoken Bangla reply.
5. **0:55–1:00** — Cut to the **"Powered by trained ML backend"** banner — proves it's not heuristic, it's real models.

**Visuals:** Real screen recording. No mockups. Cursor highlighted.

**Judge hooks:** Feasibility + Logical thinking.

---

## 2:00 – 2:30 → AI Approach

**Goal:** Prove this is a real AI system, not an LLM wrapper.

**Script:**
> "Under the hood, DokanAI runs seven trained models. XGBoost and Prophet forecast demand and festival uplift. An ONNX fashion-style classifier with FAISS vector retrieval finds the dress styles trending in your district. A Bangla LLM agent — Whisper for speech, plus retrieval-augmented generation over our festival and weather calendars — answers questions in voice. Catalog gap detection runs on a rules-plus-embeddings hybrid. Everything is served from a FastAPI backend on Hugging Face Spaces, and the Next.js app talks to it over a single endpoint."

**On-screen architecture diagram (left to right):**

```
[Shopkeeper (Bangla voice / CSV / photo)]
        ↓
[Next.js + Vercel front-end]
        ↓
[FastAPI ML backend on HF Spaces]
        ↓
┌──────────────┬───────────────┬──────────────┐
│ Shop-type    │ Demand        │ Festival     │
│ classifier   │ forecaster    │ uplift       │
│ (sklearn)    │ (XGBoost)     │ (Prophet)    │
├──────────────┼───────────────┼──────────────┤
│ Catalog gap  │ Fashion style │ Trends cache │
│ (rules+emb)  │ (ONNX+FAISS)  │ (cron job)   │
└──────────────┴───────────────┴──────────────┘
        ↓
[Bangla LLM Co-pilot — Whisper STT + RAG + TTS]
```

**Name the stack out loud:** XGBoost · Prophet · ONNX · FAISS · Whisper · FastAPI · Next.js.

**Judge hooks:** AI depth + Technical structure.

---

## 2:30 – 3:00 → Impact & Next Step

**Goal:** Show the size of the prize.

**Script:**
> "If a single shop adopts DokanAI, our models project an 85 percent forecast accuracy, 25 percent fewer stockouts, 20 percent lower RTO, and a 25 percent lift in repeat purchases. Multiply that across 12 million SMEs and you're unlocking billions of takas of trapped working capital. Our roadmap: Phase 2 ships the RTO predictor and khata-to-cloud onboarding agent; Phase 3 expands to Daraz, Pathao, and bKash integrations. Bangla-first, mobile-first, AI-native. DokanAI is how the bottom of the e-commerce stack learns to think."

**On-screen KPI tiles:**

| Metric | Target |
|---|---|
| Forecast accuracy | ≥ 85% |
| Stockouts | ↓ 25% |
| RTO rate | ↓ 20% |
| Repeat-purchase rate | ↑ 25% |
| Revenue uplift | 15–30% |

**Close with:**
- Map of Bangladesh with pins lighting up
- Final card: **DokanAI · Aapnar dokaner AI saathi**
- Team names + GitHub URL

**Judge hooks:** Vision + Growth potential.

---

## Mandatory-Requirements Checklist

- [x] 3-minute video (3:00 max — leave 2 sec buffer)
- [x] Clear problem (0:00–0:30)
- [x] AI-native thinking (2:00–2:30, named models)
- [x] System flow (architecture diagram)
- [x] Demo / prototype (live screen recording 1:00–2:00)
- [x] Bangla / localization — tagline, voice query, district-level trends
- [x] Expected impact / KPI tiles in the closing beat

---

## What Judges Score On (and our line for each)

| Criterion | Our answer |
|---|---|
| **Clarity** | One-liner + three-pillar graphic delivered in the first minute |
| **AI thinking** | 7 trained models named on screen, plus RAG + vector DB |
| **Feasibility** | Live working backend on HF Spaces; not a Figma mock |
| **Structure** | Problem → Solution → Demo → Tech → Impact, on-time |
| **Energy** | Presenter on camera, Bangla phrases delivered with confidence |

---

## Common Mistakes — and How We Dodge Each

| Mistake | Our fix |
|---|---|
| Only stating the idea | We show a live, working demo for 60 seconds |
| Not explaining AI | We name every model + framework on screen |
| Overcomplicating | One product, one demo path, one tagline |
| Not showing a demo | The demo is the longest beat |
| Not considering real users | Bangla voice query + paper-khata onboarding |

---

## Speaker Notes (delivery)

- Speak ~140 words per minute — script totals ~420 words for 3 minutes, leaving room for breath and on-screen action.
- Land the Bangla line *"Aapnar dokaner AI saathi"* with confidence — don't translate it on screen until 2 seconds later; let it breathe.
- During the demo, **narrate what the model just did**, not what you're clicking. (Bad: *"Now I click Upload."* Good: *"And there — the forecaster just flagged a 2.3× spike for Eid."*)
- End on a hard cut to the team card, not a fade. Confidence beats polish.

---

## Final Mindset

> Perfection is not the bar. **Builder mindset** is.

We have:
- A real backend (FastAPI + 7 models, deployed)
- A real frontend (Next.js on Vercel)
- A real Bangladesh-specific edge (RTO, Bangla, festivals)
- A real roadmap that scales

If a judge asks *"Can your team actually build this?"* — the video already answered yes.
