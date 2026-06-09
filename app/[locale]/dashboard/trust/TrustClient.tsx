"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Gauge, Scale, Loader2, AlertCircle } from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";

interface Metric { label: string; value: string; note?: string }
interface ModelCard { name: string; type: string; source: string; metrics: Metric[] }
interface ModelQuality { models: ModelCard[]; generatedNote: string }

interface BiasGroupRow { group: string; populationShare: number; selectedShare: number; ratio: number; status: string }
interface BiasFinding { lens: string; dimension: string; rows: BiasGroupRow[]; maxDeviation: number; status: string }
interface BiasReport { findings: BiasFinding[]; overall: string; notes: string[]; totalCustomers: number }

const statusColor: Record<string, string> = {
  fair: "text-emerald-700 bg-emerald-50 border-emerald-200",
  watch: "text-amber-700 bg-amber-50 border-amber-200",
  skewed: "text-rose-700 bg-rose-50 border-rose-200",
  ok: "text-emerald-700",
  under: "text-amber-700",
  over: "text-sky-700",
};

export function TrustClient({ locale }: { locale: Locale }) {
  const [mq, setMq] = useState<ModelQuality | null>(null);
  const [bias, setBias] = useState<BiasReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [mqRes, biasRes] = await Promise.all([
          fetch("/api/model-quality").then((r) => r.json()),
          fetch("/api/bias-audit").then((r) => r.json()),
        ]);
        if (!alive) return;
        if (mqRes?.error || biasRes?.error) setError(mqRes?.error || biasRes?.error);
        setMq(mqRes);
        setBias(biasRes);
      } catch {
        if (alive) setError("Could not load the report.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-500 text-sm py-10">
        <Loader2 className="w-4 h-4 animate-spin" /> {t("trust.loading", locale)}
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" /> <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Model quality */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Gauge className="w-5 h-5 text-brand-600" />
          <h2 className="text-lg font-semibold">{t("trust.modelsTitle", locale)}</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {mq?.models.map((m) => (
            <div key={m.name} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-sm">{m.name}</div>
                <span className="text-[10px] uppercase tracking-wide text-slate-400">{m.source}</span>
              </div>
              <div className="mt-3 space-y-2">
                {m.metrics.map((mt) => (
                  <div key={mt.label} className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-slate-500">{mt.label}</span>
                    <span className="text-sm font-semibold text-slate-900">{mt.value}</span>
                  </div>
                ))}
              </div>
              {m.metrics.some((x) => x.note) && (
                <div className="mt-2 text-[11px] text-slate-400 leading-tight">
                  {m.metrics.filter((x) => x.note).map((x) => `${x.label}: ${x.note}`).join(" · ")}
                </div>
              )}
            </div>
          ))}
        </div>
        {mq?.generatedNote && <p className="mt-2 text-[11px] text-slate-400">{mq.generatedNote}</p>}
      </section>

      {/* Bias / fairness audit */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Scale className="w-5 h-5 text-brand-600" />
          <h2 className="text-lg font-semibold">{t("trust.biasTitle", locale)}</h2>
          {bias && (
            <span className={"ml-2 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border " + (statusColor[bias.overall] || "")}>
              {bias.overall}
            </span>
          )}
        </div>

        {bias && bias.findings.length === 0 && (
          <p className="text-sm text-slate-500">{t("trust.biasEmpty", locale)}</p>
        )}

        <div className="space-y-4">
          {bias?.findings.map((f, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                <div className="text-sm font-medium">
                  {f.lens} <span className="text-slate-400">·</span> {f.dimension}
                </div>
                <span className={"text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border " + (statusColor[f.status] || "")}>
                  {f.status}
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2 font-medium">{t("trust.group", locale)}</th>
                    <th className="px-4 py-2 font-medium text-right">{t("trust.population", locale)}</th>
                    <th className="px-4 py-2 font-medium text-right">{t("trust.selected", locale)}</th>
                    <th className="px-4 py-2 font-medium text-right">{t("trust.ratio", locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {f.rows.map((r) => (
                    <tr key={r.group} className="border-t border-slate-100">
                      <td className="px-4 py-2">{r.group}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{Math.round(r.populationShare * 100)}%</td>
                      <td className="px-4 py-2 text-right text-slate-600">{Math.round(r.selectedShare * 100)}%</td>
                      <td className={"px-4 py-2 text-right font-semibold " + (statusColor[r.status] || "")}>
                        {r.ratio.toFixed(2)}×
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {bias?.notes.map((n, i) => (
          <p key={i} className="mt-2 text-[11px] text-slate-500 flex items-start gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-brand-600" /> <span>{n}</span>
          </p>
        ))}
      </section>
    </div>
  );
}
