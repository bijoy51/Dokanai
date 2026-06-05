import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getSavedAnalysis,
  hydrateSavedAnalysis,
  persistSavedAnalysis,
  removeSavedAnalysis,
  setSavedAnalysis,
  type SavedShopAnalysis,
} from "@/lib/data/shop-analysis-storage";
import {
  derivePopularStylesFromCatalog,
  type AnalyzeShopResponse,
} from "@/lib/ai/shop-analysis";
import { getStore } from "@/lib/data/store";
import { hydrateImported } from "@/lib/data/imported";

/**
 * /api/analyze-shop/saved
 *
 * GET    — returns the signed-in account's permanently-saved shop analysis
 *           (or `{ saved: null }` if nothing has been saved yet).
 * POST   — accepts `{ result, shopName?, region? }` and saves it. Server
 *           stamps `savedAt`. Returns the persisted object.
 * DELETE — clears the saved snapshot.
 */

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  await hydrateSavedAnalysis(session.email);
  const saved = getSavedAnalysis(session.email) ?? null;
  // Snapshots saved before the popular_styles fix carry the old archetype
  // list ("Casual cotton kurti" / "Graphic t-shirt" / …) identical for every
  // shop. Re-derive at read-time from the user's current catalog + sales so
  // the cards reflect THIS shop without the user having to re-run analyze.
  if (saved) await refreshPopularStyles(session.email, saved);
  return NextResponse.json({ saved });
}

async function refreshPopularStyles(email: string, saved: SavedShopAnalysis): Promise<void> {
  // Re-derive for ALL shop types — clothing/beauty/accessories pull real
  // photos from the image library; grocery/electronics/etc. fall back to
  // type-matched emojis. This also un-hides the section for shops whose
  // saved snapshot was captured before the popular_styles fix.
  await hydrateImported(email);
  const store = getStore();
  if (!store.products.length) return;
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
  // Always overwrite — even with []. If no product in the current catalog
  // maps to a library photo, the section hides. Never keep a stale snapshot
  // with emoji placeholders or pre-fix archetype cards.
  saved.result.popular_styles = derivePopularStylesFromCatalog(listings, sales, base || undefined);
}

export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const raw = (await req.json().catch(() => null)) as
    | {
        result?: AnalyzeShopResponse;
        shopName?: string;
        region?: string;
      }
    | null;

  if (!raw || !raw.result || typeof raw.result !== "object") {
    return NextResponse.json({ error: "result is required" }, { status: 400 });
  }

  const saved: SavedShopAnalysis = {
    result: raw.result,
    shopName: typeof raw.shopName === "string" ? raw.shopName.trim().slice(0, 80) : undefined,
    region: typeof raw.region === "string" ? raw.region.trim().slice(0, 80) : undefined,
    savedAt: Date.now(),
  };

  setSavedAnalysis(session.email, saved);
  const persisted = await persistSavedAnalysis(session.email, saved);
  return NextResponse.json({ saved, persisted });
}

export async function DELETE() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  await removeSavedAnalysis(session.email);
  return NextResponse.json({ ok: true });
}
