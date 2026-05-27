# DokanAI

**AI Business Growth Assistant for Bangladeshi SMEs.** Submission for **The Infinity AI BuildFest 2026 (Track 4 — E‑commerce)**.

Forecast demand, automate marketing, run pricing experiments, predict RTO risk, and chat with an AI co‑pilot that has live access to your shop — in Bangla, on a phone, with imported real shop data.

Live: **https://dokanai.vercel.app**

---

## 1. Architecture at a glance

```
                                ┌──────────────────────────────────────┐
                                │            Shop owner                │
                                │      (browser, mobile or desktop)    │
                                └────────────────┬─────────────────────┘
                                                 │  HTTPS
                                                 ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │                  VERCEL  (Next.js 14 App Router)                     │
   │                  https://dokanai.vercel.app                          │
   │                                                                      │
   │  ┌─────────────────────────┐    ┌──────────────────────────────────┐ │
   │  │ Public + auth pages     │    │  API routes (serverless funcs)   │ │
   │  │ /, /[locale], /login,   │    │  /api/auth/*    /api/import      │ │
   │  │ /signup, /[locale]/     │    │  /api/recommend /api/marketing   │ │
   │  │ unsubscribe/[token]     │    │  /api/voice-query /api/khata     │ │
   │  └─────────────────────────┘    │  /api/analyze-shop /api/agent/*  │ │
   │                                 │  /api/cron/run-due-campaigns     │ │
   │  ┌─────────────────────────┐    │  /api/unsubscribe                │ │
   │  │ Dashboard (auth-gated)  │    └────────────┬─────────────────────┘ │
   │  │ /dashboard/{...}        │                 │                       │
   │  │ overview, pilot, analyze│                 │ in-memory store       │
   │  │ forecast, pricing,      │◀────reads───────┤ (per-instance, hot    │
   │  │ recommendations,        │                 │  cache only)          │
   │  │ marketing, customers,   │                 │                       │
   │  │ voice, rto, onboarding  │                 │                       │
   │  └─────────────────────────┘                 │                       │
   └──────────────────────────────────────────────┼───────────────────────┘
                                                  │ HTTPS server-to-server
                                  ┌───────────────┼───────────────┬───────────┐
                                  │               │               │           │
                                  ▼               ▼               ▼           ▼
                       ┌───────────────────┐ ┌──────────────┐ ┌────────────┐ ┌──────────┐
                       │   OpenAI API      │ │  HF SPACE    │ │  Resend    │ │ External │
                       │  Chat Completions │ │  ML backend  │ │  email API │ │   cron   │
                       │  + Tool Calling   │ │  + shared KV │ │            │ │ (yours)  │
                       │  gpt-4o-mini      │ │  (FastAPI,   │ │            │ │          │
                       │  (Pilot agent)    │ │   Python)    │ │            │ │          │
                       └───────────────────┘ └──────┬───────┘ └────────────┘ └─────┬────┘
                                                    │                              │
                                                    ▼                              │
                                  ┌───────────────────────────────────┐            │
                                  │   Shared key‑value store          │            │
                                  │   in the always‑on HF container   │            │
                                  │   (the ONLY durable state)        │            │
                                  │   → accounts, imports, chats,     │            │
                                  │     campaigns, recipient records  │            │
                                  └───────────────────────────────────┘            │
                                                                                   │
                                          POST /api/cron/run-due-campaigns         │
                                          Authorization: Bearer CRON_SECRET ◀──────┘
```

**Two runtimes, one source of truth.** Vercel is stateless across serverless instances; the Hugging Face Space is a single always‑on container that holds the shared KV. Every piece of mutable per‑shop state lives there so it survives cold starts and instance switches.

---

## 2. Where everything runs

| Layer | Tech | Hosted on |
|---|---|---|
| Web app (UI + API routes) | Next.js 14, App Router, TypeScript, Tailwind, Recharts | **Vercel** — `dokanai.vercel.app` |
| AI agent backend | OpenAI Chat Completions API (`gpt-4o-mini`) with function calling | OpenAI |
| ML backend (analyze, classify, trends, shared KV) | FastAPI, Python 3.11, PyTorch | **Hugging Face Spaces** — `bijoynayemhasan-dokanai-ml.hf.space` |
| Durable storage | In‑memory Python `dict` exposed as `/kv/{key}` on the HF Space | HF Space container |
| Transactional email | Resend HTTP API | Resend |
| Scheduling | External cron job (yours) hitting `/api/cron/run-due-campaigns` | Anywhere |
| Voice STT/TTS | Web Speech API (browser‑native) | Browser |

