import { TrendingUp, TrendingDown, Mail, Clock } from "lucide-react";
import type { LiftRollup } from "@/lib/ai/campaignLift";
import { t, type Locale } from "@/lib/i18n/messages";
import { formatBDT } from "@/lib/utils";

/**
 * Surfaces measurable post-campaign revenue lift on the Marketing page.
 *
 * Plain synchronous component — the rollup is fetched at the page level
 * (an async server component in app/[locale]/dashboard/marketing) and
 * passed in as a prop, so this component stays trivially testable.
 *
 * Renders nothing when the account has no completed campaigns AND no
 * pending-window campaigns, so first-time users aren't bothered with an
 * empty card.
 */
export function CampaignLiftCard({
  locale,
  rollup,
}: {
  locale: Locale;
  rollup: LiftRollup | null;
}) {
  if (!rollup) return null;
  if (rollup.campaigns.length === 0 && rollup.pendingCount === 0) return null;

  const positive = rollup.weightedLiftPct >= 0;
  const TrendIcon = positive ? TrendingUp : TrendingDown;

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Mail className="w-4 h-4 text-brand-600" />
          {t("mkt.lift.title", locale)}
        </div>
        {rollup.pendingCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
            <Clock className="w-3 h-3" />
            {rollup.pendingCount} {t("mkt.lift.pending", locale)}
          </span>
        )}
      </div>

      {rollup.campaigns.length > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50/40">
            <Stat label={t("mkt.lift.before", locale)} value={formatBDT(rollup.totalRevenueBefore)} sub={`${rollup.totalOrdersBefore} ${t("mkt.lift.orders", locale)}`} />
            <Stat label={t("mkt.lift.after", locale)} value={formatBDT(rollup.totalRevenueAfter)} sub={`${rollup.totalOrdersAfter} ${t("mkt.lift.orders", locale)}`} />
            <Stat
              label={t("mkt.lift.liftPct", locale)}
              value={
                <span className={positive ? "text-emerald-700" : "text-rose-700"}>
                  <TrendIcon className="inline w-4 h-4 mr-1" />
                  {positive ? "+" : ""}
                  {rollup.weightedLiftPct.toFixed(1)}%
                </span>
              }
              sub={t("mkt.lift.weighted", locale)}
            />
            <Stat
              label={t("mkt.lift.campaigns", locale)}
              value={String(rollup.campaigns.length)}
              sub={t("mkt.lift.measured", locale)}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">{t("mkt.lift.col.sent", locale)}</th>
                  <th className="text-left px-4 py-2">{t("mkt.lift.col.audience", locale)}</th>
                  <th className="text-right px-4 py-2">{t("mkt.lift.col.recipients", locale)}</th>
                  <th className="text-right px-4 py-2">{t("mkt.lift.col.before", locale)}</th>
                  <th className="text-right px-4 py-2">{t("mkt.lift.col.after", locale)}</th>
                  <th className="text-right px-4 py-2">{t("mkt.lift.col.lift", locale)}</th>
                </tr>
              </thead>
              <tbody>
                {rollup.campaigns.map((c) => (
                  <tr key={c.campaignId} className="border-t border-slate-100">
                    <td className="px-4 py-2 text-slate-500">{c.sentAt}</td>
                    <td className="px-4 py-2">{c.audience}</td>
                    <td className="px-4 py-2 text-right">{c.recipients}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{formatBDT(c.revenueBefore)}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatBDT(c.revenueAfter)}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={c.liftPct >= 0 ? "text-emerald-700" : "text-rose-700"}>
                        {c.liftPct >= 0 ? "+" : ""}
                        {c.liftPct.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-100">
            {t("mkt.lift.methodology", locale)}
          </div>
        </>
      ) : (
        <div className="p-4 text-sm text-slate-500">
          {t("mkt.lift.allPending", locale)}
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase text-slate-500">{label}</div>
      <div className="text-base font-semibold mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}
