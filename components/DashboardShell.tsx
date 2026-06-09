"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { LangSwitcher } from "./LangSwitcher";
import { LogoutButton } from "./LogoutButton";
import { DashboardNav } from "./DashboardNav";
import { t, type Locale } from "@/lib/i18n/messages";

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
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open on mobile.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile top bar (visible below lg). Holds hamburger + small brand + lang. */}
      <div className="lg:hidden sticky top-0 z-30 bg-white border-b border-slate-200 px-3 py-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="p-2 -ml-1 rounded-md hover:bg-slate-100 text-slate-700"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link href={`/${locale}`} className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-md bg-brand-600 grid place-items-center text-white font-bold text-sm shrink-0">D</div>
          <span className="font-semibold text-sm truncate">{t("brand.name", locale)}</span>
        </Link>
        <LangSwitcher locale={locale} />
      </div>

      <div className="flex">
        {/* Backdrop for mobile drawer */}
        {open && (
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar:
              - <lg: fixed drawer that slides in from the left.
              - lg+:  truly fixed at the left edge, always 100vh tall — it
                      never scrolls with the page, regardless of how long
                      the main content gets. The main column gets a
                      matching `lg:ml-64` so its content doesn't slide
                      under the sidebar. */}
        <aside
          className={
            "fixed top-0 left-0 z-50 lg:z-30 " +
            "h-full lg:h-screen " +
            "w-72 sm:w-64 lg:w-64 bg-white border-r border-slate-200 " +
            "transform transition-transform duration-200 ease-out lg:transform-none " +
            "flex flex-col " +
            (open ? "translate-x-0" : "-translate-x-full lg:translate-x-0")
          }
          aria-label="Primary"
        >
          <div className="p-4 flex items-center justify-between gap-2">
            <Link href={`/${locale}`} className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-md bg-brand-600 grid place-items-center text-white font-bold shrink-0">D</div>
              <div className="min-w-0">
                <div className="font-semibold leading-none truncate">{t("brand.name", locale)}</div>
                <div className="text-[11px] text-slate-500 mt-0.5 truncate">{t("brand.tagline", locale)}</div>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="lg:hidden p-1.5 rounded-md hover:bg-slate-100 text-slate-600 shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {shop && (
            <div className="px-4 pb-3">
              <div className="rounded-md bg-brand-50 border border-brand-200 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-brand-700">{t("auth.workspace", locale)}</div>
                <div className="text-sm font-medium text-brand-900 truncate">{shop}</div>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            <DashboardNav locale={locale} />
          </div>

          {/* Mobile-only footer inside drawer: signed-in info + logout */}
          <div className="lg:hidden border-t border-slate-200 p-4 space-y-2">
            {shop && (
              <div className="text-xs text-slate-500 truncate">
                {t("auth.signedInAs", locale)}{" "}
                <span className="font-medium text-slate-700">{shop}</span>
              </div>
            )}
            <LogoutButton locale={locale} />
          </div>
        </aside>

        {/* Main column. lg:ml-64 leaves room for the fixed sidebar so
            the content never slides under it. min-w-0 lets long tables /
            wide charts shrink inside this flex item instead of pushing
            the document wide. */}
        <div className="flex-1 min-w-0 lg:ml-64">
          {/* Desktop top bar (hidden on mobile — mobile has its own bar above) */}
          <div className="hidden lg:flex px-4 sm:px-6 py-3 border-b border-slate-200 bg-white items-center justify-between gap-3">
            <div className="text-sm text-slate-500 truncate">
              {shop && (
                <>
                  {t("auth.signedInAs", locale)}{" "}
                  <span className="font-medium text-slate-700">{shop}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <LogoutButton locale={locale} />
              <LangSwitcher locale={locale} />
            </div>
          </div>
          <main className="p-4 sm:p-6 max-w-7xl mx-auto">{children}</main>
        </div>
      </div>
    </div>
  );
}
