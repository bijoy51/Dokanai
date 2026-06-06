"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  LogOut,
  PlugZap,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";

/**
 * Live Sync panel — pull-based via Google OAuth.
 *
 * Three UI states:
 *   1. Not signed in to Google      -> "Sign in with Google" button
 *   2. Signed in, no sheet bound    -> Sheet ID/URL input + "Connect" button
 *   3. Sheet bound                  -> Status + "Sync now" / "Disconnect"
 *
 * The OAuth dance is server-side in /api/google/oauth/{start,callback}.
 * This component never sees the access token or refresh token — only the
 * public-safe slice (connected? googleEmail? lastError?).
 *
 * After the callback redirects back here with ?google=connected (or an
 * error code), we re-fetch the panel state so the new connection appears
 * immediately.
 */

interface OAuthState {
  connected: boolean;
  googleEmail?: string;
  connectedAt?: number;
  lastRefreshAt?: number;
  lastError?: string;
}
interface Binding {
  sheetId: string;
  sheetTitle?: string;
  createdAt: number;
  lastSyncAt: number;
  totalRowsEver: number;
  lastError?: string;
  lastErrorAt?: number;
}

export function LiveSyncPanel({ locale }: { locale: Locale }) {
  const params = useSearchParams();
  const [oauth, setOauth] = useState<OAuthState | null>(null);
  const [binding, setBinding] = useState<Binding | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sheetInput, setSheetInput] = useState("");
  const [error, setError] = useState("");
  const [callbackBanner, setCallbackBanner] = useState<{
    kind: "ok" | "error";
    msg: string;
  } | null>(null);

  // Read ?google=connected | google=... query flag set by the OAuth callback.
  useEffect(() => {
    const g = params?.get("google");
    if (!g) return;
    if (g === "connected") {
      setCallbackBanner({ kind: "ok", msg: t("ob.sync.callbackConnected", locale) });
    } else {
      setCallbackBanner({
        kind: "error",
        msg: t("ob.sync.callbackFailed", locale) + " (" + g + ")",
      });
    }
    // Strip the param from the URL so a reload doesn't keep re-flashing.
    const url = new URL(window.location.href);
    url.searchParams.delete("google");
    window.history.replaceState({}, "", url.toString());
  }, [params, locale]);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/sheet-sync");
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      setOauth(data.oauth ?? null);
      setBinding(data.binding ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startOAuth = () => {
    // Server-side redirect so the auth_url params (state cookie etc.)
    // come from our server, not from the browser.
    window.location.href = `/api/google/oauth/start?locale=${locale}`;
  };

  const connectSheet = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/sheet-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetIdOrUrl: sheetInput, sync: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Connect failed (${res.status})`);
        if (data.code === "reauth_required" || data.code === "not_connected") {
          setOauth(null);
        }
      } else {
        setSheetInput("");
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connect failed");
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/sheet-sync", { method: "PUT" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Sync failed (${res.status})`);
        if (data.code === "reauth_required") setOauth(null);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  const disconnectSheet = async () => {
    if (!confirm(t("ob.sync.confirmDisconnect", locale))) return;
    setBusy(true);
    try {
      await fetch("/api/sheet-sync", { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const disconnectGoogle = async () => {
    if (!confirm(t("ob.sync.confirmDisconnectGoogle", locale))) return;
    setBusy(true);
    try {
      await fetch("/api/sheet-sync?google=1", { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  };

  // ----- loading -----
  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500 inline-flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t("ob.sync.loading", locale)}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2 mb-1">
          <PlugZap className="w-4 h-4 text-brand-600" />
          {t("ob.sync.title", locale)}
        </h2>
        <p className="text-sm text-slate-600">{t("ob.sync.intro", locale)}</p>
      </div>

      {/* Verification-status warning. Stays visible in every state — pre-OAuth,
          post-OAuth-no-sheet, and connected — because the test-users
          constraint applies at the Google consent screen and is the most
          common reason a new user can't connect. Red so it can't be missed. */}
      <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2.5 text-xs text-rose-900 flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
        <div>
          <div className="font-semibold mb-0.5">{t("ob.sync.unverifiedTitle", locale)}</div>
          <div className="text-rose-800/90 leading-relaxed">
            {t("ob.sync.unverifiedBody", locale)}
          </div>
        </div>
      </div>

      {callbackBanner && (
        <div
          className={
            "rounded-md border px-3 py-2 text-xs flex items-start gap-1.5 " +
            (callbackBanner.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800")
          }
        >
          {callbackBanner.kind === "ok" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{callbackBanner.msg}</span>
        </div>
      )}

      {/* ----- State 1: not signed in to Google ----- */}
      {!oauth?.connected && (
        <div className="space-y-3">
          <ul className="text-xs text-slate-500 space-y-1 list-disc pl-5">
            <li>{t("ob.sync.bullet1", locale)}</li>
            <li>{t("ob.sync.bullet2", locale)}</li>
            <li>{t("ob.sync.bullet3", locale)}</li>
          </ul>
          <button
            type="button"
            onClick={startOAuth}
            className="inline-flex items-center justify-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-sm font-medium rounded-md px-4 py-2 shadow-sm"
          >
            <GoogleIcon />
            {t("ob.sync.signInGoogle", locale)}
          </button>
        </div>
      )}

      {/* ----- State 2: signed in, no sheet bound ----- */}
      {oauth?.connected && !binding && (
        <div className="space-y-3">
          <GoogleAccountChip email={oauth.googleEmail} locale={locale} onDisconnect={disconnectGoogle} />
          <div>
            <label className="text-xs text-slate-500 block mb-1 flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              {t("ob.sync.sheetIdLabel", locale)}
            </label>
            <div className="flex items-center gap-2">
              <input
                value={sheetInput}
                onChange={(e) => setSheetInput(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…/edit"
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={connectSheet}
                disabled={busy || !sheetInput.trim()}
                className="inline-flex items-center justify-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
                {t("ob.sync.connect", locale)}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">{t("ob.sync.sheetIdHint", locale)}</p>
          </div>
        </div>
      )}

      {/* ----- State 3: sheet bound (connected) ----- */}
      {oauth?.connected && binding && (
        <div className="space-y-3">
          <GoogleAccountChip email={oauth.googleEmail} locale={locale} onDisconnect={disconnectGoogle} />

          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>
              {t("ob.sync.connected", locale)} ·{" "}
              <a
                href={`https://docs.google.com/spreadsheets/d/${binding.sheetId}/edit`}
                target="_blank"
                rel="noreferrer"
                className="underline inline-flex items-center gap-0.5"
              >
                {binding.sheetTitle || binding.sheetId.slice(0, 16) + "…"}
                <ExternalLink className="w-3 h-3" />
              </a>
            </span>
          </div>

          <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
            {binding.lastSyncAt > 0 ? (
              <span>
                {t("ob.sync.lastSync", locale)}: {new Date(binding.lastSyncAt).toLocaleString()}
              </span>
            ) : (
              <span>{t("ob.sync.waitingFirst", locale)}</span>
            )}
            <span>· {binding.totalRowsEver.toLocaleString()} {t("ob.sync.rowsEver", locale)}</span>
            <span>· {t("ob.sync.autoSync", locale)}</span>
          </div>

          {binding.lastError && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2 py-1">
              <strong>{t("ob.sync.lastError", locale)}:</strong> {binding.lastError}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={syncNow}
              disabled={busy}
              className="text-xs text-brand-700 hover:text-brand-900 inline-flex items-center gap-1 border border-brand-200 hover:bg-brand-50 rounded-md px-3 py-1.5 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {t("ob.sync.syncNow", locale)}
            </button>
            <button
              type="button"
              onClick={disconnectSheet}
              disabled={busy}
              className="text-xs text-rose-700 hover:text-rose-900 inline-flex items-center gap-1 border border-rose-200 hover:bg-rose-50 rounded-md px-3 py-1.5 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t("ob.sync.disconnectSheet", locale)}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
    </section>
  );
}

function GoogleAccountChip({
  email,
  locale,
  onDisconnect,
}: {
  email?: string;
  locale: Locale;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
      <span className="flex items-center gap-1.5 min-w-0">
        <GoogleIcon size={14} />
        <span className="truncate">
          {t("ob.sync.signedInAs", locale)}: <strong>{email ?? t("ob.sync.unknownGoogleAccount", locale)}</strong>
        </span>
      </span>
      <button
        type="button"
        onClick={onDisconnect}
        className="ml-2 inline-flex items-center gap-1 text-slate-500 hover:text-rose-700"
      >
        <LogOut className="w-3 h-3" />
        {t("ob.sync.signOutGoogle", locale)}
      </button>
    </div>
  );
}

function GoogleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.5 12.27c0-.79-.07-1.55-.2-2.27H12v4.51h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.22-4.74 3.22-8.3z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.12c-.22-.66-.34-1.36-.34-2.12s.12-1.46.34-2.12V7.04H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.96l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.07.56 4.21 1.65l3.16-3.16C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
