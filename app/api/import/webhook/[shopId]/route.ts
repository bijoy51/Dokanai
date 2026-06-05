import { NextResponse } from "next/server";
import {
  authenticateWebhook,
  recordError,
  recordSync,
} from "@/lib/sheetSync/store";
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

/**
 * POST /api/import/webhook/[shopId]?token=...
 *
 * The public, token-gated entry point for Live Sync (Path A). The user
 * pastes this URL into a Google Apps Script (or any other source — Zapier,
 * Make, n8n, raw curl) that POSTs the current sheet contents whenever it
 * changes.
 *
 * Body (JSON): { products?: RawProduct[], sales?: RawSale[] }
 *   Same canonical shape as the existing /api/import endpoint.
 *
 * Semantics:
 *   - APPEND-only merge. Each push is folded into the existing dataset
 *     via mergeDataset(). Order signatures dedupe re-pushes of the same
 *     sheet (the Apps Script sends the FULL sheet on every edit, so
 *     this is what stops duplicates). Old data is preserved across
 *     uploads — old rows the shopkeeper deleted in their sheet stay
 *     in DokanAI's history.
 *   - On error, we record the message in sheet-sync state so the UI
 *     can show "Last error: …" to the user.
 *   - An UploadEvent is recorded only when the merge actually added
 *     something (delta > 0), so the 20-second debounce doesn't spam
 *     the Uploads history with no-op syncs.
 *
 * Why no /api/agent or /api/auth-style cookie check: this URL needs to be
 * callable from an external service (Google's servers running the Apps
 * Script) that has no session. The shopId + token in the URL ARE the
 * auth — verified via constant-time compare in authenticateWebhook.
 */

const MAX_BODY_BYTES = 4_000_000; // Vercel body limit headroom.
const MAX_PRODUCTS = 5_000;
const MAX_SALES = 50_000;

// Also accept GET so the user can quickly sanity-check the URL in a
// browser. It returns a small ack — never any of their data.
export async function GET(_req: Request, { params }: { params: { shopId: string } }) {
  const url = new URL(_req.url);
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
    message: "Live Sync endpoint is live. POST the same URL with { products, sales } to push data.",
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

  // Size guard — Vercel rejects at 4.5 MB anyway, but a clean 413 is
  // friendlier than a platform-level error in the Apps Script log.
  const lenHeader = req.headers.get("content-length");
  if (lenHeader && Number(lenHeader) > MAX_BODY_BYTES) {
    const msg = `Payload too large (${(Number(lenHeader) / 1_000_000).toFixed(1)} MB). Split your sheet into smaller batches.`;
    await recordError(email, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 413 });
  }

  let body: { products?: RawProduct[]; sales?: RawSale[] };
  try {
    body = await req.json();
  } catch {
    const msg = "Invalid JSON body.";
    await recordError(email, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  const products = Array.isArray(body.products) ? body.products.slice(0, MAX_PRODUCTS) : [];
  const sales = Array.isArray(body.sales) ? body.sales.slice(0, MAX_SALES) : [];
  if (products.length === 0 && sales.length === 0) {
    const msg = "Empty payload — nothing to sync. Make sure your sheet has a header row with at least one of: name (for products) or date+product (for sales).";
    await recordError(email, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  try {
    await hydrateImported(email);
    await hydrateUploadHistory(email);
    const existing = getImported(email);
    const { dataset, delta } = mergeDataset(existing, products, sales);
    if (dataset.products.length === 0) {
      const msg = "No usable products found in the synced rows. Check that your sheet has the right column headers.";
      await recordError(email, msg);
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    setImported(email, dataset);
    await persistImported(email, dataset);
    await recordSync(email, products.length + sales.length);

    const totals = {
      products: dataset.products.length,
      customers: dataset.customers.length,
      orders: dataset.orders.length,
    };

    // Only record an upload event when the merge actually changed anything,
    // so the Uploads history isn't flooded by debounced no-op syncs.
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
        note: "Google Sheet push",
      });
    }

    return NextResponse.json({ ok: true, counts: totals, delta });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error while ingesting sync payload.";
    await recordError(email, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
