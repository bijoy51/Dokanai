import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api/auth";
import { hydrateImported } from "@/lib/data/imported";
import { getStore } from "@/lib/data/store";
import { derivePopularStylesFromCatalog } from "@/lib/ai/shop-analysis";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/insights/popular
 *
 * Returns the same "popular items right now" derivation that powers the
 * Analyze Shop page — top 4 sellers ranked by 30-day units with real
 * momentum (vs prior 30 days). Each card maps to a real-photo URL when
 * the product type matches the image library; otherwise no image.
 */
export async function GET(req: Request) {
  const ctx = await requireApiKey(req, { needs: "read" });
  if ("error" in ctx) return ctx.error;
  await hydrateImported(ctx.email);

  const store = getStore();
  const listings = store.products.map((p) => ({
    title: p.name,
    description: p.tags.join(", "),
    price: p.price,
    stock: p.stock,
    category: p.category,
  }));
  const sales = store.orders.flatMap((o) =>
    o.items.map((it) => {
      const product = store.productById(it.productId);
      return {
        date: o.date,
        product: product?.name ?? it.productId,
        qty: it.qty,
        unit_price: it.unitPrice,
      };
    }),
  );

  const base = process.env.ML_BACKEND_URL?.trim().replace(/\s+/g, "").replace(/\/+$/, "");
  const styles = derivePopularStylesFromCatalog(listings, sales, base || undefined);

  return NextResponse.json({
    items: styles.map((s) => ({
      label: s.label,
      momentum_pct: Math.round(s.momentum * 100),
      note: s.note,
      sample_images: s.sample_images,
    })),
  });
}
