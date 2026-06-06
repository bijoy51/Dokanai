import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import {
  exchangeCode,
  fetchGoogleEmail,
  indexAdd,
  isOAuthConfigured,
  saveConnection,
} from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

/**
 * GET /api/google/oauth/callback?code=...&state=...
 *
 * Receives the authorization code from Google, verifies the CSRF state
 * cookie matches, swaps the code for { access_token, refresh_token },
 * stores the refresh_token encrypted, and 302s back to the onboarding
 * page where the user can paste their sheet ID.
 *
 * Error cases land on the same redirect with a `?google=...` query
 * param the panel can read and surface (e.g. `?google=access_denied`).
 */

function originOf(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

function failRedirect(req: Request, locale: "en" | "bn", reason: string): NextResponse {
  // Bounce back to the onboarding Live Sync tab with an error flag.
  // The panel reads ?google=... and shows a localised message.
  const url = new URL(
    `/${locale}/dashboard/onboarding?google=${encodeURIComponent(reason)}#live`,
    originOf(req),
  );
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  // Parse the cookie payload (state|locale) up front so error-path
  // redirects land on the right locale's onboarding page.
  const cookieStore = cookies();
  const stashed = cookieStore.get("dokanai_google_oauth_state")?.value ?? "";
  const [cookieState, cookieLocaleRaw] = stashed.split("|");
  const locale: "en" | "bn" = cookieLocaleRaw === "bn" ? "bn" : "en";

  const session = getSession();
  if (!session) return failRedirect(req, locale, "not_signed_in");
  if (!isOAuthConfigured()) return failRedirect(req, locale, "not_configured");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const googleError = url.searchParams.get("error");

  if (googleError) {
    // User clicked "Cancel" on the consent screen, or Google rejected the
    // app (e.g. unverified-app block for non-test users). Surface the
    // exact reason so the panel can show "access_denied" → "you didn't
    // grant permission" or "admin_policy_enforced" → "your workspace
    // admin blocks third-party apps".
    return failRedirect(req, locale, `google_${googleError}`);
  }
  if (!code || !state) return failRedirect(req, locale, "missing_code");
  if (!cookieState || cookieState !== state) {
    return failRedirect(req, locale, "state_mismatch");
  }

  let tokens;
  try {
    tokens = await exchangeCode(code);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "exchange_failed";
    return failRedirect(req, locale, `exchange_${encodeURIComponent(msg.slice(0, 80))}`);
  }

  if (!tokens.refresh_token) {
    // Happens when the user has authorized this app before and Google
    // omits the refresh token. Mitigated by prompt=consent in the
    // authorization URL, but defensive check anyway.
    return failRedirect(req, locale, "no_refresh_token");
  }

  const googleEmail = await fetchGoogleEmail(tokens.access_token);
  await saveConnection(session.email, tokens.refresh_token, googleEmail);
  await indexAdd(session.email);

  // Drop the state cookie now that it's been spent.
  const res = NextResponse.redirect(
    new URL(`/${locale}/dashboard/onboarding?google=connected#live`, originOf(req)),
  );
  res.cookies.set("dokanai_google_oauth_state", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/google/oauth",
    maxAge: 0,
  });
  return res;
}
