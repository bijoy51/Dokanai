"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { t, type Locale } from "@/lib/i18n/messages";
import { UserPlus, Check, X, AlertCircle } from "lucide-react";

/**
 * Sign-up page.
 *
 * Strong-password gate applies ONLY to new signups (this page) — the same
 * checks run on the server in lib/users.ts/createAccount. Login does not
 * re-check password strength, so anyone who created an account before this
 * gate shipped keeps logging in with whatever they used.
 *
 * Shop name is also required client + server side for new accounts.
 */
export default function Signup({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pwTouched, setPwTouched] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Same regexes the server uses in lib/users.ts/validateStrongPassword,
  // kept in sync so the UI never lets the user submit something the server
  // is about to reject.
  const checks = useMemo(
    () => ({
      length: password.length >= 8,
      lowercase: /[a-z]/.test(password),
      uppercase: /[A-Z]/.test(password),
      number: /\d/.test(password),
      special: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(password),
    }),
    [password],
  );
  const allPasswordChecksPass = Object.values(checks).every(Boolean);
  const nameOk = name.trim().length > 0;
  const emailOk = email.trim().length > 0 && email.includes("@");
  const canSubmit = nameOk && emailOk && allPasswordChecksPass && !loading;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    // Defensive client-side check (the inputs' required + the disabled
    // button already gate this, but a determined user can still click).
    if (!nameOk) {
      setError(t("auth.errShopNameRequired", locale));
      return;
    }
    if (!allPasswordChecksPass) {
      setError(t("auth.errPasswordWeak", locale));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("auth.genericError", locale));
        return;
      }
      router.push(`/${locale}/dashboard`);
      router.refresh();
    } catch {
      setError(t("auth.genericError", locale));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen grid place-items-center bg-gradient-to-b from-brand-50 via-white to-white p-4 sm:p-6">
      <div className="w-full max-w-sm">
        <Link href={`/${locale}`} className="flex items-center gap-2 justify-center mb-6">
          <div className="w-9 h-9 rounded-md bg-brand-600 grid place-items-center text-white font-bold">D</div>
          <span className="font-semibold text-lg">DokanAI</span>
        </Link>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold">{t("auth.signupTitle", locale)}</h1>
          <p className="text-sm text-slate-500 mt-1">{t("auth.signupSubtitle", locale)}</p>

          <form onSubmit={submit} className="mt-5 space-y-3" noValidate>
            <div>
              <label className="text-xs text-slate-500">
                {t("auth.shopName", locale)} <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder={t("auth.shopNamePlaceholder", locale)}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">{t("auth.email", locale)}</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="you@shop.com"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">{t("auth.password", locale)}</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setPwTouched(true)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder={t("auth.passwordPlaceholder", locale)}
                aria-describedby="password-checks"
              />
              {(pwTouched || password.length > 0) && (
                <ul
                  id="password-checks"
                  className="mt-2 grid grid-cols-1 gap-1 text-[11px]"
                >
                  <PwRule ok={checks.length} label={t("auth.pwReq.length", locale)} />
                  <PwRule ok={checks.lowercase} label={t("auth.pwReq.lowercase", locale)} />
                  <PwRule ok={checks.uppercase} label={t("auth.pwReq.uppercase", locale)} />
                  <PwRule ok={checks.number} label={t("auth.pwReq.number", locale)} />
                  <PwRule ok={checks.special} label={t("auth.pwReq.special", locale)} />
                </ul>
              )}
            </div>
            {error && (
              <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <UserPlus className="w-4 h-4" />
              {loading ? t("common.loading", locale) : t("auth.signupCta", locale)}
            </button>
          </form>

          <p className="mt-4 text-sm text-slate-600 text-center">
            {t("auth.haveAccount", locale)}{" "}
            <Link href={`/${locale}/login`} className="text-brand-700 font-medium hover:underline">
              {t("auth.loginCta", locale)}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

function PwRule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li
      className={
        "flex items-center gap-1.5 " + (ok ? "text-emerald-700" : "text-rose-600")
      }
    >
      {ok ? (
        <Check className="w-3.5 h-3.5 shrink-0" aria-label="ok" />
      ) : (
        <X className="w-3.5 h-3.5 shrink-0" aria-label="missing" />
      )}
      <span>{label}</span>
    </li>
  );
}
