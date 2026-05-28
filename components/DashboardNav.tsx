"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
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
import { t, type Locale } from "@/lib/i18n/messages";

/**
 * Sidebar nav with active-state highlighting. usePathname() is client-only,
 * which is why this lives in its own client component — DashboardShell stays
 * a server component (renders the chrome, owns the session lookup).
 *
 * Match rules:
 *   - Exact match for /dashboard (Overview), so non-Overview sub-routes don't
 *     light up the Overview row.
 *   - Prefix match for everything else, so e.g. /dashboard/agent and any
 *     future /dashboard/agent/sub still highlight Pilot.
 */
const LINKS: Array<{ key: string; href: string; icon: typeof LayoutDashboard }> = [
  { key: "nav.overview", href: "/dashboard", icon: LayoutDashboard },
  { key: "nav.pilot", href: "/dashboard/agent", icon: Bot },
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

function isActive(pathname: string, locale: Locale, href: string): boolean {
  const full = `/${locale}${href}`;
  if (href === "/dashboard") return pathname === full || pathname === `${full}/`;
  return pathname === full || pathname.startsWith(`${full}/`);
}

export function DashboardNav({ locale }: { locale: Locale }) {
  const pathname = usePathname() ?? "";
  return (
    <nav className="px-2 pb-4 grid grid-cols-3 gap-1 lg:flex lg:flex-col">
      {LINKS.map((l) => {
        const active = isActive(pathname, locale, l.href);
        return (
          <Link
            key={l.key}
            href={`/${locale}${l.href}`}
            aria-current={active ? "page" : undefined}
            className={
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors " +
              (active
                ? "bg-brand-50 text-brand-900 font-medium border border-brand-200"
                : "text-slate-700 hover:bg-slate-100")
            }
          >
            <l.icon className={"w-4 h-4 " + (active ? "text-brand-700" : "text-slate-500")} />
            <span className="hidden lg:inline">{t(l.key, locale)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
