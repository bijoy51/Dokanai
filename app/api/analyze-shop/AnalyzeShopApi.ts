import { NextResponse } from "next/server";
import { getStore } from "@/lib/data/store";
import { getSession } from "@/lib/auth";
import { hydrateImported } from "@/lib/data/imported";
import {
  analyzeShopStub,
  derivePopularStylesFromCatalog,
  deriveCatalog,
  deriveRestock,
  trendsScopedToShop,
  type AnalyzeShopRequest,
  type AnalyzeShopResponse,
} from "@/lib/ai/shop-analysis";

/**
 * /api/analyze-shop
 *
 * - When ML_BACKEND_URL is configured, proxies the request to the Python ML
 *   backend (ml-backend/ in this repo).
 * - Otherwise runs a deterministic stub that produces a real insights bundle
 *   from the request (and from the signed-in account's seeded data when the
 *   user clicks "Analyze my DokanAI shop").
 */
export async function POST(req: Request) {
  let body: Partial<AnalyzeShopRequest> & { useAccountData?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // If the user clicked "Analyze my DokanAI shop", populate listings + sales
  // from the logged-in account's seeded store. This makes the page useful
  // before the user has uploaded a CSV.
  let listings = body.listings ?? [];
  let sales = body.sales ?? [];
  if (body.useAccountData || (listings.length === 0 && sales.length === 0)) {
    const session = getSession();
    if (session) await hydrateImported(session.email);
    const store = getStore();
    listings = store.products.map((p) => ({
      title: p.name,
      description: `${p.tags.join(", ")} item`,
      price: p.price,
      stock: p.stock,
      category: p.category,
    }));
    sales = store.orders.flatMap((o) =>
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
  }

  if (!listings.length) {
    const msg =
      body.useAccountData
        ? "Your shop has no data yet. Import your products on the Khata-to-Cloud page, or upload a CSV above."
        : "At least one listing is required.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const payload: AnalyzeShopRequest = {
    shop: body.shop ?? {},
    listings,
    sales,
    images: body.images ?? [],
  };

  const backend = process.env.ML_BACKEND_URL?.trim();
  if (backend) {
    // Strip any whitespace + trailing slashes (the env var sometimes ends up
    // with a trailing newline from shell-piped values).
    const base = backend.replace(/\s+/g, "").replace(/\/+$/, "");
    try {
      // 55s budget: the HF Space free tier sleeps after inactivity and a
      // cold start takes 30-60s. A short timeout here is what made the app
      // silently fall back to the heuristic stub on the first request.
      const upstream = await fetch(`${base}/analyze-shop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(55_000),
      });
      const json = (await upstream.json()) as AnalyzeShopResponse;
      if (!upstream.ok) {
        // Fall back to the stub if the backend returned an error.
        const stub = analyzeShopStub(payload);
        stub.notes.unshift(`Backend returned ${upstream.status}; using fallback.`);
        return NextResponse.json(stub);
      }
      // The backend returns relative /images/<file>.jpg paths for sample
      // images. Rewrite them to absolute URLs so the browser fetches them
      // from the ML backend host instead of the Vercel domain.
      rewriteImageUrls(json, base);
      // The ML backend's popular_styles is a seasonal archetype list that's
      // identical for every clothing shop. Override it with a shop-specific
      // derivation so the cards reflect THIS shop's catalog and sales.
      overridePopularStyles(json, payload, base);
      // The ML backend's catalog (attributes), restock_soon and trending have
      // known gaps (blank attributes, out-of-stock items missing from restock,
      // cross-category items in trending). Recompute them from this shop's data
      // so they are correct + consistent with the Pilot's numbers.
      overrideShopInsights(json, payload);
      return NextResponse.json(json);
    } catch (err) {
      const stub = analyzeShopStub(payload);
      stub.notes.unshift(
        `Could not reach ML_BACKEND_URL (${err instanceof Error ? err.message : "unknown"}); using fallback.`,
      );
      return NextResponse.json(stub);
    }
  }

  return NextResponse.json(analyzeShopStub(payload));
}

function rewriteImageUrls(resp: AnalyzeShopResponse, base: string): void {
  const fix = (u: string): string =>
    u && u.startsWith("/") ? `${base}${u}` : u;
  if (Array.isArray(resp.popular_styles)) {
    for (const s of resp.popular_styles) {
      if (Array.isArray(s.sample_images)) {
        s.sample_images = s.sample_images.map(fix);
      }
    }
  }
}

/**
 * Replace popular_styles with a derivation from THIS shop's catalog + sales.
 * Runs for every shop type — grocery, electronics, pharmacy, etc. — not
 * just clothing. Shops whose products map to the ML image library (fashion,
 * beauty, accessories, bags, shoes, jewelry) get real photos; other
 * categories fall back to type-matched emojis. If the derivation produces
 * nothing (no listings), leaves the original response untouched.
 */
function overridePopularStyles(
  resp: AnalyzeShopResponse,
  payload: AnalyzeShopRequest,
  imageBaseUrl: string,
): void {
  // Always overwrite — even with []. If no product matches the image library,
  // the section must HIDE (not show emoji placeholders) per the no-emoji
  // policy. Leaving the ML backend's archetype list in place would resurrect
  // the generic "Casual cotton kurti" / "Graphic t-shirt" cards.
  resp.popular_styles = derivePopularStylesFromCatalog(
    payload.listings,
    payload.sales,
    imageBaseUrl,
  );
}

/**
 * Override the ML backend's catalog / restock_soon / trending with derivations
 * from THIS shop's listings + sales. Fixes three reported bugs:
 *   - extracted-catalog attributes were mostly blank (now inferred),
 *   - out-of-stock products were missing from "Restock soon",
 *   - "Trending now" surfaced cross-category items (e.g. an LED bulb in a
 *     clothing shop) — now scoped to the detected shop type.
 * Only runs when we actually have listings; leaves selling_well/poorly intact.
 */
function overrideShopInsights(resp: AnalyzeShopResponse, payload: AnalyzeShopRequest): void {
  if (!payload.listings?.length) return;
  const shopType = resp.shop_type?.label || "clothing";
  resp.catalog = deriveCatalog(payload.listings);
  resp.restock_soon = deriveRestock(payload.listings, payload.sales ?? [], shopType);
  resp.trending = trendsScopedToShop(shopType, payload.listings, payload.sales);
}
