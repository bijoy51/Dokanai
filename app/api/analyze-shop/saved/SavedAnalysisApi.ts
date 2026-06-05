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
import type { AnalyzeShopResponse } from "@/lib/ai/shop-analysis";

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
  return NextResponse.json({ saved });
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
