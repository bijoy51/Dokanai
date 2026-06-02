"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Link as LinkIcon,
  Loader2,
  PlugZap,
  RefreshCw,
  RotateCw,
  Trash2,
} from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";

/**
 * "Live Sync" tab in Khata-to-Cloud.
 *
 * Two states:
 *   - Not connected: a "Connect" button that calls POST /api/sheet-sync.
 *     We receive { shopId, token, webhookUrl } and reveal them ONCE.
 *   - Connected: shows status (last sync, total rows, last error), plus
 *     the Apps Script snippet with the user's URL substituted in.
 *
 * The full token is only displayed right after Connect or Rotate; on
 * subsequent loads (GET) the server only returns the public slice (no
 * token). The user must rotate to get a fresh URL if they lose theirs.
 */

const SCRIPT_TEMPLATE = `// === DokanAI Live Sync — paste this into your Google Sheet ===
// Extensions -> Apps Script -> paste -> Save (disk icon).
// Then reload the sheet, click the "DokanAI" menu -> "Setup auto-sync"
// and authorise when Google asks. From then on, every edit pushes the
// sheet's contents to your DokanAI dashboard within ~30 seconds.

const DOKANAI_WEBHOOK = "__WEBHOOK_URL__";

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("DokanAI")
    .addItem("Sync now", "syncNow")
    .addItem("Setup auto-sync", "setupAutoSync")
    .addItem("Stop auto-sync", "stopAutoSync")
    .addToUi();
}

function setupAutoSync() {
  stopAutoSync();
  ScriptApp.newTrigger("syncDebounced")
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
  syncNow();
  SpreadsheetApp.getUi().alert(
    "Auto-sync is ON. Every edit will push to DokanAI within ~30 seconds."
  );
}

function stopAutoSync() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "syncDebounced") ScriptApp.deleteTrigger(t);
  });
}

// Debounced wrapper so a flurry of edits doesn't fire a flurry of POSTs.
function syncDebounced() {
  var props = PropertiesService.getDocumentProperties();
  var last = parseInt(props.getProperty("lastPush") || "0", 10);
  var now = Date.now();
  if (now - last < 20000) return;
  props.setProperty("lastPush", String(now));
  syncNow();
}

function syncNow() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  var headers = values[0].map(function (h) { return String(h || "").trim().toLowerCase(); });
  var rows = values.slice(1).map(function (row) {
    var obj = {};
    headers.forEach(function (h, i) {
      if (!h) return;
      var v = row[i];
      // Format dates as YYYY-MM-DD for the server.
      if (v instanceof Date) {
        obj[h] = Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
      } else {
        obj[h] = v;
      }
    });
    return obj;
  });
  // Heuristic split into products vs sales by present columns. Same row
  // can match both (e.g. an item-level invoice line) and the server's
  // buildDataset() handles that case correctly.
  var products = rows.filter(function (r) { return r.name && r.price != null; });
  var sales = rows.filter(function (r) { return r.date && r.product; });
  if (products.length === 0 && sales.length === 0) {
    SpreadsheetApp.getActive().toast(
      "Nothing to sync — your sheet needs a header row with name+price (products) or date+product (sales)."
    );
    return;
  }
  var res = UrlFetchApp.fetch(DOKANAI_WEBHOOK, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ products: products, sales: sales }),
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code >= 200 && code < 300) {
    SpreadsheetApp.getActive().toast("DokanAI: synced " + sales.length + " sales, " + products.length + " products.");
  } else {
    SpreadsheetApp.getActive().toast("DokanAI sync failed (" + code + "): " + res.getContentText().slice(0, 200));
  }
}
`;

interface PublicState {
  shopId: string;
  createdAt: number;
  lastSyncAt: number;
  totalRowsEver: number;
  lastError?: string;
  lastErrorAt?: number;
}

interface Credentials {
  shopId: string;
  token: string;
  webhookUrl: string;
}

