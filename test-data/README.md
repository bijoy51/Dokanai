# DokanAI test dataset

Two CSVs that together exercise **every dashboard feature, Pilot tool, and
email campaign path** of DokanAI. The data is small (19 products,
53 sales rows) so the import POST stays well under Vercel's 4.5 MB body
limit, but each row is hand-picked to put a specific customer into a
specific RFM segment, RTO tier, or marketing audience.

## Files

| File | Rows | What it is |
|---|---|---|
| `products.csv` | 19 | Catalog covering all 5 categories (clothing · home · electronics · beauty · food) with realistic price + cost + stock. |
| `sales.csv` | 53 | Orders spanning **2025‑12‑01 → 2026‑05‑31** (today). Mix of delivered / pending / rto / cancelled, multiple payment methods, multiple cities, ~13 customers with emails + marketing consent, plus walk‑in (anonymous) orders. |

## How to upload

1. Open `https://dokanai.vercel.app/en/dashboard/onboarding` (or local
   `http://localhost:3000/en/dashboard/onboarding`).
2. Sign in to your own account (the demo account is read‑only).
3. **Products CSV** → pick `test-data/products.csv`.
4. **Sales CSV** → pick `test-data/sales.csv`.
5. Click **Import**. You should see something like
   *"19 products · 16 customers · 53 orders"* (plus one walk‑in
   aggregate customer that gathers all anonymous rows).

## Customer cheat sheet — who tests what

Today's date used for these expectations: **2026‑05‑31**.

| Customer | City | Last order | # orders | Spend | Expected segment | What it tests |
|---|---|---|---|---|---|---|
| **Rashida Begum** | Dhaka | today | 5 | ~10 600 | **VIP** | Overview "top customer", VIP email campaign, recommendations‑for‑customer |
| **Nafisa Rahman** | Dhaka | 4 days ago | 6 | ~11 200 | **VIP** | Multi‑category cross‑sell test; bundle recommendations |
| **Karim Hossain** | Chattogram | 6 days ago | 3 | ~4 200 | **Loyal** | Loyal segment, electronics category |
| **Sumaiya Akhter** | Dhaka | 9 days ago | 4 | ~2 800 | **Loyal** | Beauty repeat buyer, restock cycle |
| **Hasan Mahmud** | Sylhet | 11 days ago | 3 | ~4 800 | **Loyal** | Home category + Sylhet (medium RTO city) |
| **Tanvir Islam** | Dhaka | 21 days ago | 2 (4 items) | ~5 100 | **Loyal/Regular** | **consent=no** — should NOT appear in subscriber list |
| **Farhan Ahmed** | Dhaka | 3 days ago | 1 | 1 800 | **New** | First‑order onboarding |
| **Ruma Sultana** | Chattogram | today | 1 | 560 | **New** | Just‑arrived customer |
| **Anika Ferdous** | Dhaka | 1 day ago | 1 | 1 200 | **New** | **No email at all** — should NOT appear in subscriber list |
| **Shahnaz Begum** | Dhaka | 39 days ago | 4 | ~4 350 | **At‑Risk** | Pilot churn predictor "why is this customer at risk?" Win‑back email target |
| **Tahsin Khan** | Dhaka | 56 days ago | 3 | ~5 100 | **At‑Risk** | At‑risk for clothing (60‑day threshold). Pilot drilldown + SHAP |
| **Sabbir Hossain** | Khulna | 136 days ago* | 1 (+1 RTO) | 2 200 | **Dormant** | Past RTO in his history; high cancel_rate signal for ML predictor |
| **Mukti Akter** | Dhaka | 162 days ago | 2 | 1 550 | **Dormant** | Winback campaign candidate |
| **Salim Khan** | Khulna | pending today | 1 | 2 200 | New + **RTO Risk** | Pending COD in Khulna → medium RTO risk |
| **Sajib Ali** | Sylhet | pending today | 1 | 2 500 | New + **RTO Risk** | Pending COD in Sylhet → medium‑high risk |
| **Ripon Mia** | Barishal | pending today | 1 | 3 600 | New + **RTO Risk** | Pending COD in Barishal (highest city risk) with biggest amount → **highest RTO order in the list** |
| **(walk‑in)** | various | — | 9 anonymous | — | aggregated | Tests the anonymous‑customer fallback path |

\* Sabbir's most recent **delivered** order is 2026‑01‑15; his 2026‑04‑12 order was returned (RTO), so RFM excludes it.

## Feature‑by‑feature test plan

### 1. Overview dashboard
- ✅ Revenue last 30 days, orders last 30 days, repeat‑purchase rate, RTO rate cards populate.
- ✅ Revenue chart shows ~3 months of daily data with peaks in late May.
- ✅ "Recent orders" list shows the 5 most recent (Rashida, Ruma, Anika, …).

### 2. Analyze Shop
- ✅ Calls ML backend → detects shop type as **mixed** (clothing+electronics+beauty+food+home all present), surfaces top‑selling items + restock candidates.

