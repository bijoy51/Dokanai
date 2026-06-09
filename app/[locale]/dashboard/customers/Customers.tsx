import { rfmScores, segmentBreakdown } from "@/lib/ai/churn";
import { t, type Locale } from "@/lib/i18n/messages";
import { formatBDT, formatNumber } from "@/lib/utils";
import { Crown, HeartHandshake, AlertTriangle, Moon, Sparkles } from "lucide-react";
import { getStore, isShopEmpty } from "@/lib/data/store";
import { NoDataState } from "@/components/NoDataState";
import { getSession } from "@/lib/auth";
import { CustomersTable, type CustomersTableRow } from "./CustomersTable";

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
  if (isShopEmpty()) return <NoDataState locale={locale} />;
  const all = rfmScores();
  const summary = segmentBreakdown();
  const store = getStore();

  // Join the RFM score rows with the underlying customer record so the
  // client table has the email field (RFM CustomerScore drops it). This is
  // cheaper than passing the whole store down — we only need name + email.
  const rows: CustomersTableRow[] = all.slice(0, 30).map((c) => {
    const cust = store.customerById(c.customerId);
    return {
      customerId: c.customerId,
      name: c.name,
      email: cust?.email ?? "",
      city: c.city,
      segment: c.segment,
      recency: c.recency,
      frequency: c.frequency,
      monetary: c.monetary,
    };
  });

  const shopOwnerEmail = getSession()?.email ?? "";

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{t("ch.title", locale)}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("ch.subtitle", locale)}</p>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
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
        <CustomersTable rows={rows} locale={locale} shopOwnerEmail={shopOwnerEmail} />
      </section>
    </div>
  );
}
