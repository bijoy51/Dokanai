import Link from "next/link";
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
        <DashboardNav locale={locale} />
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