> **Why no relational database?** All mutable state fits in well under a megabyte per shop, the demo prioritises zero‑provisioning deploys, and the HF Space's always‑on container gives us a consistent, single‑writer KV without a DB bill. The data layer is intentionally one file ([lib/kv.ts](lib/kv.ts)) so swapping in Postgres/Redis later is a clean refactor.

---

## 3. Features and where they live

| # | Feature | UI page | API route(s) | Library |
|---|---|---|---|---|
| 1 | Demand forecast (festival‑aware) | `/dashboard/forecast` | uses store | [lib/ai/forecast.ts](lib/ai/forecast.ts) |
| 2 | Pricing & bundles | `/dashboard/pricing` | — | [lib/ai/pricing.ts](lib/ai/pricing.ts) |
| 3 | Recommendations (item‑to‑item) | `/dashboard/recommendations` | `/api/recommend` | [lib/ai/recommend.ts](lib/ai/recommend.ts) |
| 4 | Auto‑marketing (drafts + smart timing) | `/dashboard/marketing` | `/api/marketing` | [lib/ai/marketing.ts](lib/ai/marketing.ts), [lib/ai/timing.ts](lib/ai/timing.ts) |
| 5 | Customer churn (RFM) | `/dashboard/customers` | — | [lib/ai/churn.ts](lib/ai/churn.ts) |
| 6 | Bangla voice co‑pilot | `/dashboard/voice` | `/api/voice-query` | [lib/ai/voice-query.ts](lib/ai/voice-query.ts) |
| 7 | RTO risk predictor | `/dashboard/rto` | — | [lib/ai/rto.ts](lib/ai/rto.ts) |
| 8 | Khata‑to‑Cloud onboarding (CSV import) | `/dashboard/onboarding` | `/api/import`, `/api/khata` | [lib/data/imported.ts](lib/data/imported.ts) |
| 9 | Shop analysis (vision + trends from ML backend) | `/dashboard/analyze` | `/api/analyze-shop` | [lib/ai/shop-analysis.ts](lib/ai/shop-analysis.ts) |
| 10 | **Pilot — AI co‑pilot chat** | `/dashboard/agent` | `/api/agent/{chat,history,campaigns}` | [lib/agent/{openai,tools,store}.ts](lib/agent/) |
| 11 | **Email‑marketing automation (Layer 1)** | driven via Pilot | `/api/cron/run-due-campaigns`, `/api/unsubscribe`, `/[locale]/unsubscribe/[token]` | [lib/email/](lib/email/) |
| 12 | Auth (signup / login / logout) | `/[locale]/{signup,login}` | `/api/auth/{signup,login,logout}` | [lib/auth.ts](lib/auth.ts), [lib/users.ts](lib/users.ts) |
| 13 | Bilingual UI (EN + বাংলা) | every page | — | [lib/i18n/messages.ts](lib/i18n/messages.ts) |

---

## 4. API surface

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/signup` | none | Create account, set signed session cookie |
| POST | `/api/auth/login` | none | Verify credentials, set session cookie |
| POST | `/api/auth/logout` | session | Clear cookie |
| GET | `/api/import` | session | Status: does this shop have imported data? |
| POST | `/api/import` | session | Upload normalized `{products, sales}` rows |
| DELETE | `/api/import` | session | Drop the imported dataset |
| POST | `/api/analyze-shop` | none | Proxy to HF Space `/analyze-shop`; falls back to deterministic stub |
| POST | `/api/recommend` | session | Per‑customer recommendations |
| POST | `/api/marketing` | session | Generate marketing message draft for a non‑Pilot flow |
| POST | `/api/voice-query` | session | Answer a Bangla voice question in text |
| POST | `/api/khata` | session | Multi‑modal khata onboarding stub |
| POST | `/api/agent/chat` | session | One turn of the Pilot agent loop (tool calls + final reply) |
| GET | `/api/agent/history` | session | List the user's past chats (summaries) |
| GET | `/api/agent/history/[chatId]` | session | Full chat with messages |
| DELETE | `/api/agent/history/[chatId]` | session | Delete a chat |
| GET | `/api/agent/campaigns` | session | List the user's scheduled campaigns |
| GET / POST | `/api/cron/run-due-campaigns` | `Bearer CRON_SECRET` | Pull due email campaigns, send via Resend, record state |
| GET / POST | `/api/unsubscribe` | signed token | One‑click unsubscribe (also handles Gmail/Yahoo `List‑Unsubscribe‑Post`) |

---

## 5. Data and storage layout

There are exactly two persistence layers:

1. **Per‑instance in‑memory `Map`s** inside the Vercel Node runtime — hot cache only.
2. **Durable shared KV** at `https://bijoynayemhasan-dokanai-ml.hf.space/kv/{key}`, admin‑secret guarded.

