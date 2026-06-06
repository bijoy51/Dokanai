import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api/auth";
import {
  getImported,
  hydrateImported,
  mergeDataset,
  persistImported,
  setImported,
  type RawProduct,
} from "@/lib/data/imported";
import { hydrateUploadHistory, recordUpload } from "@/lib/data/upload-history";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/data/products?limit=200&offset=0
 *      Returns the merged catalog.
 *
 * POST /api/v1/data/products
 *      Body: { products: RawProduct[] }
 *      Same merge semantics as /api/v1/data/sync but products-only.
 *
 * For shape stability: this endpoint pins its `product` row shape in v1
 * even if our internal Product type adds fields later. v2 would broaden.
 */

interface V1Product {
  id: string;
  name: string;
  name_bn?: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  tags?: string[];
}

function project(p: {
  id: string;
  name: string;
  nameBn: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  tags: string[];
}): V1Product {
  return {
    id: p.id,
    name: p.name,
    name_bn: p.nameBn || undefined,
    category: p.category,
    price: p.price,
    cost: p.cost,
    stock: p.stock,
    tags: p.tags?.length ? p.tags : undefined,
  };
}

export async function GET(req: Request) {
  const ctx = await requireApiKey(req, { needs: "read" });
  if ("error" in ctx) return ctx.error;
  await hydrateImported(ctx.email);
  const existing = getImported(ctx.email);
  const products = existing?.products ?? [];
  const url = new URL(req.url);
  const limit = clampInt(url.searchParams.get("limit"), 1, 1000, 200);
  const offset = clampInt(url.searchParams.get("offset"), 0, 1_000_000, 0);
  const page = products.slice(offset, offset + limit).map(project);
  return NextResponse.json({
    total: products.length,
    limit,
    offset,
    products: page,
  });
}

export async function POST(req: Request) {
  const ctx = await requireApiKey(req, { needs: "write" });
  if ("error" in ctx) return ctx.error;
  let body: { products?: RawProduct[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body.", code: "invalid_body" }, { status: 400 });
  }
  const products = Array.isArray(body.products) ? body.products.slice(0, 50_000) : [];
  if (products.length === 0) {
    return NextResponse.json(
      { error: "Provide a non-empty `products` array.", code: "empty_payload" },
      { status: 400 },
    );
  }
  await hydrateImported(ctx.email);
  await hydrateUploadHistory(ctx.email);
  const existing = getImported(ctx.email);
  const { dataset, delta } = mergeDataset(existing, products, []);
  setImported(ctx.email, dataset);
  await persistImported(ctx.email, dataset);
  const counts = {
    products: dataset.products.length,
    customers: dataset.customers.length,
    orders: dataset.orders.length,
  };
  if (delta.productsAdded + delta.productsUpdated > 0) {
    await recordUpload(ctx.email, {
      source: "live-sync",
      status: "ok",
      delta,
      totals: counts,
      note: "Developer API (products)",
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
