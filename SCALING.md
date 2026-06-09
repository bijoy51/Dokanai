# Scaling, Reliability & Standards

How DokanAI scales technically and operationally, the known limits, and the
external standards it aligns with. Companion to the architecture in
[README.md](README.md).

## 1. Scale model

| Layer | Scaling behaviour |
|---|---|
| Web + API (Vercel) | Stateless serverless functions — Vercel scales instances horizontally on demand. No server to provision. |
| Durable store (Neon Postgres) | Single `kv (key, value jsonb)` table behind [lib/kv.ts](lib/kv.ts). Connection-pooled (`max: 2` per instance, 30s idle reap) to respect Neon's connection ceiling. |
| ML backend (HF Space) | Always-on container; CPU inference (ONNX/joblib) with heuristic fallbacks so a cold model never blocks a response. |
| Email (Resend) | Async via the cron worker, per-recipient idempotency keys, so retries never double-send. |
| Pilot (OpenAI) | Bounded tool loop (max 5 rounds, 60s timeout) so one chat can't run away. |

## 2. Developer-API hardening

The public `/api/v1/*` surface is built for third-party scale:

- **API keys** — issued per account ([lib/apiKeys](lib/apiKeys), `/api/developer/keys`).
- **Bearer auth** — every `/api/v1` call is verified ([lib/security/bearerAuth.ts](lib/security/bearerAuth.ts)).
- **Rate limiting** — per-key throttling ([lib/security/rateLimit.ts](lib/security/rateLimit.ts)) protects the backend under load.
- **Usage metering** — `/api/v1/usage` exposes consumption.

## 3. Known limits & mitigations

| Limit | Mitigation / path |
|---|---|
| Neon free-tier connection cap | Pool capped at 2/instance + idle reaping; upgrade tier or add PgBouncer when traffic grows. |
| HF Space single container | Keep-warm cron; stateless inference so it can move to autoscaled GPU/Cloud Run later without app changes. |
| OpenAI rate/cost | Bounded tool loop + temperature pinned; per-feature env-gating degrades to deterministic fallbacks. |
| Single-region today | Architecture is region-agnostic (Vercel edge + managed Postgres); multi-region is a config change, not a rewrite. |

## 4. International-standards alignment

- **Payments / PCI** — card data never touches our servers; we use Stripe-hosted Checkout ([lib/stripe.ts](lib/stripe.ts)), so PCI scope stays with Stripe.
- **Bulk-sender compliance** — `List-Unsubscribe` + `List-Unsubscribe-Post=One-Click` headers and opt-in-only consent meet the Gmail/Yahoo Feb-2024 rules.
- **Data privacy** — customer PII is admin-secret gated, opt-in only, and never used for training or sold (see README §5 "Data privacy & responsible AI").
- **Responsible AI** — a live fairness audit (`/api/bias-audit`, Trust page) and SHAP-based explainability back the transparency claims.

## 5. Continuous verification

- **CI** ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs typecheck + unit tests + production build on every push to `main`.
- **Load test** — `node scripts/loadtest.mjs <url> <concurrency> <total>` measures throughput and p50/p95 latency against a deployed endpoint. Example:
  ```bash
  node scripts/loadtest.mjs https://dokanai.vercel.app/ 20 200
  ```