Every dashboard render `await hydrateImported(email)` first ([app/[locale]/dashboard/DashboardLayoutWrapper.tsx](app/[locale]/dashboard/DashboardLayoutWrapper.tsx)) so the hot cache is refilled from the KV before any synchronous `getStore()` call.

### KV key map

| Key pattern | Holds | Written by | Read by |
|---|---|---|---|
| `account:<email>` | Account record (name, email, salted password hash) | `/api/auth/signup` | `/api/auth/login`, every session check |
| `dataset:<email>` | Full imported `{products, customers, orders}` for the shop | `/api/import` POST, NoDataState rehydrate | dashboard layout hydrate, `/api/agent/chat`, `/api/analyze-shop`, cron worker |
| `chat:<email>:<chatId>` | One Pilot chat (full messages) | `/api/agent/chat` | `/api/agent/history/[chatId]` |
| `chat-index:<email>` | Summary list (id, title, updatedAt) for sidebar | `/api/agent/chat` | `/api/agent/history` |
| `chats:<email>` (legacy) | Pre‑refactor full‑array chat blob, kept for back‑compat read | (none — read‑only) | `listChats` fallback |
| `campaigns:<email>` | Array of `Campaign` objects (status, stats, subject, ctaUrl, ...) | `schedule_marketing_campaign`, cron worker | `/api/agent/campaigns`, Pilot tools |
| `cmprec:<email>:<campaignId>:<customerId>` | One recipient send record (state, providerId, errorReason, ts) | cron worker | cron worker (idempotency) |
| `due-campaigns:v1` | Global queue of `{accountEmail, campaignId, scheduledFor}` items | `addCampaign` (when channel=email) | cron worker |

> Per‑recipient records and per‑chat keys are the **race‑safe** pattern: one writer per key. The campaigns and chats indexes are best‑effort summaries; the source of truth is always the per‑item key.

### Type shapes (high level, full types in [lib/types.ts](lib/types.ts))

- **Account** = `{ name, email, passwordHash }`
- **Customer** = `{ id, name, phone, city, joinedAt, preferredLang, email?, subscribed?, unsubscribedAt? }` — the last three are additive, optional, and enable email‑marketing.
- **Product** = `{ id, name, nameBn, category, price, cost, stock, tags }`
- **Order** = `{ id, customerId, date, items[], total, paymentMethod, status, city, courier }`
- **Chat** = `{ id, title, createdAt, updatedAt, messages[] }`
- **Campaign** = `{ id, createdAt, scheduledFor, startedAt?, finishedAt?, channel, audience, message, status, subject?, ctaLabel?, ctaUrl?, stats? }`
- **RecipientRecord** = `{ customerId, email?, state, providerId?, errorReason?, errorMessage?, ts }`

---

## 6. Repository layout

