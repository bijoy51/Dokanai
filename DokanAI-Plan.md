# DokanAI — AI Business Growth Assistant for SMEs

**The Infinity AI BuildFest 2026 | Track 4 — E-Commerce**
*Build Locally. Lead Globally.*

---

## One-Line Pitch

**DokanAI** — An AI-native business co-pilot that turns Bangladesh's 12M+ SMEs from paper-khata operators into data-driven retailers, in Bangla, on a phone, offline-capable.

> Tagline: *"Aapnar dokaner AI saathi"* (Your shop's AI partner)

---

## 1. Pain Points We Solve

### Operational
- **Paper khata dependency** — most SMEs still record sales on paper
- **F-commerce chaos** — businesses run on Facebook/WhatsApp without inventory or CRM
- **High Cash-on-Delivery return rate** (25–40% RTO) destroying margins
- **Festival demand spikes go unforecasted** (Eid, Puja, Pohela Boishakh)
- **No customer memory** — repeat customers not recognized; ~60% of repeat revenue lost

### Technology / Access
- **Low digital literacy** — owners can't navigate English dashboards
- **Mobile-first reality** — 90%+ on phones, many on 2G/3G
- **bKash / Nagad / Rocket reconciliation** done manually
- **Daraz / Shopify / Pathao API silos** — no unified view
- **Global SaaS tools** are English-only and priced for Western markets

### Economic / Social
- **Women-led micro-businesses underserved**
- **Dead stock** locks up scarce working capital
- **Ad spend wasted** (Facebook Boost Posts with no targeting)

---

## 2. Core Features (8 Total — MVP = 4 polished)

### Feature 1 — Smart Demand Prediction + Festival Intelligence
- AI analyzes: sales history, seasonal trends, festivals, weather
- Predicts: best-sellers next week, stock levels, dead-stock risk
- **Festival Intelligence** auto-detects Eid, Puja, Ramadan, Valentine, Winter and pre-suggests stock decisions
- **Approach**: XGBoost + Prophet + RAG over festival/weather calendars
- **KPI**: Forecast accuracy ≥ 85%, Stockouts ↓ 25%
- **MVP**: ✅ Yes

### Feature 2 — AI Pricing Optimization + Smart Bundles
- Recommends price increases, discounts, and bundles
- Auto-creates combos (saree + blouse, burger + drinks, etc.)
- **Approach**: Reinforcement Learning + Graph affinity model
- **KPI**: Revenue uplift 15–30%
- **MVP**: ⚠️ Partial (pricing yes, bundles in v2)

### Feature 3 — Personalized Recommendation Engine
- Personalized product suggestions based on past behavior
- Cross-sell + upsell logic
- **Approach**: Collaborative filtering + GraphRAG
- **KPI**: Conversion ↑ 20%, AOV ↑ 15%
- **MVP**: ✅ Yes

### Feature 4 — Auto-Marketing with Smart Timing
- Sends WhatsApp / Messenger / SMS / push notifications
- **Smart Timing AI** sends messages when each customer is most active
- **Approach**: LLM message generation + send-time prediction model
- **KPI**: CTR ↑ 30%, CAC ↓ 20%
- **MVP**: ✅ Yes

### Feature 5 — Customer Return / Churn Prediction
- Identifies inactive customers, VIPs, and discount-responsive users
- **Approach**: Classification (XGBoost) + retention agent
- **KPI**: Repeat-purchase rate ↑ 25%
- **MVP**: ⚠️ Partial (basic segmentation)

### Feature 6 — Bangla Voice AI Co-pilot (Wow Feature)
- Owners ask questions in Bangla; AI replies in voice
- Example: *"Aaj shobcheye beshi ki bikri holo?"*
- **Approach**: Whisper STT + Bangla TTS + LLM reasoning
- **KPI**: Daily active usage by non-English-literate owners
- **MVP**: ✅ Yes — the demo wow moment

### Feature 7 — RTO Risk Predictor (Bangladesh-Unique Killer Feature)
- For every COD order, predicts return-to-origin probability
- Recommends advance-payment requirement when risk is high
- **Inputs**: customer history, location, order size, time, courier
- **Approach**: Classification model
- **KPI**: RTO ↓ 20%
- **MVP**: 🎯 Stretch goal

### Feature 8 — Khata-to-Cloud Onboarding Agent
- Owner photographs paper khata or sends Bangla voice note; multimodal AI extracts structured records and bootstraps account
- Solves cold-start for the 80% of SMEs with no digital records
- **Approach**: Multimodal vision + Bangla NLP
- **MVP**: 🎯 Stretch goal

---

## 3. AI-Native Architecture (Maps to BuildFest Reference Stack)

| Layer | Implementation |
|---|---|
| **User Interaction** | Mobile-first PWA (Bangla + English), WhatsApp Bot, Voice Assistant, USSD/SMS fallback |
| **Application Logic** | Vercel Edge Functions, Supabase backend, REST APIs |
| **AI Intelligence** | Claude / Gemini for reasoning; Local LLM (Ollama) for offline |
| **Knowledge Retrieval (RAG)** | PGVector store: festival calendars, product taxonomies, sales history, scraped competitor data |
| **Agent Orchestration (MCP)** | 5 agents: Demand, Pricing, Marketing, Retention, Voice |
| **Data Infrastructure** | Supabase + PGVector + Neo4j/GraphDB (customer-product affinity graph) |
| **Automation & Integration** | bKash, Nagad, Daraz, Shopify, Pathao, Steadfast, Facebook Graph API |
| **Deployment** | Vercel + Supabase Cloud, containerized agents |

---

## 4. AI/ML Components

| Feature | Model / Approach |
|---|---|
| Demand Prediction | XGBoost + Prophet + RAG |
| Pricing Optimization | Reinforcement Learning |
| Recommendation | Collaborative Filtering + GraphRAG |
| Customer Churn Prediction | XGBoost Classification |
| Smart Messaging | Claude / Gemini LLM |
| Send-Time Prediction | Classification model |
| Festival Detection | RAG + rule-based AI |
| Bangla Voice | Whisper (STT) + Bangla TTS |
| RTO Risk | Gradient-boosted classifier |
| Khata OCR / Voice Onboarding | Multimodal vision + Bangla NLP |

---

## 5. Data Strategy

- **Web scraping** (Firecrawl / Playwright): Daraz, AjkerDeal, Pickaboo, Foodpanda for competitor pricing & trending products
- **Public datasets**: BBS retail data, Bangladesh Bank festival spending data
- **3 pilot SME partners** (lock in before BuildFest day) providing 6 months of real sales data
- **API integrations**: bKash merchant API, Steadfast/Pathao courier APIs, Facebook Page Insights
- **Synthetic seed data** for demo

---

## 6. Dashboard Sections

- 📈 Sales Analytics
- 🧠 AI Suggestions
- 👥 Customer Insights
- 📦 Stock Prediction
- 💬 Marketing Automation
- 🎯 Recommendation Panel
- ⚠️ RTO Risk Monitor
- 🎙️ Bangla AI Voice Assistant

---

## 7. KPIs (For Judges)

- Revenue uplift: **15–30%**
- Stockouts reduction: **25%**
- RTO reduction: **20%**
- Repeat-purchase rate: **+25%**
- Conversion rate: **+20%**
- AOV: **+15%**
- CTR: **+30%** / CAC: **−20%**
- Forecast accuracy: **≥ 85%**

---

## 8. Ethics & Responsible AI

- **Data**: First-party SME data + public scraped data only; customer PII anonymized
- **Bias mitigation**: Audit recommendations for gender / income bias
- **Transparency**: Every AI suggestion shows the *why*
- **Consent**: Customers must opt in to marketing messages
- **No deepfakes**; AI-generated marketing clearly labeled

---

## 9. Team Composition (Per BuildFest Section C)

- **Team Lead** — owns vision + pitch
- **AI/ML Engineer (1–2)** — forecasting, RecSys, churn
- **Backend / Data Engineer** — Supabase, GraphDB, scrapers
- **Frontend / UX** — Bangla-first PWA
- **Business / Pitch Lead** — domain insight + storytelling
- **≥1 Woman team member** (required dimension)
- **1 NRB advisor** — e-commerce/AI professional abroad (remote advisory counts and must be documented)

---

## 10. Global Scalability Story

Built for Bangladesh, scalable to all emerging markets with festival-driven, mobile-first, COD-heavy economies: **Pakistan, Indonesia, Nigeria, Egypt, Vietnam.**

---

## 11. Timeline

| Date | Milestone |
|---|---|
| **May 10–12** | Lock team, recruit NRB advisor, write architecture MD file |
| **May 13–14** | Build seed dataset, set up Supabase + PGVector + GraphDB skeleton |
| **May 15** | ⚠️ **Submit 3-min preliminary pitch video (HARD DEADLINE)** |
| May 16–25 | Build core: forecast + RecSys + dashboard |
| May 26 – Jun 5 | Build: Voice agent, marketing agent, RTO predictor |
| Jun 6–10 | Polish demo, rehearsals, Opportunity Connect 1-pager |
| **Jun 12** | 🏆 BuildFest Day at BRAC University, 7 AM – 8 PM |

---

## 12. 3-Minute Pitch Structure

| Time | Segment | Content |
|---|---|---|
| 0:00–0:30 | Problem | Khata dokan owner, festival missed, dead stock, lost customer — 12M SMEs |
| 0:30–1:00 | Solution | DokanAI — Bangla AI co-pilot for SMEs |
| 1:00–2:00 | Demo | Voice query → forecast → auto-marketing → RTO prediction |
| 2:00–2:30 | AI Approach | RAG over festival data, GraphDB affinity, MCP agents, Local LLM offline |
| 2:30–3:00 | Impact | KPIs + scale story (BD → emerging markets) |

---

## 13. MVP Scope for June 12

Ship deeply, mock the rest:

1. ✅ Sales dashboard (Bangla + English)
2. ✅ Demand prediction with Festival Intelligence
3. ✅ Recommendation engine
4. ✅ Auto-marketing message generator
5. 🎙️ Bangla Voice query — the **wow moment** in the demo

---

*End of document.*
