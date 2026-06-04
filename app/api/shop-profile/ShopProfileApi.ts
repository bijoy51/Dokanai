import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getShopProfile,
  hydrateShopProfile,
  persistShopProfile,
  removeShopProfile,
  sanitizeProfile,
  setShopProfile,
} from "@/lib/data/shop-profile";

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  await hydrateShopProfile(session.email);
  const profile = getShopProfile(session.email) ?? null;
  return NextResponse.json({ profile });
}

export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const raw = await req.json().catch(() => null);
  const clean = sanitizeProfile({ ...(raw ?? {}), updatedAt: Date.now() });
  if (!clean) {
    return NextResponse.json(
      { error: "Invalid profile. shopType and venueType are required." },
      { status: 400 },
    );
  }

  setShopProfile(session.email, clean);
  const persisted = await persistShopProfile(session.email, clean);
  return NextResponse.json({ profile: clean, persisted });
}

export async function DELETE() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  await removeShopProfile(session.email);
  return NextResponse.json({ ok: true });
}
