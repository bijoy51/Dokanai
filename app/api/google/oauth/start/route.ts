import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import {
  buildAuthorizationUrl,
  isOAuthConfigured,
  newOAuthStateToken,
} from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

/**
 * GET /api/google/oauth/start
 *
 * Kicks off the Google OAuth dance. Generates a random CSRF state token,
 * stashes it in a short-lived HttpOnly cookie, and 302s to Google's
 * consent screen.
 *
 * Session-gated: only signed-in shopkeepers can connect a sheet. Without
 * this guard an attacker could trick the user into binding the attacker's
 * Google account to the victim's DokanAI session by leaking a crafted
 * callback URL.
 */
export async function GET(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!isOAuthConfigured()) {
    return NextResponse.json(
      { error: "Google OAuth is not configured on the server." },
      { status: 500 },
    );
  }

  // Caller passes ?locale=en|bn so the callback can bounce back to the
  // same locale's onboarding page. Defaults to "en" if anything else.
  const locale = new URL(req.url).searchParams.get("locale") === "bn" ? "bn" : "en";

  const state = newOAuthStateToken();
  const url = buildAuthorizationUrl(state);

  const res = NextResponse.redirect(url);
  // 10-minute lifetime: long enough for the user to click through the
  // Google consent screen, short enough that a leaked browser session
  // can't replay this token an hour later. Payload is `state|locale`
  // so the callback can preserve the locale without a second cookie.
  res.cookies.set("dokanai_google_oauth_state", `${state}|${locale}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // lax (not strict) so the cookie survives the cross-site redirect back from Google
    path: "/api/google/oauth",
    maxAge: 60 * 10,
  });
  // Hint to next/headers that we touched cookies — silences the
  // unused-var warning that cookies() triggers when only the response
  // side mutates cookies.
  cookies();
  return res;
}
