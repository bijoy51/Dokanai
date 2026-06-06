import Link from "next/link";
import { LangSwitcher } from "@/components/LangSwitcher";
import { LogoutButton } from "@/components/LogoutButton";
import { Reveal } from "@/components/Reveal";
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
  Bot,
  BarChart3,
  TrendingUp,
  Tag,
  Megaphone,
  Users,
  UploadCloud,
  Code2,
  History,
  Globe,
  WifiOff,
  Smartphone,
  Check,
  type LucideIcon,
} from "lucide-react";

// ── Static config ────────────────────────────────────────────────────────
// The four flagship pillars keep their existing landing.* copy (the content
// that was already on the homepage). Everything below them is new.
const PILLARS: Array<{ icon: LucideIcon; title: string; desc: string }> = [
  { icon: CalendarDays, title: "landing.feature1", desc: "landing.feature1.desc" },
  { icon: Mic, title: "landing.feature2", desc: "landing.feature2.desc" },
  { icon: ShieldAlert, title: "landing.feature3", desc: "landing.feature3.desc" },
  { icon: Sparkles, title: "landing.feature4", desc: "landing.feature4.desc" },
];

// Full toolkit — titles reuse the already-translated nav.* keys; the short
// blurbs are the new home.d.* keys. href points at the real dashboard route.
const CAPABILITIES: Array<{ icon: LucideIcon; title: string; desc: string; href: string }> = [
  { icon: Bot, title: "nav.pilot", desc: "home.d.pilot", href: "/dashboard/agent" },
  { icon: BarChart3, title: "nav.analyze", desc: "home.d.analyze", href: "/dashboard/analyze" },
  { icon: TrendingUp, title: "nav.forecast", desc: "home.d.forecast", href: "/dashboard/forecast" },
  { icon: Tag, title: "nav.pricing", desc: "home.d.pricing", href: "/dashboard/pricing" },
  { icon: Sparkles, title: "nav.recommendations", desc: "home.d.rec", href: "/dashboard/recommendations" },
  { icon: Megaphone, title: "nav.marketing", desc: "home.d.marketing", href: "/dashboard/marketing" },
  { icon: Users, title: "nav.customers", desc: "home.d.customers", href: "/dashboard/customers" },
  { icon: ShieldAlert, title: "nav.rto", desc: "home.d.rto", href: "/dashboard/rto" },
  { icon: UploadCloud, title: "nav.onboarding", desc: "home.d.onboarding", href: "/dashboard/onboarding" },
  { icon: Code2, title: "nav.developer", desc: "home.d.developer", href: "/dashboard/developer" },
  { icon: History, title: "nav.uploads", desc: "home.d.uploads", href: "/dashboard/uploads" },
];

const STATS = ["home.stat1", "home.stat2", "home.stat3", "home.stat4"] as const;

const VALUES: Array<{ icon: LucideIcon; title: string; desc: string }> = [
  { icon: Globe, title: "home.value.bilingual.title", desc: "home.value.bilingual.desc" },
  { icon: WifiOff, title: "home.value.offline.title", desc: "home.value.offline.desc" },
  { icon: Smartphone, title: "home.value.mobile.title", desc: "home.value.mobile.desc" },
];

