import Link from "next/link";
import { LangSwitcher } from "./LangSwitcher";
import { LogoutButton } from "./LogoutButton";
import { t, type Locale } from "@/lib/i18n/messages";
import {
  BarChart3,
  LayoutDashboard,
  TrendingUp,
  Tag,
  Sparkles,
  Megaphone,
  Users,
  Mic,
  ShieldAlert,
  UploadCloud,
} from "lucide-react";

const links = [
  { key: "nav.overview", href: "/dashboard", icon: LayoutDashboard },
  { key: "nav.analyze", href: "/dashboard/analyze", icon: BarChart3 },
  { key: "nav.forecast", href: "/dashboard/forecast", icon: TrendingUp },
  { key: "nav.pricing", href: "/dashboard/pricing", icon: Tag },
  { key: "nav.recommendations", href: "/dashboard/recommendations", icon: Sparkles },
  { key: "nav.marketing", href: "/dashboard/marketing", icon: Megaphone },
  { key: "nav.customers", href: "/dashboard/customers", icon: Users },
  { key: "nav.voice", href: "/dashboard/voice", icon: Mic },
  { key: "nav.rto", href: "/dashboard/rto", icon: ShieldAlert },
  { key: "nav.onboarding", href: "/dashboard/onboarding", icon: UploadCloud },
];

function shopLabel(userName?: string, userEmail?: string): string {
  if (userName) return userName;
  if (userEmail) return userEmail.split("@")[0];
  return "";
}

export function DashboardShell({
  locale,
  children,
  userName,
  userEmail,
}: {
  locale: Locale;
  children: React.ReactNode;
  userName?: string;
  userEmail?: string;
}) {
  const shop = shopLabel(userName, userEmail);
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50">
      <aside className="lg:w-64 lg:min-h-screen border-b lg:border-b-0 lg:border-r border-slate-200 bg-white">
        <div className="p-4 flex items-center gap-2">
          <Link href={`/${locale}`} className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-brand-600 grid place-items-center text-white font-bold">D</div>
            <div>
              <div className="font-semibold leading-none">{t("brand.name", locale)}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{t("brand.tagline", locale)}</div>
            </div>
          </Link>
        </div>
        {shop && (
          <div className="px-4 pb-3">
            <div className="rounded-md bg-brand-50 border border-brand-200 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-brand-700">{t("auth.workspace", locale)}</div>
              <div className="text-sm font-medium text-brand-900 truncate">{shop}</div>
            </div>
          </div>
        )}
        <nav className="px-2 pb-4 grid grid-cols-3 gap-1 lg:flex lg:flex-col">
          {links.map((l) => (
            <Link
              key={l.key}
              href={`/${locale}${l.href}`}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-700 hover:bg-slate-100"
            >
              <l.icon className="w-4 h-4 text-slate-500" />
              <span className="hidden lg:inline">{t(l.key, locale)}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0">
        <div className="px-6 py-3 border-b border-slate-200 bg-white flex items-center justify-between gap-3">
          <div className="text-sm text-slate-500 truncate">
            {shop && (
              <>
                {t("auth.signedInAs", locale)} <span className="font-medium text-slate-700">{shop}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <LogoutButton locale={locale} />
            <LangSwitcher locale={locale} />
          </div>
        </div>
        <main className="p-6 max-w-7xl mx-auto">{children}</main>
      </div>
    </div>
  );
}
