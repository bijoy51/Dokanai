import { NextResponse } from "next/server";
import {
  authenticateWebhook,
  recordWebhookError,
  recordWebhookPush,
} from "@/lib/zapierSync/store";
import {
  getImported,
  hydrateImported,
  mergeDataset,
  persistImported,
  setImported,
  type RawProduct,
  type RawSale,
} from "@/lib/data/imported";
import { hydrateUploadHistory, recordUpload } from "@/lib/data/upload-history";

export const dynamic = "force-dynamic";

/**
 * POST /api/zapier/webhook/[shopId]?token=...
 *
 * Public, token-gated entry point for the Zapier (and Make / n8n / raw curl)
 * push integration. Fully isolated from the OAuth pull path:
 *   - Different auth scheme (URL token, no session)
 *   - Different state row (zapier-webhook:<email>, not sheet-binding:<email>)
 *   - Different external dependency (no Google API call)
 *   - Shared output: both paths feed into mergeDataset(), which dedups
 *     by content hash. A row that arrived via OAuth pull and then later
 *     via Zapier push won't be double-counted.
 *
 * Accepts three payload shapes (in priority order — first match wins):
 *   1. { products: [...], sales: [...] }
 *        Pre-classified arrays. Used by tools that already know the split.
 *   2. { rows: [...] } or { rows: {...} }
 *        Untyped row(s) — each row is passed through the same
 *        product-vs-sale heuristic the OAuth Sheets reader uses.
 *   3. { row: {...} } OR a bare object
 *        Single row. Zapier's "Webhooks by Zapier → POST" action sends
 *        this shape when "Wrap Request In Array" is off.
 *
 * Size + count guards prevent a misconfigured Zap (loop, retry storm)
 * from running the function budget into the ground.
 */

const MAX_BODY_BYTES = 1_000_000; // 1 MB — one Zap row is typically <2 KB
const MAX_ROWS_PER_PUSH = 500;    // sane upper bound for a single Zap trigger

// Same heuristic as lib/google/sheets.ts so a row that flows through OAuth
// pull and the same row flowing through Zapier classify identically.
function classifyRow(r: Record<string, unknown>): { product?: RawProduct; sale?: RawSale } {
  const out: { product?: RawProduct; sale?: RawSale } = {};
  const name = pickString(r, ["name", "title", "product_name", "item"]);
  const price = pickAny(r, ["price", "unit_price", "rate"]);
  if (name && price !== undefined && price !== "") {
    out.product = {
      name,
      title: name,
      category: pickString(r, ["category", "type"]) ?? undefined,
      price: typeof price === "number" ? price : String(price),
      cost: numOrUndef(pickAny(r, ["cost", "buy_price", "purchase_price"])),
      stock: numOrUndef(pickAny(r, ["stock", "qty_in_stock", "inventory"])),
    };
  }
  const date = pickString(r, ["date", "order_date", "sale_date"]);
  const productName = pickString(r, ["product", "item", "name"]);
  if (date && productName) {
    out.sale = {
      date,
      product: productName,
      qty: numOrUndef(pickAny(r, ["qty", "quantity", "units"])) ?? 1,
      unit_price: numOrUndef(pickAny(r, ["unit_price", "price", "rate"])),
      customer: pickString(r, ["customer", "customer_name", "buyer"]) ?? undefined,
      payment: pickString(r, ["payment", "payment_method", "method"]) ?? undefined,
      status: pickString(r, ["status", "delivery_status"]) ?? undefined,
      city: pickString(r, ["city", "town", "area"]) ?? undefined,
      email: pickString(r, ["email", "customer_email"]) ?? undefined,
      consent: pickString(r, ["consent", "marketing_consent", "opt_in"]) ?? undefined,
    };
  }
  return out;
}
function pickAny(r: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = r[k] ?? r[k.toLowerCase()];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}
function pickString(r: Record<string, unknown>, keys: string[]): string | null {
  const v = pickAny(r, keys);
  if (v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}
function numOrUndef(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Normalize whatever Zapier (or anyone) posted into canonical arrays.
 * Returns the rejection reason on validation failures so the route can
 * surface it both to the HTTP response and to the saved lastError.
 */
function normalizePayload(
  body: unknown,
): { products: RawProduct[]; sales: RawSale[] } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Body must be a JSON object." };
  const b = body as Record<string, unknown>;

  // Shape 1: pre-classified arrays.
  if (Array.isArray(b.products) || Array.isArray(b.sales)) {
    const products = Array.isArray(b.products) ? (b.products as RawProduct[]) : [];
    const sales = Array.isArray(b.sales) ? (b.sales as RawSale[]) : [];
    if (products.length + sales.length > MAX_ROWS_PER_PUSH) {
      return { error: `Too many rows in one push (>${MAX_ROWS_PER_PUSH}). Split into smaller batches.` };
    }
    return { products, sales };
  }

  // Shape 2: rows array (or a single row passed as `rows`).
  let rows: Record<string, unknown>[] | null = null;
  if (Array.isArray(b.rows)) rows = b.rows as Record<string, unknown>[];
  else if (b.rows && typeof b.rows === "object") rows = [b.rows as Record<string, unknown>];

  // Shape 3: `row` or bare object as the row itself.
  if (!rows && b.row && typeof b.row === "object") {
    rows = [b.row as Record<string, unknown>];
  } else if (!rows) {
    // Bare object — treat the entire body as a single row.
    rows = [b];
  }

  if (rows.length > MAX_ROWS_PER_PUSH) {
    return { error: `Too many rows in one push (>${MAX_ROWS_PER_PUSH}). Split into smaller batches.` };
  }

  const products: RawProduct[] = [];
  const sales: RawSale[] = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const c = classifyRow(r as Record<string, unknown>);
    if (c.product) products.push(c.product);
    if (c.sale) sales.push(c.sale);
  }
  return { products, sales };
}

