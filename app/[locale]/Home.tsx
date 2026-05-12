import Link from "next/link";
import { LangSwitcher } from "@/components/LangSwitcher";
import { LogoutButton } from "@/components/LogoutButton";
import { t, type Locale } from "@/lib/i18n/messages";
import { getSession } from "@/lib/auth";
import {
  CalendarDays,
  Mic,
  ShieldAlert,
  Sparkles,
  ArrowRight,
  LogIn,
  UserPlus,
} from "lucide-react";

export default function Home({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  const session = getSession();
  const features = [
    { icon: CalendarDays, title: t("landing.feature1", locale), desc: t("landing.feature1.desc", locale) },
    { icon: Mic, title: t("landing.feature2", locale), desc: t("landing.feature2.desc", locale) },
    { icon: ShieldAlert, title: t("landing.feature3", locale), desc: t("landing.feature3.desc", locale) },
    { icon: Sparkles, title: t("landing.feature4", locale), desc: t("landing.feature4.desc", locale) },
  ];
  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-50 via-white to-white">
      <header className="px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-brand-600 grid place-items-center text-white font-bold">D</div>
          <span className="font-semibold">{t("brand.name", locale)}</span>
          <span className="text-xs text-slate-500 hidden sm:inline">· {t("brand.tagline", locale)}</span>
        </div>
        <div className="flex items-center gap-3">
          {session && (
            <>
              <span className="text-xs text-slate-500 hidden sm:inline">
                {t("auth.signedInAs", locale)} <span className="font-medium text-slate-700">{session.name}</span>
              </span>
              <LogoutButton locale={locale} />
            </>
          )}
          <LangSwitcher locale={locale} />
        </div>
      </header>

      <section className="max-w-4xl mx-auto px-6 pt-12 pb-16 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900">
          {t("landing.headline", locale)}
        </h1>
        <p className="mt-5 text-lg text-slate-600 max-w-2xl mx-auto">{t("landing.sub", locale)}</p>
        <div className="mt-8 flex items-center justify-center gap-3">
          {session ? (
            <Link
              href={`/${locale}/dashboard`}
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-6 py-3 rounded-md font-medium shadow-sm"
            >
              {t("landing.enter", locale)} <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <>
              <Link
                href={`/${locale}/signup`}
                className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-6 py-3 rounded-md font-medium shadow-sm"
              >
                <UserPlus className="w-4 h-4" /> {t("auth.signupCta", locale)}
              </Link>
              <Link
                href={`/${locale}/login`}
                className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 px-6 py-3 rounded-md font-medium shadow-sm"
              >
                <LogIn className="w-4 h-4" /> {t("auth.loginCta", locale)}
              </Link>
            </>
          )}
        </div>
        {!session && (
          <p className="mt-3 text-xs text-slate-400">{t("auth.gateNote", locale)}</p>
        )}
      </section>

      <section className="max-w-5xl mx-auto px-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-16">
        {features.map((f) => (
          <div key={f.title} className="rounded-lg border border-slate-200 bg-white p-5">
            <f.icon className="w-6 h-6 text-brand-600" />
            <div className="mt-3 font-medium text-slate-900">{f.title}</div>
            <div className="mt-1 text-sm text-slate-600">{f.desc}</div>
          </div>
        ))}
      </section>

      <footer className="px-6 py-8 text-center text-xs text-slate-500">
        DokanAI · The Infinity AI BuildFest 2026 · Track 4 · E-commerce
      </footer>
    </main>
  );
}
