import crypto from "crypto";

/**
 * Constant-time Bearer-token authentication for cron + admin endpoints.
 *
 * Replaces the previous `got === expected` string check, which on V8 is
 * effectively constant-time today but is not contractually so — a future
 * JIT change could leak the secret over a timing oracle. Hardening the
 * comparison costs nothing and removes the worry. The same helper now
 * gates `/api/cron/*` and `/api/admin/*`, so there is one place to audit.
 *
 * Behaviour:
 *   - Returns false if the env var is empty / missing — failing closed
 *     means rotating the secret to "" disables the endpoint by design.
 *   - Compares bytes against `Bearer ${secret}` in constant time.
 *   - Equal-length check happens first because `timingSafeEqual` throws
 *     on length mismatch; doing the length check before the call is the
 *     standard way to avoid a different timing leak via the throw path.
 */
export function bearerOk(req: Request, envVarName = "CRON_SECRET"): boolean {
  const expected = (process.env[envVarName] ?? "").trim();
  if (!expected) return false;
  const got = req.headers.get("authorization") ?? "";
  const expectedHeader = `Bearer ${expected}`;
  const a = Buffer.from(got);
  const b = Buffer.from(expectedHeader);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