/**
 * Also accept GET so the user can sanity-check the URL in a browser. It
 * returns a small ack — never any of their shop data.
 */
export async function GET(req: Request, { params }: { params: { shopId: string } }) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const email = await authenticateWebhook(params.shopId, token);
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Invalid shopId or token." },
      { status: 401 },
    );
  }
  return NextResponse.json({
    ok: true,
    message:
      "Zapier webhook is live. POST JSON to this same URL — one of { products, sales }, { rows: [...] }, { row: {...} }, or a bare row object.",
  });
}

export async function POST(req: Request, { params }: { params: { shopId: string } }) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const email = await authenticateWebhook(params.shopId, token);
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Invalid shopId or token." },
      { status: 401 },
    );
  }

  const lenHeader = req.headers.get("content-length");
  if (lenHeader && Number(lenHeader) > MAX_BODY_BYTES) {
    const msg = `Payload too large (${(Number(lenHeader) / 1000).toFixed(0)} KB). Limit is ${MAX_BODY_BYTES / 1000} KB per push.`;
    await recordWebhookError(email, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const msg = "Invalid JSON body.";
    await recordWebhookError(email, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  const normalized = normalizePayload(body);
  if ("error" in normalized) {
    await recordWebhookError(email, normalized.error);
    return NextResponse.json({ ok: false, error: normalized.error }, { status: 400 });
  }
  const { products, sales } = normalized;
  if (products.length === 0 && sales.length === 0) {
    const msg =
      "No usable rows in the payload. Each row needs at least one of: name+price (product) or date+product (sale). Check your Zap's field mapping.";
    await recordWebhookError(email, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  try {
    await hydrateImported(email);
    await hydrateUploadHistory(email);
    const existing = getImported(email);
    const { dataset, delta } = mergeDataset(existing, products, sales);
    if (dataset.products.length === 0) {
      const msg = "No usable products in the merged dataset. Verify your column mapping.";
      await recordWebhookError(email, msg);
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    setImported(email, dataset);
    await persistImported(email, dataset);
    await recordWebhookPush(email, products.length + sales.length);

    const totals = {
      products: dataset.products.length,
      customers: dataset.customers.length,
      orders: dataset.orders.length,
    };

    // Only stamp an upload-history event when the merge actually moved.
    // Zapier on a free plan polls every 15 min and re-sends the same rows
    // sometimes — dedup at the merge layer + skip-no-op here keeps the
    // Uploads tab readable.
    const changed =
      delta.productsAdded +
        delta.productsUpdated +
        delta.customersAdded +
        delta.ordersAdded >
      0;
    if (changed) {
      await recordUpload(email, {
        source: "live-sync",
        status: "ok",
        delta,
        totals,
        note: "Zapier webhook",
      });
    }

    return NextResponse.json({ ok: true, counts: totals, delta });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error while ingesting webhook payload.";
    await recordWebhookError(email, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
