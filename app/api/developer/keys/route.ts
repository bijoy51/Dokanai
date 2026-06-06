import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  createKey,
  listKeysFor,
  type ApiKeyScope,
} from "@/lib/apiKeys/store";

export const dynamic = "force-dynamic";

/**
 * Session-gated management API for developer API keys.
 *
 * GET  /api/developer/keys                 -> { keys: ApiKeyPublic[] }
 * POST /api/developer/keys                 -> { keyId, secret, public }
 *   body: { label?: string, scope?: "read" | "write" | "read+write" }
 *
 * The full `sk_live_…` secret is only returned by POST, exactly once.
 * GET listings include the 4-char tail so the dashboard can identify each
 * key as `sk_live_…<tail>` without re-exposing the full value.
 */

const VALID_SCOPES: ApiKeyScope[] = ["read", "write", "read+write"];

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const keys = await listKeysFor(session.email);
  return NextResponse.json({ keys });
}

export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { label?: unknown; scope?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const label =
    typeof body.label === "string" && body.label.trim()
      ? body.label.trim().slice(0, 60)
      : "Unnamed key";
  const scope: ApiKeyScope =
    typeof body.scope === "string" && (VALID_SCOPES as string[]).includes(body.scope)
      ? (body.scope as ApiKeyScope)
      : "read+write";

  const created = await createKey(session.email, scope, label);
  return NextResponse.json(created);
}
