"use client";

import { useEffect, useState } from "react";
import { t, type Locale } from "@/lib/i18n/messages";
import { formatBDT } from "@/lib/utils";
import type { CustomerSummary } from "@/lib/ai/recommend";

interface ApiResp {
  recs: { product: { id: string; name: string; nameBn: string; category: string; price: number }; score: number; reason: string }[];
  history: { orderId: string; date: string; product: { id: string; name: string; nameBn: string }; qty: number; unitPrice: number }[];
}

export function RecommendationView({ locale, customers }: { locale: Locale; customers: CustomerSummary[] }) {
  const [selected, setSelected] = useState(customers[0]?.id ?? "");
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    fetch(`/api/recommend?customerId=${selected}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [selected]);

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-6">
      <aside className="rounded-lg border border-slate-200 bg-white">
        <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium">
          {t("rec.pickCustomer", locale)}
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {customers.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              className={`w-full text-left px-4 py-2 border-b border-slate-100 hover:bg-slate-50 ${
                selected === c.id ? "bg-brand-50" : ""
              }`}
            >
              <div className="text-sm font-medium">{c.name}</div>
              <div className="text-[11px] text-slate-500">
                {c.city} · {c.ordersCount} orders · {formatBDT(c.totalSpent)}
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="space-y-6">
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium">
            {t("rec.history", locale)}
          </div>
          {loading && <div className="p-4 text-sm text-slate-500">{t("common.loading", locale)}</div>}
          {!loading && data && (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-4 py-2">Product</th>
                  <th className="text-right px-4 py-2">Qty</th>
                  <th className="text-right px-4 py-2">Price</th>
                </tr>
              </thead>
              <tbody>
                {data.history.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-3 text-slate-500 text-sm">No purchase history.</td></tr>
                )}
                {data.history.map((h, idx) => (
                  <tr key={idx} className="border-t border-slate-100">
                    <td className="px-4 py-2 text-slate-500">{h.date}</td>
                    <td className="px-4 py-2">{locale === "bn" ? h.product.nameBn : h.product.name}</td>
                    <td className="px-4 py-2 text-right">{h.qty}</td>
                    <td className="px-4 py-2 text-right">{formatBDT(h.unitPrice * h.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium">
            {t("rec.suggestions", locale)}
          </div>
          {loading && <div className="p-4 text-sm text-slate-500">{t("common.loading", locale)}</div>}
          {!loading && data && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
              {data.recs.map((r) => (
                <div key={r.product.id} className="rounded-md border border-slate-200 p-3">
                  <div className="text-[11px] uppercase text-slate-500">{r.product.category}</div>
                  <div className="font-medium mt-0.5">{locale === "bn" ? r.product.nameBn : r.product.name}</div>
                  <div className="mt-1 text-sm text-slate-600">{formatBDT(r.product.price)}</div>
                  <div className="mt-2 text-xs text-slate-500">{r.reason}</div>
                  <div className="mt-2 inline-flex items-center text-[11px] px-2 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-200">
                    {t("rec.score", locale)}: {r.score}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
