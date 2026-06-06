"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Chrome,
  Download,
  ExternalLink,
  Info,
  LogIn,
  Monitor,
  Share2,
  Smartphone,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { t, type Locale } from "@/lib/i18n/messages";

/**
 * PWA install panel. Three runtime states:
 *
 *   1. INSTALLED       — `display-mode: standalone` matches OR we caught
 *                        the `appinstalled` event. Show the green
 *                        "Installed" card with a one-tap link straight
 *                        to the dashboard.
 *   2. INSTALLABLE     — the browser fired `beforeinstallprompt` and
 *                        gave us the deferred event. Show a big "Install"
 *                        button that fires `prompt()` on click.
 *   3. NOT INSTALLABLE — neither of the above. Most common case: iOS
 *                        Safari (no beforeinstallprompt support but DOES
 *                        support Add to Home Screen via Share menu), or
 *                        Firefox desktop (no PWA install at all). Show
 *                        OS-specific manual instructions.
 *
 * Why no "force install" — the browser only honours .prompt() inside a
 * user gesture handler and only when its own heuristics decided the site
 * is install-worthy (HTTPS + manifest + SW + recent engagement). We can't
 * bypass that, so the UI surfaces what the platform allows.
 */

// ---- typings for the Web App Install events that TypeScript's lib.dom
// declares as `Event` and not as the proper subclass. ----
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type InstallState = "loading" | "installed" | "installable" | "not_installable";

function detectPlatform(): "ios" | "android" | "desktop" | "unknown" {
  if (typeof window === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Macintosh|Windows|Linux|CrOS/.test(ua)) return "desktop";
  return "unknown";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // Modern API
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari legacy property
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return false;
}

export function InstallClient({ locale }: { locale: Locale }) {
  const [state, setState] = useState<InstallState>("loading");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<ReturnType<typeof detectPlatform>>("unknown");
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPlatform(detectPlatform());

    if (isStandalone()) {
      setState("installed");
      return;
    }

    const onBeforeInstall = (e: Event) => {
      // The browser is offering to install — block its mini-infobar and
      // hold the event for our own button.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setState("installable");
    };
    const onInstalled = () => {
      setDeferred(null);
      setState("installed");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // If neither event fires within ~1.5s we conclude the browser/platform
    // doesn't support the programmatic install flow (iOS Safari, Firefox).
    const t = window.setTimeout(() => {
      setState((prev) => (prev === "loading" ? "not_installable" : prev));
    }, 1500);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      window.clearTimeout(t);
    };
  }, []);

  const triggerInstall = async () => {
    if (!deferred) return;
    setInstalling(true);
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setState("installed");
      }
      // Either way, the deferred event is single-use.
      setDeferred(null);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="space-y-4">
      <ValuePropBanner locale={locale} />

      {state === "loading" && <LoadingCard locale={locale} />}
      {state === "installed" && <InstalledCard locale={locale} />}
      {state === "installable" && (
        <InstallableCard
          locale={locale}
          onInstall={triggerInstall}
          busy={installing}
        />
      )}
      {state === "not_installable" && <ManualCard locale={locale} platform={platform} />}

      <PersistentSessionNote locale={locale} />
    </div>
  );
}

// ---------- top banner ----------

function ValuePropBanner({ locale }: { locale: Locale }) {
  return (
    <div className="relative overflow-hidden rounded-xl p-5 sm:p-6 bg-gradient-to-br from-emerald-600 via-teal-500 to-sky-500 text-white shadow-lg">
      <div
        className="pointer-events-none absolute inset-0 opacity-30 mix-blend-overlay"
        style={{
          backgroundImage:
            "radial-gradient(circle at 15% 20%, rgba(255,255,255,0.4) 0%, transparent 35%), radial-gradient(circle at 85% 80%, rgba(255,255,255,0.25) 0%, transparent 35%)",
        }}
        aria-hidden="true"
      />
      <div className="relative">
        <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-semibold bg-white/15 backdrop-blur rounded-full px-2.5 py-1 mb-3">
          <Sparkles className="w-3 h-3" />
          {t("install.banner.eyebrow", locale)}
        </div>
        <h2 className="text-lg sm:text-2xl font-bold leading-tight max-w-3xl">
          {t("install.banner.title", locale)}
        </h2>
        <p className="mt-2 text-sm sm:text-base text-white/90 max-w-3xl leading-relaxed">
          {t("install.banner.body", locale)}
        </p>
      </div>
    </div>
  );
}

// ---------- state cards ----------

function LoadingCard({ locale }: { locale: Locale }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
      {t("install.loading", locale)}
    </div>
  );
}

function InstalledCard({ locale }: { locale: Locale }) {
  return (
    <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white grid place-items-center shrink-0">
          <Check className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-emerald-900">
            {t("install.installed.title", locale)}
          </div>
          <p className="text-sm text-emerald-900/80 mt-1">{t("install.installed.body", locale)}</p>
          <Link
            href={`/${locale}/dashboard`}
            className="mt-4 inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-md px-4 py-2"
          >
            {t("install.installed.openDashboard", locale)}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function InstallableCard({
  locale,
  onInstall,
  busy,
}: {
  locale: Locale;
  onInstall: () => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-xl border-2 border-brand-300 bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-600 text-white grid place-items-center shrink-0">
          <Download className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-slate-900">
            {t("install.installable.title", locale)}
          </div>
          <p className="text-sm text-slate-600 mt-1">{t("install.installable.body", locale)}</p>
          <button
            type="button"
            onClick={onInstall}
            disabled={busy}
            className="mt-4 inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-md px-5 py-2.5 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {busy ? t("install.installable.busy", locale) : t("install.installable.cta", locale)}
          </button>
        </div>
      </div>
    </div>
  );
}

function ManualCard({
  locale,
  platform,
}: {
  locale: Locale;
  platform: ReturnType<typeof detectPlatform>;
}) {
  const Icon = platform === "ios" ? Smartphone : platform === "android" ? Smartphone : Monitor;
  let bodyKey: string;
  if (platform === "ios") bodyKey = "install.manual.ios";
  else if (platform === "android") bodyKey = "install.manual.android";
  else if (platform === "desktop") bodyKey = "install.manual.desktop";
  else bodyKey = "install.manual.unknown";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 grid place-items-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-slate-900">
            {t("install.manual.title", locale)}
          </div>
          <p className="text-sm text-slate-600 mt-1 whitespace-pre-line">{t(bodyKey, locale)}</p>
          {platform === "ios" && (
            <div className="mt-3 inline-flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5">
              <Share2 className="w-3.5 h-3.5" />
              {t("install.manual.iosTip", locale)}
            </div>
          )}
          {platform === "desktop" && (
            <div className="mt-3 inline-flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5">
              <Chrome className="w-3.5 h-3.5" />
              {t("install.manual.desktopTip", locale)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- persistent-session note (always visible at the bottom) ----------

function PersistentSessionNote({ locale }: { locale: Locale }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 grid place-items-center shrink-0">
        <LogIn className="w-4 h-4" />
      </div>
      <div className="text-sm">
        <div className="font-semibold text-slate-900">{t("install.sessionNote.title", locale)}</div>
        <p className="text-slate-600 mt-0.5">{t("install.sessionNote.body", locale)}</p>
        <div className="mt-2 text-[12px] text-slate-500 inline-flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" />
          {t("install.sessionNote.foot", locale)}
          <a
            href="/manifest.webmanifest"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-sky-700 hover:underline"
          >
            manifest
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