```
app/
  [locale]/                            top-level locale segment (en | bn)
    Home.tsx, LocaleLayout.tsx
    login/, signup/                    auth pages
    unsubscribe/[token]/               public one-click unsubscribe page
    dashboard/                         auth-gated; layout hydrates KV
      DashboardLayoutWrapper.tsx       async server component, hydrateImported()
      Overview.tsx, page.tsx           overview (KPIs, recent orders)
      agent/                           Pilot AI chat
        Pilot.tsx, PilotClient.tsx, TypingText.tsx
      analyze/                         /analyze-shop visual + insights
      forecast/, pricing/, recommendations/, marketing/, customers/,
      voice/, rto/, onboarding/        the 8 original features
  api/
    auth/{signup,login,logout}/
    import/                            CSV import + KV persistence
    analyze-shop/                      proxies to HF Space
    recommend/, marketing/, voice-query/, khata/
    agent/{chat,history,campaigns}/    Pilot endpoints
    cron/run-due-campaigns/            email-automation worker
    unsubscribe/                       token-signed opt-out
components/
  DashboardShell.tsx, NoDataState.tsx, KpiCard.tsx, StatusPill.tsx,
  LangSwitcher.tsx, LogoutButton.tsx, charts/*
lib/
  ai/         churn, forecast, marketing, overview, pricing, recommend,
              rto, shop-analysis, timing, voice-query (pure functions over
              the in-memory store; same code answers Pilot tools + dashboard)
  agent/      openai (tool-calling loop), tools (15 tools), store (chats +
              campaigns + queue + recipients)
  email/      resend (env-gated client), template (per-recipient HTML +
              text + List-Unsubscribe), audience (segment -> recipients),
              unsub-token (HMAC-signed)
  data/       imported (KV-backed dataset), store (sync facade getStore()),
              seed (deterministic demo data), festivals
  i18n/       EN + BN message dictionaries
  kv.ts       generic /kv client for the HF Space
  auth.ts     HMAC-signed session cookie
  users.ts    accounts (KV + in-memory cache + demo account)
  types.ts    shared TS types
ml-backend/
  Dockerfile, requirements.txt, README.md (deploy notes)
  app/
    main.py        FastAPI: /health, /analyze-shop, /classify-image,
                   /admin/refresh-trends, /trends, /kv/{key} GET/POST/DELETE
    pipeline.py, schemas.py, settings.py
    models/        trained model artifacts
    data/          festivals.csv etc.
  datasets/synthetic/    bd_listings, festival_calendar, shops,
                         shop_catalogs, shop_sales (LFS)
DokanAI-Plan.md         original 24-hour build plan
PLAN.md                 detailed feature realism checklist
ML-BACKEND-PLAN.md      ML backend design (7-component suite)
PITCH-VIDEO.md          demo script
Dockerfile              Next.js multi-stage production image
docker-compose.yml      one-command local stack (web + ml-backend)
.env.example            local + Vercel env documentation
```

---

## 7. The Pilot AI agent — chat with tool calling

`/dashboard/agent` opens a chat with **Pilot**, an OpenAI‑backed agent that has read‑access to the shop's real data and one act‑tool that schedules email campaigns.

### Chat sequence

```
   User types in PilotClient
         │
         │ POST /api/agent/chat { chatId?, message }
         ▼
   ChatApi.POST
         │
         │ await hydrateImported(session.email)   ← fill in-memory store from KV
         ▼
   runAgent(systemPrompt, priorTextHistory, message, {email})
         │
         │ loop (max 5 rounds)
         ▼
   OpenAI Chat Completions (gpt-4o-mini)
         │
         │ tool_calls? → run each tool locally
         ▼
   findTool(name).run(args, { email })
         │
         │ tool returns JSON (e.g. list of customers, scheduled campaign)
         │ pushed back as a "tool" message; loop again
         ▼
   Final assistant text (no more tool_calls)
         │
         │ saveChat(email, chat)     ← per-chat KV key + index upsert
         ▼
   Response: { chatId, title, assistant, toolCalls[] }
         │
         ▼
   PilotClient renders the reply through react-markdown + remark-gfm
   (tables render as real <table>; content types out at 25 ms/char)
```

### Tool catalogue (15 tools, defined in [lib/agent/tools.ts](lib/agent/tools.ts))

| Category | Tool | What it does |
|---|---|---|
| Overview | `get_shop_overview` | 30‑day KPIs + daily revenue + recent orders |
| Customers | `list_customers_by_segment` | At‑risk / VIP / dormant / loyal / new (RFM) |
| Customers | `get_segment_breakdown` | Counts per segment |
| Customers | `list_top_customers` | Top by lifetime spend |
| Customers | `list_recommendations_for_customer` | Per‑customer next‑best products |
| Products | `list_top_products` | Top by units sold (last 60 d) |
| Products | `list_low_stock` | Sorted by days‑of‑stock |
| Pricing | `list_pricing_suggestions` | Raise / lower / hold with rationale |
| Pricing | `list_bundle_suggestions` | Co‑purchase bundles |
| RTO | `list_rto_risk_orders` | Pending COD orders ranked by risk |
| RTO | `get_rto_projection` | Projected RTO loss + avoidable share |
| Forecast | `get_daily_forecast` | Total units/day next ~14 d |
| Marketing | `get_audience_count` | Customers in `all / vip / dormant / atrisk` |
| Marketing | `draft_marketing_message` | Bilingual draft (subject for email) |
| Marketing | `list_subscribers` | Opted‑in recipients with email |
| Marketing | **`schedule_marketing_campaign`** | Persists the campaign + enqueues for cron (email channel actually sends) |
| Marketing | `list_recent_campaigns` | History with status + stats |
| Marketing | `get_campaign_status` | One campaign's current state + stats |
| Marketing | `cancel_campaign` | Cancel a still‑scheduled campaign |
| Marketing | `set_subscriber_consent` | Manual opt‑in / out on a customer |

