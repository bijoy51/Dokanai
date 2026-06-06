import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api/auth";
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
 * POST /api/v1/data/sync
 * Body: { products?: RawProduct[], sales?: RawSale[] }
 *
 * Single-shot ingest endpoint. Append-only merge with content-hash dedup
 * (shared with Zapier + Google Sheets paths). Safe to call repeatedly —
 * the same row sent twice won't double-count.
 */

const MAX_BODY_BYTES = 4_000_000; // 4 MB — bigger than Zapier path because devs send bigger batches
const MAX_PRODUCTS = 50_000;
const MAX_SALES = 200_000;

export async function POST(req: Request) {
  const ctx = await requireApiKey(req, { needs: "write" });
  if ("error" in ctx) return ctx.error;

  const lenHeader = req.headers.get("content-length");
  if (lenHeader && Number(lenHeader) > MAX_BODY_BYTES) {
    return NextResponse.json(
      {
        error: `Payload too large (${(Number(lenHeader) / 1_000_000).toFixed(1)} MB). Limit ${MAX_BODY_BYTES / 1_000_000} MB per request.`,
        code: "payload_too_large",
      },
      { status: 413 },
    );
  }

  let body: { products?: RawProduct[]; sales?: RawSale[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body.", code: "invalid_body" },
      { status: 400 },
    );
  }

  const products = Array.isArray(body.products) ? body.products.slice(0, MAX_PRODUCTS) : [];
  const sales = Array.isArray(body.sales) ? body.sales.slice(0, MAX_SALES) : [];
  if (products.length === 0 && sales.length === 0) {
    return NextResponse.json(
      {
        error:
          "Provide at least one of `products[]` or `sales[]`. See /api/v1 docs for shape.",
        code: "empty_payload",
      },
      { status: 400 },
    );
  }

  try {
    await hydrateImported(ctx.email);
    await hydrateUploadHistory(ctx.email);
    const existing = getImported(ctx.email);
    const { dataset, delta } = mergeDataset(existing, products, sales);
    setImported(ctx.email, dataset);
    await persistImported(ctx.email, dataset);

    const counts = {
      products: dataset.products.length,
      customers: dataset.customers.length,
      orders: dataset.orders.length,
    };

    const changed =
      delta.productsAdded + delta.productsUpdated + delta.customersAdded + delta.ordersAdded > 0;
    if (changed) {
      await recordUpload(ctx.email, {
        source: "live-sync",
        status: "ok",
        delta,
        totals: counts,
        note: "Developer API",
      });
    }

    return NextResponse.json({ ok: true, counts, delta });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Internal error while merging payload.",
        code: "merge_failed",
      },
      { status: 500 },
    );
  }
}
