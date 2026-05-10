import { rfmScores, segmentBreakdown } from "@/lib/ai/churn";
import { t, type Locale } from "@/lib/i18n/messages";
import { formatBDT, formatNumber } from "@/lib/utils";
import { Crown, HeartHandshake, AlertTriangle, Moon, Sparkles } from "lucide-react";

const segIcon = {
  vip: Crown,
  loyal: HeartHandshake,
  atrisk: AlertTriangle,
  dormant: Moon,
  new: Sparkles,
} as const;

const segStyle: Record<string, string> = {
  vip: "bg-amber-50 text-amber-700 border-amber-200",
  loyal: "bg-emerald-50 text-emerald-700 border-emerald-200",
  atrisk: "bg-rose-50 text-rose-700 border-rose-200",
  dormant: "bg-slate-50 text-slate-600 border-slate-200",
  new: "bg-blue-50 text-blue-700 border-blue-200",
};

export default function CustomersPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  const all = rfmScores();
  const summary = segmentBreakdown();
  const top = all.slice(0, 30);

  const actionFor = (seg: string) =>
    seg === "atrisk" || seg === "dormant"
      ? "coupon"
      : seg === "vip"
        ? "thank"
        : "upsell";

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("ch.title", locale)}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("ch.subtitle", locale)}</p>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {(["vip", "loyal", "new", "atrisk", "dormant"] as const).map((seg) => {
          const s = summary.find((x) => x.segment === seg);
          const Icon = segIcon[seg];
          return (
            <div key={seg} className={`rounded-lg border p-3 ${segStyle[seg]}`}>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide">
                <Icon className="w-3.5 h-3.5" /> {t(`ch.seg.${seg}`, locale)}
              </div>
              <div className="text-2xl font-semibold mt-1">{formatNumber(s?.count ?? 0)}</div>
              <div className="text-[11px] mt-0.5 opacity-75">avg {s ? formatBDT(s.avgSpent) : "·"}</div>
            </div>
          );
        })}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium">
          Top customers (RFM scored)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">{t("ch.col.name", locale)}</th>
                <th className="text-left px-4 py-2">{t("ch.col.segment", locale)}</th>
                <th className="text-right px-4 py-2">{t("ch.col.recency", locale)}</th>
                <th className="text-right px-4 py-2">{t("ch.col.freq", locale)}</th>
                <th className="text-right px-4 py-2">{t("ch.col.spent", locale)}</th>
                <th className="text-left px-4 py-2">{t("ch.col.action", locale)}</th>
              </tr>
            </thead>
            <tbody>
              {top.map((c) => {
                const Icon = segIcon[c.segment];
                return (
                  <tr key={c.customerId} className="border-t border-slate-100">
                    <td className="px-4 py-2">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-[11px] text-slate-500">{c.city}</div>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border ${segStyle[c.segment]}`}>
                        <Icon className="w-3 h-3" />
                        {t(`ch.seg.${c.segment}`, locale)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">{c.recency}d</td>
                    <td className="px-4 py-2 text-right">{c.frequency}</td>
                    <td className="px-4 py-2 text-right">{formatBDT(c.monetary)}</td>
                    <td className="px-4 py-2">
                      <button className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50">
                        {t(`ch.action.${actionFor(c.segment)}`, locale)}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