### 3. Forecast
- ✅ Per‑product forecast next 14/30 days. Top sellers (Cotton Saree, Hijab, Face Serum) should have non‑trivial forecasts.
- ✅ Days‑of‑stock for `Bluetooth Speaker` (20 in stock, 2 sold in 30d) is healthy; for `Bedsheet Set` (25 in stock, 3 sold) similar; for `Cotton Saree` (40 in stock, 4 sold) healthy. Tweak the data to make any product **run‑low** if you want to see the alert.

### 4. Pricing & Bundles
- ✅ Pricing recommendations: high‑margin products with stale stock should suggest "lower" (e.g. `Bluetooth Speaker`), well‑selling ones suggest "hold" (e.g. `Hijab`).
- ✅ Bundle suggestions: `Phone Charger + Power Bank` and `Hijab + Cotton Saree` co‑purchase patterns are seeded.

### 5. Recommendations
- ✅ Picking **Nafisa Rahman** (5+ orders across categories) yields the richest recommendations.
- ✅ Picking **Tahsin Khan** (clothing‑only) yields clothing‑heavy recommendations.

### 6. Auto‑Marketing → Email Composer
1. Open `/dashboard/marketing` → use the new **Email marketing** card.
2. Pick audience **VIP** → recipients ~2 (Rashida, Nafisa).
3. Pick audience **At‑Risk Loyal** → recipients ~2 (Shahnaz, Tahsin).
4. Pick audience **RTO Risk** → recipients ~3 (Salim, Sajib, Ripon).
5. Schedule for 1 minute from now → trigger cron → check inbox (RESEND must be configured; otherwise the campaign records but doesn't send).

### 7. Auto‑Marketing → Pilot agent
Ask Pilot:
- **"Who is at risk?"** → list_customers_by_segment returns Shahnaz + Tahsin.
- **"List my subscribers."** → list_subscribers returns 13 customers (everyone with `email` AND `consent=yes`). Tanvir, Anika, Sabbir, all walk‑ins should be **excluded**.
- **"Predict churn for Shahnaz Begum"** → predict_churn_for_customer calls the ML backend, returns probability + SHAP top‑drivers (`recency_days=39` should push risk up, `frequency=4` should pull it down).
- **"Send a winback email to dormant customers"** → drafts → asks to confirm → schedules.

### 8. Customers page (RFM)
- ✅ The 7‑bucket distribution shows: 2 VIP · 4 Loyal · 4 New · 2 At‑Risk · 2 Dormant · 3 pending‑only‑New · 1 walk‑in.

### 9. Bangla Voice
- Not data‑driven; works regardless of CSV content. Speak any of the cheat‑sheet questions and verify it transcribes.

### 10. RTO Risk
- ✅ Three pending COD orders appear in the risk table.
- ✅ **Ripon Mia (Barishal, 3 600 BDT)** should rank #1 by riskScore.
- ✅ Sabbir Hossain's customer history has 1 RTO + 1 delivered → 50% past‑RTO rate; if he had a pending order it'd be flagged highest. (He doesn't here — his row demonstrates **historical** RTO signal feeding the ML predictor.)
- ✅ rtoSummaryProjection shows projected loss and how much "require advance on high‑risk" saves.

### 11. Pilot churn predictor (ML backend)
Ask Pilot **"Predict churn for Shahnaz Begum"** — expect:
- `churn_probability` around **0.45–0.65** (medium risk; she's a borderline at‑risk loyal in clothing)
- top driver: `recency_days=39` → increases risk
- second driver: `frequency_90d=4` → decreases risk (still buying)
- thresholds returned: `{at_risk_days: 60, churned_days: 120}` (clothing)

Ask **"Predict churn for Mukti Akter"** — expect probability ≥ **0.90** (dormant 162 days in beauty whose churn window is 90).

### 12. Khata‑to‑Cloud import itself
This very upload tests it. Successful import should show
**"19 products · 16 customers · 53 orders"** on the success card.

## Edge cases this dataset deliberately includes

- **Walk‑in orders** (no `customer` column) → aggregated under one synthetic customer.
- **Missing email** (Anika Ferdous) → must not be a subscriber.
- **Email + consent=no** (Tanvir Islam) → must not be a subscriber.
- **One past RTO + one delivered** (Sabbir Hossain) → customer‑history features feed the ML predictor's `cancel_rate`‑like signal.
- **Pending COD across all three risky cities** (Khulna · Sylhet · Barishal) → RTO ranking.
- **One cancelled walk‑in order** → exercises the `status=cancelled` filter (excluded from RFM, excluded from revenue).
- **Spanning 6 months** (Dec 2025 → May 2026) → forecast has enough history; dormant detection works.
- **Multi‑item orders** (Tanvir's Power Bank + Phone Charger, Rashida's Saree + Hijab) → co‑purchase mining for bundles.
- **Same customer across multiple categories** (Nafisa: clothing + electronics + beauty) → cross‑category recommendation.

## Reset between tests

To clear and re‑import:
1. Go to `/dashboard/onboarding`.
2. Click **Clear data** (if present), or use the Pilot tool to delete, or
3. Just re‑upload — the importer replaces the dataset for your account.

## Not committed to git

These three files live under `test-data/` which is **not** added to git
yet. If you want them in the repo, run:

```powershell
git add test-data/
git commit -m "Add manual smoke-test fixtures"
```

…or keep them local‑only (recommended — fixtures don't ship to
production).