The system prompt forces Pilot to **always use a tool when asked about data**, render tabular data as GFM tables, reply in the user's language, and walk through draft → confirm → schedule when the user asks to send a campaign.

---

## 8. Email‑marketing automation

```
   Pilot chat: "Email a 15% off offer to my dormant customers tomorrow 6pm"
                                         │
                                         ▼
       draft_marketing_message(audience='dormant', goal='winback', channel='email')
                                         │
                                         ▼
       list_subscribers('dormant')   ← tells the user how many will receive
                                         │
                                         ▼
       user confirms in chat
                                         │
                                         ▼
       schedule_marketing_campaign(channel='email', subject, message,
                                   scheduled_for='2026-05-28T12:00:00Z',
                                   cta_label?, cta_url?)
                                         │
                                         ▼
       campaigns:<email>  ← stored with status='scheduled'
       due-campaigns:v1   ← entry pushed into the global queue
                                         │
                                         │   . . . meanwhile, every 5–10 min . . .
                                         ▼
       External cron job hits:
       POST /api/cron/run-due-campaigns
       Authorization: Bearer CRON_SECRET
                                         │
                                         ▼
       cron worker pulls each due item:
         1. status=scheduled → mark in_progress
         2. hydrateImported(account)         ← from KV
         3. resolveAudience(descriptor)      ← RFM + email + consent + unsubscribed
         4. for each recipient r:
              - getRecipientRecord (idempotency)
              - renderCampaignEmail (subject, HTML, plain text, unsubscribe
                URL signed with AUTH_SECRET, List-Unsubscribe headers)
              - sendEmail via Resend (per-recipient Idempotency-Key)
              - putRecipientRecord (sent | failed | skipped-...)
         5. update campaign stats + status (sent | partial | failed)
         6. dequeueDue
                                         │
                                         ▼
       Recipient inbox          ← real email
                                         │
                                         │   user clicks unsubscribe footer
                                         ▼
       /[locale]/unsubscribe/[token]   ← public page (no auth)
                                         │
                                         │  POST /api/unsubscribe with token
                                         ▼
       parseUnsubToken (HMAC, AUTH_SECRET)
       hydrateImported(account)
       setCustomerSubscribed(false)   ← persists back to dataset:<email>
       (also handles Gmail/Yahoo one-click List-Unsubscribe-Post form)
```

### Why no actual sends fire if `RESEND_API_KEY` is missing
The Resend client ([lib/email/resend.ts](lib/email/resend.ts)) is **env‑gated**: when `RESEND_API_KEY` or `FROM_EMAIL` is not set, every call resolves with `{ ok:false, reason:"not-configured" }`. The cron still processes due campaigns; each recipient is recorded with that reason. The campaign visibly *ran*, so the operator can see what's missing. Setting the env and redeploying lights everything up — no code change needed.

### Compliance
- **Opt‑in only** — `subscribed` defaults to `false` on import unless the CSV's `consent` column is truthy.
- **One‑click unsubscribe** is the public `/unsubscribe/[token]` page **plus** `List-Unsubscribe` + `List-Unsubscribe-Post=One-Click` headers on every email (Gmail/Yahoo bulk‑sender rules, Feb 2024).
- Per‑recipient **idempotency key** = `<campaignId>:<customerId>` prevents double‑sends on cron retries.
- Token format: `base64url(JSON({a:email, c:customerId})).<HMAC-SHA256 sig>` using `AUTH_SECRET`.

---

## 9. Critical user journeys (sequence views)

### 9.1 Sign‑up