export function LiveSyncPanel({ locale }: { locale: Locale }) {
  const [state, setState] = useState<PublicState | null | "loading">("loading");
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [busy, setBusy] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState<"url" | "snippet" | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/sheet-sync");
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      setState(data.state ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setState(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/sheet-sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to set up sync.");
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
    if (!confirm(t("ob.sync.confirmRotate", locale))) return;
    await connect();
  };

  const disconnect = async () => {
    if (!confirm(t("ob.sync.confirmDisconnect", locale))) return;
    setBusy(true);
    setError("");
    try {
      await fetch("/api/sheet-sync", { method: "DELETE" });
      setCreds(null);
      setShowToken(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const copy = async (kind: "url" | "snippet", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — user can manually select */
    }
  };

  if (state === "loading") {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500 inline-flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t("ob.sync.loading", locale)}
      </section>
    );
  }

  // ----- Not connected yet -----
  if (state === null && !creds) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold flex items-center gap-2 mb-1">
          <PlugZap className="w-4 h-4 text-brand-600" />
          {t("ob.sync.title", locale)}
        </h2>
        <p className="text-sm text-slate-600 mb-3">{t("ob.sync.intro", locale)}</p>
        <ul className="text-xs text-slate-500 space-y-1 mb-4 list-disc pl-5">
          <li>{t("ob.sync.bullet1", locale)}</li>
          <li>{t("ob.sync.bullet2", locale)}</li>
          <li>{t("ob.sync.bullet3", locale)}</li>
        </ul>
        <button
          type="button"
          onClick={connect}
          disabled={busy}
          className="inline-flex items-center justify-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
          {t("ob.sync.connect", locale)}
        </button>
        {error && (
          <div className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
      </section>
    );
  }

  // ----- Connected -----
  const url = creds?.webhookUrl;
  const snippet = url ? SCRIPT_TEMPLATE.replace("__WEBHOOK_URL__", url) : null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2 mb-1">
          <PlugZap className="w-4 h-4 text-brand-600" />
          {t("ob.sync.title", locale)}
        </h2>
        <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
            <CheckCircle2 className="w-3 h-3" />
            {t("ob.sync.connected", locale)}
          </span>
          {state && state.lastSyncAt > 0 && (
            <span>
              {t("ob.sync.lastSync", locale)}: {new Date(state.lastSyncAt).toLocaleString()}
            </span>
          )}
          {state && state.lastSyncAt === 0 && <span>{t("ob.sync.waitingFirst", locale)}</span>}
          {state && <span>· {state.totalRowsEver.toLocaleString()} {t("ob.sync.rowsEver", locale)}</span>}
        </div>
        {state?.lastError && (
          <div className="mt-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2 py-1">
            <strong>{t("ob.sync.lastError", locale)}:</strong> {state.lastError}
          </div>
        )}
      </div>

      {/* Webhook URL — only visible right after connect/rotate */}
      {url && (
        <div>
          <label className="text-xs text-slate-500 block mb-1 flex items-center gap-1.5">
            <LinkIcon className="w-3.5 h-3.5" />
            {t("ob.sync.webhookUrl", locale)}
          </label>
          <div className="flex items-center gap-2">
            <input
              type={showToken ? "text" : "password"}
              value={url}
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
              onClick={() => copy("url", url)}
              className="inline-flex items-center gap-1 text-xs border border-slate-300 hover:bg-slate-50 rounded-md px-2 py-2"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied === "url" ? t("ob.sync.copied", locale) : t("ob.sync.copy", locale)}
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">{t("ob.sync.urlOnceWarning", locale)}</p>
        </div>
      )}

      {!url && state && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          {t("ob.sync.urlHidden", locale)}
        </div>
      )}

      {/* Apps Script snippet */}
      {snippet && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-slate-500">{t("ob.sync.snippetLabel", locale)}</label>
            <button
              type="button"
              onClick={() => copy("snippet", snippet)}
              className="inline-flex items-center gap-1 text-xs border border-slate-300 hover:bg-slate-50 rounded-md px-2 py-1"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied === "snippet" ? t("ob.sync.copied", locale) : t("ob.sync.copySnippet", locale)}
            </button>
          </div>
          <textarea
            value={snippet}
            readOnly
            rows={10}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-[11px] font-mono bg-slate-50 leading-relaxed"
          />
          <p className="text-[11px] text-slate-500 mt-1 whitespace-pre-line">{t("ob.sync.howTo", locale)}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={load}
          className="text-xs text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 border border-slate-300 hover:bg-slate-50 rounded-md px-3 py-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {t("ob.sync.refresh", locale)}
        </button>
        <button
          type="button"
          onClick={rotate}
          disabled={busy}
          className="text-xs text-amber-700 hover:text-amber-900 inline-flex items-center gap-1 border border-amber-200 hover:bg-amber-50 rounded-md px-3 py-1.5 disabled:opacity-50"
        >
          <RotateCw className="w-3.5 h-3.5" />
          {t("ob.sync.rotate", locale)}
        </button>
        <button
          type="button"
          onClick={disconnect}
          disabled={busy}
          className="text-xs text-rose-700 hover:text-rose-900 inline-flex items-center gap-1 border border-rose-200 hover:bg-rose-50 rounded-md px-3 py-1.5 disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t("ob.sync.disconnect", locale)}
        </button>
      </div>

      {error && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
    </section>
  );
}
