import { ForecastChart } from "@/components/charts/ForecastChart";
import { dailyForecastTotal, festivalCalendar, forecastAll } from "@/lib/ai/forecast";
import { nextFestival } from "@/lib/data/festivals";
import { t, type Locale } from "@/lib/i18n/messages";
import { formatNumber } from "@/lib/utils";
import { CalendarDays, AlertTriangle, TrendingUp, CalendarHeart } from "lucide-react";
import { isShopEmpty } from "@/lib/data/store";
import { NoDataState } from "@/components/NoDataState";

export default function ForecastPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  if (isShopEmpty()) return <NoDataState locale={locale} />;
  const daily = dailyForecastTotal();
  const all = forecastAll();
  const fests = festivalCalendar();
  // When the 60-day window is empty, surface the next-ever festival so the
  // section doesn't read as a dead end (see lib/data/festivals.nextFestival).
  const nextEver = fests.length === 0 ? nextFestival(new Date()) : null;

  const movers = [...all].sort((a, b) => b.forecastNext7 - a.forecastNext7).slice(0, 8);
  const dead = [...all]
    .filter((f) => f.daysOfStock > 30 && f.stock > 5)
    .sort((a, b) => b.daysOfStock - a.daysOfStock)
    .slice(0, 8);

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{t("forecast.title", locale)}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("forecast.subtitle", locale)}</p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-sm font-medium mb-2 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-brand-600" /> {t("forecast.chart.title", locale)}
        </div>
        <ForecastChart data={daily} />
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-sm font-medium mb-3 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-brand-600" /> {t("forecast.upcoming", locale)}
        </div>
        {fests.length === 0 ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm text-slate-600">{t("forecast.noNearFestivals", locale)}</div>
            {nextEver && (
              <div className="mt-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-md bg-amber-100 border border-amber-200 grid place-items-center text-amber-700 shrink-0">
                  <CalendarHeart className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    {t("forecast.nextEver", locale)}
                  </div>
                  <div className="text-sm font-medium text-slate-900">
                    {locale === "bn" ? nextEver.nameBn : nextEver.name}{" "}
                    <span className="text-xs text-slate-500 font-normal">· {nextEver.date}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    {locale === "bn" ? nextEver.adviceBn : nextEver.advice}
                  </div>
                  <div className="mt-1 inline-flex items-center text-[11px] px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">
                    ×{nextEver.peakBoost.toFixed(1)} {t("forecast.boostLabel", locale)}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {fests.map((f) => (
              <div key={f.id} className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <div className="font-medium text-amber-900">
                  {locale === "bn" ? f.nameBn : f.name}
                </div>
                <div className="text-xs text-amber-700 mt-0.5">{f.date}</div>
                <div className="mt-2 text-sm text-amber-900">
                  {locale === "bn" ? f.adviceBn : f.advice}
                </div>
                <div className="mt-2 inline-flex items-center text-[11px] px-2 py-0.5 rounded bg-amber-200 text-amber-900">
                  ×{f.peakBoost.toFixed(1)} {t("forecast.boostLabel", locale)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium">
            {t("forecast.movers", locale)}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Product</th>
                  <th className="text-right px-4 py-2">{t("forecast.units", locale)} (7d)</th>
                  <th className="text-right px-4 py-2">Boost</th>
                </tr>
              </thead>
              <tbody>
                {movers.map((f) => (
                  <tr key={f.productId} className="border-t border-slate-100">
                    <td className="px-4 py-2">{locale === "bn" ? f.nameBn : f.name}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatNumber(f.forecastNext7)}</td>
                    <td className="px-4 py-2 text-right">
                      {f.festivalBoost > 1.05 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-200">
                          ×{f.festivalBoost}
                        </span>
                      ) : (
                        <span className="text-slate-400">·</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            {t("forecast.deadStock", locale)}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Product</th>
                  <th className="text-right px-4 py-2">Stock</th>
                  <th className="text-right px-4 py-2">{t("forecast.daysOfStock", locale)}</th>
                </tr>
              </thead>
              <tbody>
                {dead.length === 0 && (
                  <tr><td colSpan={3} className="text-center px-4 py-4 text-slate-500 text-sm">No dead-stock risks 🎉</td></tr>
                )}
                {dead.map((f) => (
                  <tr key={f.productId} className="border-t border-slate-100">
                    <td className="px-4 py-2">{locale === "bn" ? f.nameBn : f.name}</td>
                    <td className="px-4 py-2 text-right">{f.stock}</td>
                    <td className="px-4 py-2 text-right text-rose-600 font-medium">
                      {f.daysOfStock > 365 ? "365+" : f.daysOfStock.toFixed(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
