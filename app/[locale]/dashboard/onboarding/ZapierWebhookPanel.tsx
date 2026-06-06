"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  RotateCw,
  Trash2,
  Webhook,
  Zap,
} from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";

/**
 * Zapier webhook panel. Fully isolated from LiveSyncPanel — it talks to a
 * separate API (/api/zapier-sync) backed by a separate kv namespace
 * (zapier-webhook:<email>) and a separate ingest route
 * (/api/zapier/webhook/<shopId>).
 *
 * UI states:
 *   - Collapsed (default): single header + "Show" affordance. Reduces
 *     onboarding noise for shopkeepers who don't need this.
 *   - Expanded, not enabled: short pitch + "Generate webhook URL" button.
 *   - Expanded, enabled, URL revealed (after generate/rotate): full URL
 *     visible once with copy controls + how-to-use-in-Zapier steps.
 *   - Expanded, enabled, URL hidden (returning visit): public status
 *     (last push, total rows, last error) + Rotate / Disable actions.
 */

interface PublicState {
  shopId: string;
  createdAt: number;
  lastPushAt: number;
  totalRowsEver: number;
  lastError?: string;
  lastErrorAt?: number;
}

interface Credentials {
  shopId: string;
  token: string;
  webhookUrl: string;
}

export function ZapierWebhookPanel({
  locale,
  alwaysExpanded = false,
}: {
  locale: Locale;
  /**
   * When true (rendered inside a tab), skip the collapsible header — the
   * tab itself acts as the disclosure. Also auto-loads state on mount
   * instead of deferring to first-open.
   */
  alwaysExpanded?: boolean;
}) {
  const [open, setOpen] = useState(alwaysExpanded);
  const [state, setState] = useState<PublicState | null | "loading">("loading");
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [busy, setBusy] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/zapier-sync");
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      setState(data.state ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setState(null);
    }
  }, []);

  useEffect(() => {
    // When collapsible (default), defer the first kv fetch until the user
    // expands the section — keeps the onboarding page light for users who
    // never use it. When always-expanded (inside a tab), load on mount.
    if (open && state === "loading") void load();
  }, [open, state, load]);

  const generate = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/zapier-sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Generate failed (${res.status})`);
        return;
      }
      setCreds(data);
      setShowToken(true);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const rotate = async () => {
    if (!confirm(t("ob.zap.confirmRotate", locale))) return;
    await generate();
  };

  const disable = async () => {
    if (!confirm(t("ob.zap.confirmDisable", locale))) return;
    setBusy(true);
    setError("");
    try {
      await fetch("/api/zapier-sync", { method: "DELETE" });
      setCreds(null);
      setShowToken(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can select manually */
    }
  };

  // ---------- collapsed header (only when alwaysExpanded === false) ----------
  if (!open && !alwaysExpanded) {
    const enabled = state !== null && state !== "loading";
    return (
      <section className="rounded-xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-between gap-2 px-5 py-4 text-left hover:bg-slate-50 rounded-xl"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Zap className="w-4 h-4 text-amber-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-800">
                {t("ob.zap.title", locale)}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {enabled ? t("ob.zap.collapsedEnabled", locale) : t("ob.zap.collapsedHint", locale)}
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>
      </section>
    );
  }

  // ---------- expanded ----------
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      {alwaysExpanded ? (
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          {t("ob.zap.title", locale)}
        </h2>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="w-full flex items-center justify-between gap-2 text-left"
        >
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            {t("ob.zap.title", locale)}
          </h2>
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </button>
      )}

      <p className="text-sm text-slate-600">{t("ob.zap.intro", locale)}</p>
      <ul className="text-xs text-slate-500 space-y-1 list-disc pl-5">
        <li>{t("ob.zap.bullet1", locale)}</li>
        <li>{t("ob.zap.bullet2", locale)}</li>
        <li>{t("ob.zap.bullet3", locale)}</li>
      </ul>

      {state === "loading" && (
        <div className="text-sm text-slate-500 inline-flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("ob.zap.loading", locale)}
        </div>
      )}

      {/* Not enabled */}
      {state === null && !creds && (
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Webhook className="w-4 h-4" />}
          {t("ob.zap.generate", locale)}
        </button>
      )}

      {/* Enabled */}
      {((state && state !== "loading") || creds) && (
        <>
          {state && state !== "loading" && (
            <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
              <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                <CheckCircle2 className="w-3 h-3" />
                {t("ob.zap.active", locale)}
              </span>
              {state.lastPushAt > 0 ? (
                <span>
                  {t("ob.zap.lastPush", locale)}: {new Date(state.lastPushAt).toLocaleString()}
                </span>
              ) : (
                <span>{t("ob.zap.waitingFirst", locale)}</span>
              )}
              <span>· {state.totalRowsEver.toLocaleString()} {t("ob.zap.rowsEver", locale)}</span>
            </div>
          )}

          {state && state !== "loading" && state.lastError && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2 py-1">
              <strong>{t("ob.zap.lastError", locale)}:</strong> {state.lastError}
            </div>
          )}

          {/* URL revealed (post-generate / post-rotate) */}
          {creds && (
            <div>
              <label className="text-xs text-slate-500 block mb-1 flex items-center gap-1.5">
                <Webhook className="w-3.5 h-3.5" />
                {t("ob.zap.urlLabel", locale)}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type={showToken ? "text" : "password"}
                  value={creds.webhookUrl}
                  readOnly
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-xs font-mono bg-slate-50"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((s) => !s)}
                  className="p-2 text-slate-500 hover:text-slate-900"
                  aria-label="Show/hide"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => copy(creds.webhookUrl)}
                  className="inline-flex items-center gap-1 text-xs border border-slate-300 hover:bg-slate-50 rounded-md px-2 py-2"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copied ? t("ob.zap.copied", locale) : t("ob.zap.copy", locale)}
                </button>
              </div>
              <p className="text-[11px] text-amber-700 mt-1">{t("ob.zap.urlOnceWarning", locale)}</p>

              {/* How to wire up in Zapier */}
              <div className="mt-3 rounded-md bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700">
                <div className="font-medium mb-1.5">{t("ob.zap.howToTitle", locale)}</div>
                <ol className="list-decimal pl-5 space-y-1 leading-relaxed">
                  <li>{t("ob.zap.step1", locale)}</li>
                  <li>{t("ob.zap.step2", locale)}</li>
                  <li>{t("ob.zap.step3", locale)}</li>
                  <li>{t("ob.zap.step4", locale)}</li>
                  <li>{t("ob.zap.step5", locale)}</li>
                  <li>{t("ob.zap.step6", locale)}</li>
                </ol>
              </div>
            </div>
          )}

          {!creds && state && state !== "loading" && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              {t("ob.zap.urlHidden", locale)}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={rotate}
              disabled={busy}
              className="text-xs text-amber-700 hover:text-amber-900 inline-flex items-center gap-1 border border-amber-200 hover:bg-amber-50 rounded-md px-3 py-1.5 disabled:opacity-50"
            >
              <RotateCw className="w-3.5 h-3.5" />
              {t("ob.zap.rotate", locale)}
            </button>
            <button
              type="button"
              onClick={disable}
              disabled={busy}
              className="text-xs text-rose-700 hover:text-rose-900 inline-flex items-center gap-1 border border-rose-200 hover:bg-rose-50 rounded-md px-3 py-1.5 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t("ob.zap.disable", locale)}
            </button>
          </div>
        </>
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
