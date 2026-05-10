import { KpiCard } from "@/components/KpiCard";
import { RevenueChart } from "@/components/charts/RevenueChart";
import { StatusPill } from "@/components/StatusPill";
import { computeOverview, recentOrders } from "@/lib/ai/overview";
import { t, type Locale } from "@/lib/i18n/messages";
import { formatBDT, formatNumber, formatPercent } from "@/lib/utils";

export default function OverviewPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  const m = computeOverview();
  const recent = recentOrders(10);

  const trend = (a: number, b: number) => (b === 0 ? 0 : ((a - b) / b) * 100);

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("overview.title", locale)}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("overview.subtitle", locale)}</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label={t("overview.kpi.revenue", locale)}
          value={formatBDT(m.revenue30)}
          trend={trend(m.revenue30, m.revenuePrev30)}
        />
        <KpiCard
          label={t("overview.kpi.orders", locale)}
          value={formatNumber(m.orders30)}
          trend={trend(m.orders30, m.ordersPrev30)}
        />
        <KpiCard
          label={t("overview.kpi.repeat", locale)}
          value={formatPercent(m.repeatRate)}
          trend={trend(m.repeatRate, m.repeatRatePrev)}
        />
        <KpiCard
          label={t("overview.kpi.rto", locale)}
          value={formatPercent(m.rtoRate)}
          trend={-trend(m.rtoRate, m.rtoRatePrev)}
        />
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-sm font-medium mb-2">{t("overview.chart.title", locale)}</div>
        <RevenueChart data={m.daily.map((d) => ({ date: d.date, revenue: d.revenue }))} />
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white">
        <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium">
          {t("overview.recent", locale)}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">{t("overview.col.id", locale)}</th>
                <th className="text-left px-4 py-2">{t("overview.col.customer", locale)}</th>
                <th className="text-right px-4 py-2">{t("overview.col.total", locale)}</th>
                <th className="text-left px-4 py-2">{t("overview.col.status", locale)}</th>
                <th className="text-left px-4 py-2">{t("overview.col.date", locale)}</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((o) => (
                <tr key={o.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-mono text-[12px] text-slate-500">{o.id}</td>
                  <td className="px-4 py-2">{o.customer}</td>
                  <td className="px-4 py-2 text-right">{formatBDT(o.total)}</td>
                  <td className="px-4 py-2"><StatusPill status={o.status} locale={locale} /></td>
                  <td className="px-4 py-2 text-slate-500">{o.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
