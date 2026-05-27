import { NextResponse } from "next/server";
import { parseUnsubToken } from "@/lib/email/unsub-token";
import { hydrateImported } from "@/lib/data/imported";
import { setCustomerSubscribed } from "@/lib/agent/store";

/**
 * POST /api/unsubscribe
 *   body: { token: string }
 *   -> { ok: true } | { ok: false, reason }
 *
 * Also handles the Gmail/Yahoo one-click "List-Unsubscribe-Post" form, which
 * sends a form-encoded POST directly to the URL in the List-Unsubscribe
 * header. We accept the token from EITHER JSON body OR the URL query
 * parameter `t` so both flows work.
 */
async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  let token = url.searchParams.get("t") ?? "";
  if (!token) {
    try {
      const body = (await req.json()) as { token?: string };
      token = body.token ?? "";
    } catch {
      /* no JSON body — fine if `t` was in the URL */
    }
  }
  const parsed = parseUnsubToken(token);
  if (!parsed) {
    return NextResponse.json({ ok: false, reason: "invalid-token" }, { status: 400 });
  }

  // Hydrate the account's dataset before mutating it.
  await hydrateImported(parsed.account);
  const result = await setCustomerSubscribed(parsed.account, parsed.customer, false);
  if (!result.ok) return NextResponse.json({ ok: false, reason: result.reason }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export const POST = handle;
// Some webmail providers prefetch the link with GET — treat it the same so a
// preview crawler doesn't accidentally un-unsubscribe anyone.
export const GET = handle;
