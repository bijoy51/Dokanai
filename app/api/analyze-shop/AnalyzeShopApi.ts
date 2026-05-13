import { NextResponse } from "next/server";
import { getStore } from "@/lib/data/store";
import { analyzeShopStub, type AnalyzeShopRequest, type AnalyzeShopResponse } from "@/lib/ai/shop-analysis";

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
    return NextResponse.json({ error: "At least one listing is required." }, { status: 400 });
  }

  const payload: AnalyzeShopRequest = {
    shop: body.shop ?? {},
    listings,
    sales,
    images: body.images ?? [],
  };

  const backend = process.env.ML_BACKEND_URL;
  if (backend) {
    try {
      const upstream = await fetch(`${backend.replace(/\/+$/, "")}/analyze-shop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });
      const json = (await upstream.json()) as AnalyzeShopResponse;
      if (!upstream.ok) {
        // Fall back to the stub if the backend returned an error.
        const stub = analyzeShopStub(payload);
        stub.notes.unshift(`Backend returned ${upstream.status}; using fallback.`);
        return NextResponse.json(stub);
      }
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
