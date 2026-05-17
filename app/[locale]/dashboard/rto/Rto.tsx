import { pendingCodRisks, rtoSummaryProjection } from "@/lib/ai/rto";
import { t, type Locale } from "@/lib/i18n/messages";
import { formatBDT } from "@/lib/utils";
import { ShieldAlert, ShieldCheck, Phone, Truck } from "lucide-react";
import { isShopEmpty } from "@/lib/data/store";
import { NoDataState } from "@/components/NoDataState";

export default function RtoPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  if (isShopEmpty()) return <NoDataState locale={locale} />;
  const risks = pendingCodRisks().slice(0, 30);
  const summary = rtoSummaryProjection();

  const levelStyle: Record<string, string> = {
    high: "bg-rose-50 text-rose-700 border-rose-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    low: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("rto.title", locale)}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("rto.subtitle", locale)}</p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase text-slate-500">Pending COD</div>
          <div className="mt-1 text-2xl font-semibold">{summary.totalOrders}</div>
          <div className="text-xs text-slate-500">orders awaiting decision</div>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <div className="text-xs uppercase text-rose-700">High risk</div>
          <div className="mt-1 text-2xl font-semibold text-rose-800">{summary.highRiskCount}</div>
          <div className="text-xs text-rose-700">flag for advance payment</div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-xs uppercase text-emerald-700">Projected RTO drop</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-800">−{summary.drop}%</div>
          <div className="text-xs text-emerald-700">if you act on flagged orders</div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-600" />
          Pending COD orders by RTO risk
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">{t("rto.col.order", locale)}</th>
                <th className="text-left px-4 py-2">{t("rto.col.customer", locale)}</th>
                <th className="text-right px-4 py-2">{t("rto.col.value", locale)}</th>
                <th className="text-left px-4 py-2">{t("rto.col.city", locale)}</th>
                <th className="text-left px-4 py-2">{t("rto.col.courier", locale)}</th>
                <th className="text-left px-4 py-2">{t("rto.col.risk", locale)}</th>
                <th className="text-left px-4 py-2">{t("rto.col.action", locale)}</th>
              </tr>
            </thead>
            <tbody>
              {risks.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-4 text-center text-slate-500">No pending COD orders.</td></tr>
              )}
              {risks.map((r) => {
                const action =
                  r.riskLevel === "high" ? "advance" : r.riskLevel === "medium" ? "confirm" : "ship";
                const Icon = action === "advance" ? ShieldCheck : action === "confirm" ? Phone : Truck;
                return (
                  <tr key={r.orderId} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-mono text-[12px] text-slate-500">{r.orderId}</td>
                    <td className="px-4 py-2">{r.customerName}</td>
                    <td className="px-4 py-2 text-right">{formatBDT(r.total)}</td>
                    <td className="px-4 py-2">{r.city}</td>
                    <td className="px-4 py-2 capitalize">{r.courier}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border ${levelStyle[r.riskLevel]}`}>
                        {(r.riskScore * 100).toFixed(0)}% · {r.riskLevel}
                      </span>
                      {r.factors.length > 0 && (
                        <div className="text-[11px] text-slate-500 mt-1">{r.factors.join(" · ")}</div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50">
                        <Icon className="w-3 h-3" />
                        {t(`rto.action.${action}`, locale)}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {summary.totalOrders > 0 && (
        <p className="mt-4 text-sm text-slate-600">
          {t("rto.summary", locale)} <span className="font-semibold">{summary.drop}%</span>.
        </p>
      )}
    </div>
  );
}
