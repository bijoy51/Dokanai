import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { revokeKey } from "@/lib/apiKeys/store";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/developer/keys/[id]
 *
 * Revokes the API key identified by `id` (the public keyId, NOT the
 * secret). 404 if the key doesn't exist or belongs to a different shop —
 * deliberately the same response so a probe can't enumerate other shops'
 * keyIds.
 */

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ok = await revokeKey(session.email, params.id);
  if (!ok) return NextResponse.json({ error: "Key not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
