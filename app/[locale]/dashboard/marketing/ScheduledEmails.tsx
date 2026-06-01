"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Crown,
  Loader2,
  Mail,
  RefreshCw,
  ShieldAlert,
  UserMinus,
  XCircle,
  X as XIcon,
} from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";

/**
 * Lists every email campaign for the signed-in account: scheduled,
 * in_progress, sent, partial, cancelled, failed. Each row shows the
 * audience, subject, when it fires, and (for scheduled campaigns) a
 * Cancel button. Refreshes when `refreshKey` changes — the parent bumps
 * that any time a new campaign is scheduled in the sibling Compose tab.
 */
interface Campaign {
  id: string;
  createdAt: number;
  scheduledFor: string;
  startedAt?: string;
  finishedAt?: string;
  channel: "email" | string;
  audience: string;
  message: string;
  subject?: string;
  status:
    | "scheduled"
    | "in_progress"
    | "sent"
    | "partial"
    | "cancelled"
    | "failed";
  stats?: {
    audience?: number;
    withEmail?: number;
    optedIn?: number;
    sent?: number;
    failed?: number;
    unsubscribed?: number;
  };
}

/** Heuristic mapper from the audience descriptor string to an icon + label.
 *  audience is stored as free text ("vip" or "at-risk customers" etc.), so
 *  we keyword-match the same way lib/email/audience.ts does. */
function audienceMeta(descriptor: string, locale: Locale) {
  const d = (descriptor || "").toLowerCase();
  if (/\bvip\b/.test(d)) return { Icon: Crown, label: t("mkt.email.audVip", locale), tone: "amber" };
  if (/\brto\b|return.*origin|cod.*risk/.test(d))
    return { Icon: ShieldAlert, label: t("mkt.email.audRto", locale), tone: "rose" };
  if (/at[\s-]?risk|atrisk|dormant|lapsed|winback/.test(d))
    return { Icon: UserMinus, label: t("mkt.email.audAtrisk", locale), tone: "indigo" };
  return { Icon: Mail, label: descriptor || "—", tone: "slate" };
}

function statusBadge(status: Campaign["status"], locale: Locale) {
  const map: Record<Campaign["status"], { label: string; classes: string; Icon: typeof CheckCircle2 }> = {
    scheduled:    { label: t("mkt.sched.statusScheduled", locale),  classes: "bg-amber-50 text-amber-700 border-amber-200",     Icon: CalendarClock },
    in_progress:  { label: t("mkt.sched.statusInProgress", locale), classes: "bg-sky-50 text-sky-700 border-sky-200",            Icon: Loader2 },
    sent:         { label: t("mkt.sched.statusSent", locale),       classes: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
    partial:      { label: t("mkt.sched.statusPartial", locale),    classes: "bg-yellow-50 text-yellow-800 border-yellow-200",   Icon: CheckCircle2 },
    cancelled:    { label: t("mkt.sched.statusCancelled", locale),  classes: "bg-slate-100 text-slate-600 border-slate-200",     Icon: XIcon },
    failed:       { label: t("mkt.sched.statusFailed", locale),     classes: "bg-rose-50 text-rose-700 border-rose-200",         Icon: XCircle },
  };
  const m = map[status] ?? map.scheduled;
  const spin = status === "in_progress" ? " animate-spin" : "";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium border rounded-full px-2 py-0.5 ${m.classes}`}>
      <m.Icon className={`w-3 h-3${spin}`} />
      {m.label}
    </span>
  );
}

export function ScheduledEmails({
  locale,
  refreshKey = 0,
}: {
  locale: Locale;
  /** Bump to force a re-fetch (e.g. after a sibling Compose schedules a new email). */
  refreshKey?: number;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/marketing/email-campaigns");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
      setCampaigns([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const cancel = async (id: string) => {
    setCancellingId(id);
    setError("");
    try {
      const res = await fetch(`/api/marketing/email-campaigns/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Failed (${res.status})`);
        return;
      }
      // Optimistic local update — and re-fetch so server stays authoritative.
      setCampaigns((prev) =>
        (prev ?? []).map((c) => (c.id === id ? { ...c, status: "cancelled" } : c)),
      );
      void load();
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 mb-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-brand-600" />
            {t("mkt.sched.title", locale)}
          </h2>
          <p className="text-xs text-slate-500 mt-1">{t("mkt.sched.subtitle", locale)}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1.5"
          aria-label="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {t("mkt.sched.refresh", locale)}
        </button>
      </div>

      {campaigns === null && (
        <div className="text-sm text-slate-400 inline-flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("mkt.sched.loading", locale)}
        </div>
      )}

      {campaigns !== null && campaigns.length === 0 && (
        <div className="text-sm text-slate-500 py-6 text-center bg-slate-50 rounded-lg">
          {t("mkt.sched.empty", locale)}
        </div>
      )}

      {campaigns !== null && campaigns.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {campaigns.map((c) => {
            const meta = audienceMeta(c.audience, locale);
            const when = new Date(c.scheduledFor);
            const canCancel = c.status === "scheduled" || c.status === "in_progress";
            return (
              <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <div
                    className={
                      "w-7 h-7 rounded-md grid place-items-center shrink-0 mt-0.5 " +
                      (meta.tone === "amber"
                        ? "bg-amber-50 text-amber-700"
                        : meta.tone === "rose"
                          ? "bg-rose-50 text-rose-700"
                          : meta.tone === "indigo"
                            ? "bg-indigo-50 text-indigo-700"
                            : "bg-slate-100 text-slate-600")
                    }
                  >
                    <meta.Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-slate-500 font-medium">{meta.label}</span>
                      {statusBadge(c.status, locale)}
                    </div>
                    <div className="text-sm text-slate-900 font-medium mt-0.5 truncate">
                      {c.subject || c.message.slice(0, 80)}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      <span>{t("mkt.sched.fires", locale)}</span>{" "}
                      <span className="font-mono">{when.toLocaleString()}</span>
                      {c.stats && (c.stats.sent !== undefined || c.stats.failed !== undefined) && (
                        <span className="ml-2">
                          · {t("mkt.sched.sent", locale)}: <strong>{c.stats.sent ?? 0}</strong>
                          {(c.stats.failed ?? 0) > 0 && (
                            <>
                              {" "}· {t("mkt.sched.failed", locale)}: <strong>{c.stats.failed}</strong>
                            </>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  {canCancel && (
                    <button
                      type="button"
                      onClick={() => void cancel(c.id)}
                      disabled={cancellingId === c.id}
                      className="text-xs text-rose-700 hover:text-rose-900 border border-rose-200 hover:border-rose-300 rounded-md px-2.5 py-1 disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      {cancellingId === c.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <XIcon className="w-3 h-3" />
                      )}
                      {t("mkt.sched.cancel", locale)}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <div className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}
    </section>
  );
}
