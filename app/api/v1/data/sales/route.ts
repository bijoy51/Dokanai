import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api/auth";
import {
  getImported,
  hydrateImported,
  mergeDataset,
  persistImported,
  setImported,
  type RawSale,
} from "@/lib/data/imported";
import { hydrateUploadHistory, recordUpload } from "@/lib/data/upload-history";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/data/sales?limit=200&offset=0&since=YYYY-MM-DD
 *      Returns orders with their items flattened into one row per item.
 *
 * POST /api/v1/data/sales
 *      Body: { sales: RawSale[] }
 */

interface V1SaleRow {
  order_id: string;
  date: string;
  customer_id: string;
  product_id: string;
  qty: number;
  unit_price: number;
  total: number;
  status: string;
  city: string;
  payment_method: string;
  courier: string;
}

export async function GET(req: Request) {
  const ctx = await requireApiKey(req, { needs: "read" });
  if ("error" in ctx) return ctx.error;
  await hydrateImported(ctx.email);
  const existing = getImported(ctx.email);
  const orders = existing?.orders ?? [];
  const url = new URL(req.url);
  const limit = clampInt(url.searchParams.get("limit"), 1, 5000, 500);
  const offset = clampInt(url.searchParams.get("offset"), 0, 10_000_000, 0);
  const since = url.searchParams.get("since"); // YYYY-MM-DD inclusive

  const rows: V1SaleRow[] = [];
  for (const o of orders) {
    if (since && o.date < since) continue;
    for (const it of o.items) {
      rows.push({
        order_id: o.id,
        date: o.date,
        customer_id: o.customerId,
        product_id: it.productId,
        qty: it.qty,
        unit_price: it.unitPrice,
        total: it.qty * it.unitPrice,
        status: o.status,
        city: o.city,
        payment_method: o.paymentMethod,
        courier: o.courier,
      });
    }
  }

  // Newest first so the most common "give me yesterday's sales" pattern is fast.
  rows.sort((a, b) => (a.date < b.date ? 1 : -1));

  const page = rows.slice(offset, offset + limit);
  return NextResponse.json({
    total: rows.length,
    limit,
    offset,
    sales: page,
  });
}

export async function POST(req: Request) {
  const ctx = await requireApiKey(req, { needs: "write" });
  if ("error" in ctx) return ctx.error;
  let body: { sales?: RawSale[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body.", code: "invalid_body" }, { status: 400 });
  }
  const sales = Array.isArray(body.sales) ? body.sales.slice(0, 200_000) : [];
  if (sales.length === 0) {
    return NextResponse.json(
      { error: "Provide a non-empty `sales` array.", code: "empty_payload" },
      { status: 400 },
    );
  }
  await hydrateImported(ctx.email);
  await hydrateUploadHistory(ctx.email);
  const existing = getImported(ctx.email);
  const { dataset, delta } = mergeDataset(existing, [], sales);
  setImported(ctx.email, dataset);
  await persistImported(ctx.email, dataset);
  const counts = {
    products: dataset.products.length,
    customers: dataset.customers.length,
    orders: dataset.orders.length,
  };
  if (delta.ordersAdded + delta.customersAdded > 0) {
    await recordUpload(ctx.email, {
      source: "live-sync",
      status: "ok",
      delta,
      totals: counts,
      note: "Developer API (sales)",
    });
  }
  return NextResponse.json({ ok: true, counts, delta });
}

function clampInt(v: string | null, min: number, max: number, fallback: number): number {
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}