// ── Page ──────────────────────────────────────────────────────────────────
export default function Home({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  const session = getSession();
  // Guests are funnelled to signup from feature cards; signed-in users deep-link.
  const linkFor = (href: string) => (session ? `/${locale}${href}` : `/${locale}/signup`);

  return (
    <main className="min-h-screen overflow-x-hidden bg-gradient-to-b from-brand-50 via-white to-white text-slate-900">
      {/* Header — unchanged behaviour, made sticky + a touch denser at xs so
          it doesn't crowd the hero on phones. */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b border-transparent supports-[backdrop-filter]:border-slate-200/50">
        <div className="px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 sm:gap-3 max-w-6xl mx-auto">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-brand-600 grid place-items-center text-white font-bold shrink-0 text-sm sm:text-base">D</div>
            <span className="font-semibold truncate text-sm sm:text-base">{t("brand.name", locale)}</span>
            <span className="text-xs text-slate-500 hidden sm:inline truncate">· {t("brand.tagline", locale)}</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {session && (
              <>
                <span className="text-xs text-slate-500 hidden md:inline">
                  {t("auth.signedInAs", locale)} <span className="font-medium text-slate-700">{session.name}</span>
                </span>
                <LogoutButton locale={locale} />
              </>
            )}
            <LangSwitcher locale={locale} />
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative">
        {/* ambient animated background blobs */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="anim-blob absolute -top-24 -left-16 w-72 h-72 rounded-full bg-brand-300/40 blur-3xl" />
          <div className="anim-blob absolute top-10 right-0 w-80 h-80 rounded-full bg-emerald-200/50 blur-3xl" style={{ animationDelay: "-6s" }} />
          <div className="anim-blob absolute top-40 left-1/3 w-64 h-64 rounded-full bg-teal-200/40 blur-3xl" style={{ animationDelay: "-12s" }} />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-14 pb-10 sm:pb-20 grid lg:grid-cols-2 gap-8 sm:gap-10 lg:gap-12 items-center">
          {/* copy column */}
          <div className="anim-fade-up text-center lg:text-left">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-white/70 backdrop-blur px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-medium text-brand-700">
              <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> {t("home.badge", locale)}
            </span>
            <h1 className="mt-3 sm:mt-4 text-[26px] leading-tight sm:text-4xl md:text-5xl font-bold tracking-tight">
              {t("landing.headline", locale)}
            </h1>
            <p className="mt-3 sm:mt-4 text-sm sm:text-lg text-slate-600 max-w-xl mx-auto lg:mx-0 leading-relaxed">
              {t("landing.sub", locale)}
            </p>

            <div className="mt-5 sm:mt-7 flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-2.5 sm:gap-3">
              {session ? (
                <Link
                  href={`/${locale}/dashboard`}
                  className="inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-5 sm:px-6 py-2.5 sm:py-3 rounded-md font-medium shadow-sm transition-transform motion-safe:hover:scale-[1.03] text-sm sm:text-base"
                >
                  {t("landing.enter", locale)} <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <>
                  <Link
                    href={`/${locale}/signup`}
                    className="inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-5 sm:px-6 py-2.5 sm:py-3 rounded-md font-medium shadow-sm transition-transform motion-safe:hover:scale-[1.03] text-sm sm:text-base"
                  >
                    <UserPlus className="w-4 h-4" /> {t("auth.signupCta", locale)}
                  </Link>
                  <Link
                    href={`/${locale}/login`}
                    className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 px-5 sm:px-6 py-2.5 sm:py-3 rounded-md font-medium shadow-sm transition-transform motion-safe:hover:scale-[1.03] text-sm sm:text-base"
                  >
                    <LogIn className="w-4 h-4" /> {t("auth.loginCta", locale)}
                  </Link>
                </>
              )}
              <a
                href="#features"
                className="inline-flex items-center justify-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-md font-medium text-brand-700 hover:text-brand-800 hover:underline text-sm sm:text-base"
              >
                {t("home.hero.explore", locale)} <ArrowRight className="w-4 h-4" />
              </a>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center lg:justify-start gap-2 text-xs">
              {["home.hero.tag.live", "home.hero.tag.bn", "home.hero.tag.offline"].map((k) => (
                <span key={k} className="inline-flex items-center gap-1 rounded-full bg-white/70 border border-slate-200 px-2.5 py-1 text-slate-600">
                  <Check className="w-3 h-3 text-brand-600" /> {t(k, locale)}
                </span>
              ))}
            </div>
            {!session && <p className="mt-4 text-xs text-slate-400">{t("auth.gateNote", locale)}</p>}
          </div>

          {/* graphical animated dashboard preview */}
          <div className="anim-fade-up" style={{ animationDelay: "120ms" }}>
            <HeroPreview locale={locale} />
          </div>
        </div>
      </section>

      {/* ── Stats strip ────────────────────────────────────────────────── */}
      <section className="border-y border-slate-200 bg-white/60 backdrop-blur">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-5 sm:py-7 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
          {STATS.map((s, i) => (
            <Reveal key={s} delay={i * 80} className="text-center min-w-0">
              <div className="text-xl sm:text-3xl font-bold text-brand-700 truncate">{t(s, locale)}</div>
              <div className="mt-1 text-[11px] sm:text-sm text-slate-500 leading-tight">{t(`${s}.label`, locale)}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Flagship pillars (the original four features) ──────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-20">
        <Reveal className="text-center max-w-2xl mx-auto">
          <SectionKicker>{t("home.pillars.kicker", locale)}</SectionKicker>
          <h2 className="mt-2 text-xl sm:text-3xl font-bold tracking-tight">{t("home.pillars.title", locale)}</h2>
        </Reveal>
        <div className="mt-6 sm:mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {PILLARS.map((f, i) => (
            <Reveal key={f.title} delay={i * 90}>
              <div className="group h-full rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm transition-all duration-200 motion-safe:hover:-translate-y-1 hover:shadow-lg hover:border-brand-200">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 grid place-items-center text-white shadow-sm transition-transform duration-200 motion-safe:group-hover:scale-110">
                  <f.icon className="w-5 h-5" />
                </div>
                <div className="mt-2.5 sm:mt-3 font-semibold text-sm sm:text-base">{t(f.title, locale)}</div>
                <div className="mt-1 text-[13px] sm:text-sm text-slate-600 leading-relaxed">{t(f.desc, locale)}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Full capability grid ───────────────────────────────────────── */}
      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-24 scroll-mt-20 sm:scroll-mt-16">
        <Reveal className="text-center max-w-2xl mx-auto">
          <SectionKicker>{t("home.all.kicker", locale)}</SectionKicker>
          <h2 className="mt-2 text-xl sm:text-3xl font-bold tracking-tight">{t("home.all.title", locale)}</h2>
          <p className="mt-2 sm:mt-3 text-sm sm:text-base text-slate-600 leading-relaxed">{t("home.all.sub", locale)}</p>
        </Reveal>
        <div className="mt-6 sm:mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {CAPABILITIES.map((c, i) => (
            <Reveal key={c.title} delay={(i % 3) * 80}>
              <Link
                href={linkFor(c.href)}
                className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm transition-all duration-200 motion-safe:hover:-translate-y-1 hover:shadow-lg hover:border-brand-300"
              >
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-brand-50 text-brand-700 grid place-items-center transition-colors duration-200 group-hover:bg-brand-600 group-hover:text-white shrink-0">
                    <c.icon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <span className="font-semibold text-sm sm:text-base truncate">{t(c.title, locale)}</span>
                </div>
                <p className="mt-2.5 sm:mt-3 text-[13px] sm:text-sm text-slate-600 flex-1 leading-relaxed">{t(c.desc, locale)}</p>
                <span className="mt-2.5 sm:mt-3 inline-flex items-center gap-1 text-xs sm:text-sm font-medium text-brand-700 opacity-100 sm:opacity-0 sm:-translate-x-1 transition-all duration-200 motion-safe:group-hover:opacity-100 motion-safe:group-hover:translate-x-0">
                  {session ? t("landing.enter", locale) : t("auth.signupCta", locale)} <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Spotlights ─────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-24">
        <Reveal className="text-center max-w-2xl mx-auto">
          <SectionKicker>{t("home.spotlights.kicker", locale)}</SectionKicker>
        </Reveal>

        <div className="mt-8 sm:mt-10 flex flex-col gap-10 sm:gap-20">
          <Spotlight
            title={t("home.sp.forecast.title", locale)}
            desc={t("home.sp.forecast.desc", locale)}
            visual={<ForecastVisual locale={locale} />}
          />
          <Spotlight
            reverse
            title={t("home.sp.voice.title", locale)}
            desc={t("home.sp.voice.desc", locale)}
            visual={<VoiceVisual locale={locale} />}
          />
          <Spotlight
            title={t("home.sp.rto.title", locale)}
            desc={t("home.sp.rto.desc", locale)}
            visual={<RtoVisual locale={locale} />}
          />
        </div>
      </section>

      {/* ── Value strip ────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-24">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {VALUES.map((v, i) => (
            <Reveal key={v.title} delay={i * 90}>
              <div className="h-full rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-brand-50/40 p-5 sm:p-6 text-center shadow-sm">
                <div className="mx-auto w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-brand-600 text-white grid place-items-center">
                  <v.icon className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="mt-2.5 sm:mt-3 font-semibold text-sm sm:text-base">{t(v.title, locale)}</div>
                <div className="mt-1 text-[13px] sm:text-sm text-slate-600 leading-relaxed">{t(v.desc, locale)}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-24 pb-12 sm:pb-20">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 px-5 sm:px-10 py-9 sm:py-12 text-center text-white shadow-xl">
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="anim-blob absolute -top-12 -right-8 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
              <div className="anim-blob absolute -bottom-16 -left-10 w-64 h-64 rounded-full bg-emerald-300/20 blur-2xl" style={{ animationDelay: "-8s" }} />
            </div>
            <div className="relative">
              <h2 className="text-xl sm:text-3xl font-bold tracking-tight">{t("home.finalCta.title", locale)}</h2>
              <p className="mt-2 sm:mt-3 text-sm sm:text-base text-brand-50/90 max-w-xl mx-auto leading-relaxed">{t("home.finalCta.desc", locale)}</p>
              <div className="mt-5 sm:mt-7 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 sm:gap-3">
                <Link
                  href={session ? `/${locale}/dashboard` : `/${locale}/signup`}
                  className="inline-flex items-center justify-center gap-2 bg-white text-brand-700 hover:bg-brand-50 px-5 sm:px-6 py-2.5 sm:py-3 rounded-md font-semibold shadow-sm transition-transform motion-safe:hover:scale-[1.03] text-sm sm:text-base"
                >
                  {session ? t("landing.enter", locale) : t("auth.signupCta", locale)} <ArrowRight className="w-4 h-4" />
                </Link>
                {!session && (
                  <Link
                    href={`/${locale}/login`}
                    className="inline-flex items-center justify-center gap-2 border border-white/40 hover:bg-white/10 px-5 sm:px-6 py-2.5 sm:py-3 rounded-md font-medium text-sm sm:text-base"
                  >
                    <LogIn className="w-4 h-4" /> {t("auth.loginCta", locale)}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="px-4 sm:px-6 py-6 sm:py-8 text-center text-[11px] sm:text-xs text-slate-500 leading-relaxed">
        <div className="max-w-md mx-auto">
          DokanAI · The Infinity AI BuildFest 2026 · Track 4 · E-commerce
        </div>
      </footer>
    </main>
  );
}

// ── Small presentational helpers ──────────────────────────────────────────
function SectionKicker({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
      {children}
    </span>
  );
}

function Spotlight({
  title,
  desc,
  visual,
  reverse = false,
}: {
  title: string;
  desc: string;
  visual: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <Reveal>
      <div className="grid lg:grid-cols-2 gap-5 sm:gap-8 items-center">
        <div className={reverse ? "lg:order-2" : ""}>
          <h3 className="text-lg sm:text-2xl font-bold tracking-tight">{title}</h3>
          <p className="mt-2 sm:mt-3 text-sm sm:text-base text-slate-600 leading-relaxed">{desc}</p>
        </div>
        <div className={reverse ? "lg:order-1" : ""}>{visual}</div>
      </div>
    </Reveal>
  );
}

// ── Graphical mockups (pure CSS/SVG, no external images) ───────────────────
function HeroPreview({ locale }: { locale: Locale }) {
  const bars = [42, 60, 38, 75, 55, 88, 70, 96];
  const festivals = ["Eid", "Puja", "Pohela Boishakh", "Victory Day", "ঈদ", "পূজা"];
  return (
    <div className="anim-float relative mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white/90 backdrop-blur p-3 sm:p-4 shadow-2xl overflow-hidden">
      {/* window chrome */}
      <div className="flex items-center gap-2 pb-2.5 sm:pb-3 border-b border-slate-100 min-w-0">
        <div className="w-6 h-6 rounded-md bg-brand-600 grid place-items-center text-white text-[10px] font-bold shrink-0">D</div>
        <span className="text-sm font-semibold truncate">{t("brand.name", locale)}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-brand-700 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 anim-ring" /> {t("home.hero.tag.live", locale)}
        </span>
      </div>

      {/* animated bar chart — gap tightens on phones so 8 bars don't crush */}
      <div className="mt-3 sm:mt-4">
        <div className="text-xs font-medium text-slate-500">{t("nav.forecast", locale)}</div>
        <div className="mt-2 flex items-end gap-1 sm:gap-1.5 h-20 sm:h-24">
          {bars.map((h, i) => (
            <div
              key={i}
              className="anim-bar flex-1 rounded-t bg-gradient-to-t from-brand-600 to-brand-400 min-w-0"
              style={{ height: `${h}%`, animationDelay: `${i * 90}ms` }}
            />
          ))}
        </div>
      </div>

      {/* festival chip marquee */}
      <div className="mt-3 sm:mt-4 overflow-hidden">
        <div className="anim-marquee flex w-max gap-1.5 sm:gap-2">
          {[...festivals, ...festivals].map((f, i) => (
            <span key={i} className="shrink-0 rounded-full bg-brand-50 border border-brand-100 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-[11px] text-brand-700">
              🎉 {f}
            </span>
          ))}
        </div>
      </div>

      {/* footer row: voice + rto. min-w-0 + flex-shrink so RTO chip never wraps off */}
      <div className="mt-3 sm:mt-4 flex items-center gap-2 sm:gap-3 min-w-0">
        <div className="relative grid place-items-center shrink-0">
          <span className="absolute w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-brand-400/50 anim-ring" />
          <span className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-brand-600 grid place-items-center text-white">
            <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </span>
        </div>
        <div className="flex items-end gap-0.5 h-5 sm:h-6 shrink min-w-0">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="anim-wave w-1 rounded-full bg-brand-400"
              style={{ height: "100%", animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-[11px] font-medium text-amber-700 shrink-0">
          <ShieldAlert className="w-3 h-3" /> RTO 18%
        </span>
      </div>
    </div>
  );
}

function ForecastVisual({ locale }: { locale: Locale }) {
  const bars = [30, 45, 38, 52, 60, 48, 72, 85, 70, 92];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-700 min-w-0">
        <TrendingUp className="w-4 h-4 text-brand-600 shrink-0" /> <span className="truncate">{t("forecast.title", locale)}</span>
      </div>
      <div className="relative mt-3 sm:mt-4 flex items-end gap-1 sm:gap-1.5 h-32 sm:h-40">
        {bars.map((h, i) => (
          <div key={i} className="relative flex-1 anim-bar min-w-0" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="w-full rounded-t bg-gradient-to-t from-brand-600 to-brand-400" style={{ height: `${h * 1.6}px` }} />
            {i === 7 && (
              <span className="absolute -top-5 sm:-top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-brand-600 px-1 sm:px-1.5 py-0.5 text-[9px] sm:text-[10px] font-medium text-white">
                🎉 Eid
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 text-[10px] sm:text-[11px] text-slate-400 leading-tight">{t("forecast.subtitle", locale)}</div>
    </div>
  );
}

function VoiceVisual({ locale }: { locale: Locale }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-brand-50 to-white p-6 sm:p-8 shadow-sm grid place-items-center">
      <div className="relative grid place-items-center">
        <span className="absolute w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-brand-400/40 anim-ring" />
        <span className="absolute w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-brand-400/30 anim-ring" style={{ animationDelay: "0.8s" }} />
        <span className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-brand-600 grid place-items-center text-white shadow-lg">
          <Mic className="w-6 h-6 sm:w-8 sm:h-8" />
        </span>
      </div>
      <div className="mt-5 sm:mt-6 flex items-end gap-1 h-8 sm:h-10">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <span key={i} className="anim-wave w-1 sm:w-1.5 rounded-full bg-brand-500" style={{ height: "100%", animationDelay: `${i * 110}ms` }} />
        ))}
      </div>
      <p className="mt-4 sm:mt-5 text-center text-[13px] sm:text-sm text-slate-600 max-w-xs leading-relaxed px-2">
        “এই সপ্তাহে কোন পণ্য সবচেয়ে বেশি বিক্রি হয়েছে?”
      </p>
      <span className="mt-2 text-[11px] text-brand-700 font-medium">{t("home.hero.tag.bn", locale)}</span>
    </div>
  );
}

function RtoVisual({ locale }: { locale: Locale }) {
  const orders = [
    { id: "#1042", risk: 12, tone: "ok" },
    { id: "#1043", risk: 68, tone: "high" },
    { id: "#1044", risk: 34, tone: "mid" },
  ];
  const toneClass: Record<string, string> = {
    ok: "from-brand-500 to-brand-600",
    mid: "from-amber-400 to-amber-500",
    high: "from-rose-500 to-rose-600",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-700 min-w-0">
        <ShieldAlert className="w-4 h-4 text-brand-600 shrink-0" /> <span className="truncate">{t("rto.title", locale)}</span>
      </div>
      <div className="mt-3 sm:mt-4 space-y-2.5 sm:space-y-3">
        {orders.map((o) => (
          <div key={o.id} className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="w-10 sm:w-12 text-[11px] sm:text-xs font-medium text-slate-500 shrink-0">{o.id}</span>
            <div className="flex-1 h-2 sm:h-2.5 rounded-full bg-slate-100 overflow-hidden min-w-0">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${toneClass[o.tone]} transition-all duration-700`}
                style={{ width: `${o.risk}%` }}
              />
            </div>
            <span className="w-9 sm:w-10 text-right text-[11px] sm:text-xs font-semibold text-slate-700 shrink-0">{o.risk}%</span>
          </div>
        ))}
      </div>
      <div className="mt-2.5 sm:mt-3 text-[10px] sm:text-[11px] text-slate-400 leading-tight">{t("rto.subtitle", locale)}</div>
    </div>
  );
}
