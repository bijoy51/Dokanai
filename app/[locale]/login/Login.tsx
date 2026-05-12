"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { t, type Locale } from "@/lib/i18n/messages";
import { LogIn } from "lucide-react";

export default function Login({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { next?: string };
}) {
  const locale = params.locale as Locale;
  const next = searchParams?.next || `/${locale}/dashboard`;
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("auth.genericError", locale));
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError(t("auth.genericError", locale));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen grid place-items-center bg-gradient-to-b from-brand-50 via-white to-white p-6">
      <div className="w-full max-w-sm">
        <Link href={`/${locale}`} className="flex items-center gap-2 justify-center mb-6">
          <div className="w-9 h-9 rounded-md bg-brand-600 grid place-items-center text-white font-bold">D</div>
          <span className="font-semibold text-lg">DokanAI</span>
        </Link>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold">{t("auth.loginTitle", locale)}</h1>
          <p className="text-sm text-slate-500 mt-1">{t("auth.loginSubtitle", locale)}</p>

          <form onSubmit={submit} className="mt-5 space-y-3">
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="••••••••"
              />
            </div>
            {error && (
              <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-60"
            >
              <LogIn className="w-4 h-4" />
              {loading ? t("common.loading", locale) : t("auth.loginCta", locale)}
            </button>
          </form>

          <div className="mt-4 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
            {t("auth.demoHint", locale)} <span className="font-mono">demo@dokanai.app / demo1234</span>
          </div>

          <p className="mt-4 text-sm text-slate-600 text-center">
            {t("auth.noAccount", locale)}{" "}
            <Link href={`/${locale}/signup`} className="text-brand-700 font-medium hover:underline">
              {t("auth.signupCta", locale)}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