```
   Browser  ──── POST /api/auth/signup {name,email,password} ────▶ Vercel
                                                                    │
                                                       createAccount │  validate
                                                                    ▼
                              account:<email>   ◀──── kvPut ──── ┐  │
                                  in HF KV                       │  │
                                                                 │  ▼
                                                              cache in-memory Map
                                                                    │
                          Set-Cookie: dokanai_session ◀─── HMAC signSession({email,name})
                                                                    │
   Browser  ◀────────── 200 { ok:true, name, email } ───────────────┘

   → next request carries the cookie; getSession() decodes + verifies it
     (HMAC over the JSON payload using AUTH_SECRET)
```

### 9.2 CSV import

```
   /dashboard/onboarding/KhataUploader.tsx
        │
        │ user selects products.csv and/or sales.csv (or just one)
        ▼
   parseCsv (client side) — alias-aware column matching
   accepted product/name aliases: name, product, product_type, product_name,
                                  item, item_name, title, productname
   accepted sales columns: date, product, qty, unit_price, customer, payment,
                           status, city, email, consent
        │
        ▼
   POST /api/import { products: [...], sales: [...] }
        │
        ▼
   buildDataset → setImported (in-memory) → persistImported (KV)
        │                                       │
        │                              dataset:<email>  ← durable
        ▼
   localStorage mirror in the browser ('dokanai:dataset:v1')
        │
        ▼
   user clicks "Go to dashboard" → /dashboard
        │
        ▼
   DashboardLayoutWrapper (async server component)
        │ await hydrateImported(session.email) ← cold instance gets data from KV
        ▼
   Overview renders KPIs/charts/recent orders from getStore()

   If a render lands on a cold instance and the KV is unreachable:
   NoDataState's <Greeting/> rehydrates by re-POSTing the localStorage
   mirror (one bounded retry loop, max 3 attempts via sessionStorage).
```

### 9.3 Pilot chat with tool use

See **§7** above.

### 9.4 Scheduled email send

See **§8** above.

### 9.5 ML‑powered shop analysis

```
   /dashboard/analyze    (Analyze Shop)
        │
        ▼
   POST /api/analyze-shop { listings, sales, images?, useAccountData? }
        │
        │ if useAccountData: getSession → hydrateImported → pull
        │ products/orders from the in-memory store
        ▼
   if ML_BACKEND_URL is set:
        │ POST {base}/analyze-shop  (timeout 55s — HF Space cold start budget)
        ▼
   FastAPI ml-backend (HF Space)
        │
        │ pipeline.py runs:
        │   - shop classifier (text → shop type)
        │   - catalog attribute extractor
        │   - selling-trend computation (cached daily by /admin/refresh-trends)
        │   - dead-stock / restock heuristics
        │   - vision: classify-image (if `images` present)
        ▼
   Returns { shop_type, top_selling, poor_selling, restock,
             popular_styles_to_add, source:"ml-backend", notes[], ... }
        │
        ▼
   rewriteImageUrls() to absolute backend URLs
        │
        ▼
   On any error → analyzeShopStub (deterministic fallback)
```

---

## 10. Environment variables

| Variable | Where | Used by | Required? |
|---|---|---|---|
| `AUTH_SECRET` | Vercel + local | Session cookie HMAC, unsubscribe token signing, account password peppering | yes in prod (else dev default used) |
| `ML_BACKEND_URL` | Vercel + local | `/api/analyze-shop`, `/api/agent/chat` (hydrate), KV client | yes for ML + durable storage |
| `ML_ADMIN_SECRET` | Vercel + local | `lib/kv.ts` `x-admin-secret` header | yes for KV writes/reads |
| `OPENAI_API_KEY` | Vercel + local | Pilot agent | yes for Pilot chat |
| `OPENAI_MODEL` | Vercel + local | Pilot agent | optional, default `gpt-4o-mini` |
| `CRON_SECRET` | Vercel + local | `/api/cron/run-due-campaigns` Bearer auth | yes to enable the worker (no value → 401) |
| `RESEND_API_KEY` | Vercel + local | Resend client | yes to actually send |
| `FROM_EMAIL` | Vercel + local | `From:` header (e.g. `Pilot <pilot@mail.dokanai.com>`) | yes to actually send |
| `REPLY_TO` | Vercel + local | `Reply-To:` header | optional |
| `APP_ORIGIN` | Vercel | Build absolute unsubscribe URLs in emails | optional, defaults to request host |
| `ADMIN_SECRET` (HF Space) | HF Space Settings → Variables and secrets | gates `/kv/*` and `/admin/*` on the FastAPI backend | yes; must equal Vercel's `ML_ADMIN_SECRET` |

---

## 11. Deployment

### Frontend → Vercel

- Project name: `dokanai`
- Production domain: `dokanai.vercel.app`
- Git remote: `https://github.com/bijoy51/Dokanai`
- Auto‑deploy from GitHub: currently **disconnected**. Production is deployed via `vercel --prod` from the CLI. To reconnect, Vercel → dokanai → Settings → Git → re‑link the repo.

### ML backend → Hugging Face Space

- Space: `bijoynayemhasan/dokanai-ml`
- Live URL: `https://bijoynayemhasan-dokanai-ml.hf.space`
- Deploy: `git push space main` from inside `ml-backend/` (the Space has its own git remote). Each push triggers a Docker rebuild.
- The `/kv/*` endpoints live in [ml-backend/app/main.py](ml-backend/app/main.py); they require the Space to be rebuilt whenever they change.

### One‑command local stack

`docker compose up --build` brings up:
- `web` → Next.js production build at `http://localhost:3000`
- `ml-backend` → FastAPI at `http://localhost:7860`

`.env.example` documents every variable; copy to `.env`, customise, run. Without external secrets the stack still runs end‑to‑end with the demo account.

---

## 12. Demo account (always works)

- Email: `demo@dokanai.app`
- Password: `demo1234`

The demo account is wired to a synthetic deterministic dataset (~220 customers, ~1500 orders, 40 products, 6 months of history). It bypasses CSV import and bypasses the durable‑storage requirement, so it's always demoable even on a clean instance.

---

## 13. Known gaps and Phase 2 candidates

| Area | State today | Phase 2 |
|---|---|---|
| Non‑email channels (WhatsApp, SMS, Messenger) | drafts work; scheduling is record‑only | Twilio / 360dialog WhatsApp BSP, SSL Wireless SMS |
| Trigger‑based marketing (abandoned cart, post‑purchase, no‑purchase‑30‑days) | not implemented; same cron will handle it | rule store at `rule:<email>:<id>`, cron evaluates each run |
| Festival auto‑blasts | manual via Pilot | tie `lib/data/festivals.ts` to the cron |
| Email opens / clicks tracking | unsubscribe only | tracking pixel + redirect endpoint, Resend webhook |
| Custom domain on Vercel | detached — currently serves only on `dokanai.vercel.app` | wire DNS at registrar; previously attempted with ExonHost |
| Real DB | KV is the durable store | swap `lib/kv.ts` for Vercel Postgres / Upstash without changing callers |
| GitHub auto‑deploy | disconnected from Vercel | re‑link in project settings |

---

## 14. Plan documents

The original product + technical plans are kept in this repo for reference:

- [DokanAI-Plan.md](DokanAI-Plan.md) — product vision, the 8 flagship features, hackathon timeline
- [PLAN.md](PLAN.md) — feature‑by‑feature realism checklist (what's real vs key‑flips‑it‑real)
- [ML-BACKEND-PLAN.md](ML-BACKEND-PLAN.md) — the 7‑component ML suite design
- [PITCH-VIDEO.md](PITCH-VIDEO.md) — demo script

---

## 15. Tech summary

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Recharts, lucide-react, react-markdown + remark-gfm
- **AI agent:** OpenAI Chat Completions API (`gpt-4o-mini`) with function calling, ~25 ms/char client‑side typing animation
- **Backend ML:** Python 3.11, FastAPI, PyTorch (vision), scikit‑learn (text classifier), pandas (trend analytics)
- **Email:** Resend HTTP API with `List-Unsubscribe` + `List-Unsubscribe-Post=One-Click` headers
- **Storage:** in‑memory `dict` on a single always‑on HF Space container, exposed as a shared KV under `/kv/{key}` with `x-admin-secret` auth
- **Auth:** HMAC‑signed session cookie (`AUTH_SECRET`), salted+peppered SHA‑256 password hashes
- **Voice:** Web Speech API (browser‑native Bangla STT + TTS)
- **i18n:** custom dict in [lib/i18n/messages.ts](lib/i18n/messages.ts), `en | bn`
- **Deployment:** Vercel (frontend) + Hugging Face Spaces (ML + KV)
- **Local dev:** Docker Compose, 2 services, single command
