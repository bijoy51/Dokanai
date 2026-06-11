"use client";

import { useState } from "react";
import { Crown, HeartHandshake, AlertTriangle, Moon, Sparkles } from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";
import { formatBDT } from "@/lib/utils";
import { PersonalEmailModal, type PersonalAction, type PersonalEmailTarget } from "./PersonalEmailModal";

/**
 * Client-side wrapper for the Customers table.
 *
 * The page-level RFM scoring + auth + segment join all stay server-side. We
 * receive a fully-resolved row shape and own only the interactive layer:
 *   - rendering the action button per segment,
 *   - opening the PersonalEmailModal with the right action,
 *   - holding the single shared modal state (one open at a time).
 *
 * Action mapping mirrors the previous static page:
 *   atrisk / dormant  -> "coupon" (win-back)
 *   vip               -> "thank"
 *   loyal / new       -> "upsell"
 *
 * Walk-in customer rows still render the button — the modal opens with a
 * blank `to` field and an inline note so the operator can type one in.
 */

export interface CustomersTableRow {
  customerId: string;
  name: string;
  email: string;
  city: string;
  segment: "vip" | "loyal" | "atrisk" | "dormant" | "new";
  recency: number;
  frequency: number;
  monetary: number;
}

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

function actionFor(seg: CustomersTableRow["segment"]): PersonalAction {
  if (seg === "atrisk" || seg === "dormant") return "coupon";
  if (seg === "vip") return "thank";
  return "upsell";
}

export function CustomersTable({
  rows,
  locale,
  shopOwnerEmail,
  shopOwnerName,
}: {
  rows: CustomersTableRow[];
  locale: Locale;
  shopOwnerEmail: string;
  shopOwnerName?: string;
}) {
  const [target, setTarget] = useState<PersonalEmailTarget | null>(null);

  return (
    <>
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
            {rows.map((c) => {
              const Icon = segIcon[c.segment];
              const action = actionFor(c.segment);
              return (
                <tr key={c.customerId} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-[11px] text-slate-500">{c.city}</div>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border ${segStyle[c.segment]}`}
                    >
                      <Icon className="w-3 h-3" />
                      {t(`ch.seg.${c.segment}`, locale)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">{c.recency}d</td>
                  <td className="px-4 py-2 text-right">{c.frequency}</td>
                  <td className="px-4 py-2 text-right">{formatBDT(c.monetary)}</td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() =>
                        setTarget({
                          customerId: c.customerId,
                          name: c.name,
                          email: c.email,
                          action,
                        })
                      }
                      className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 hover:border-brand-300"
                    >
                      {t(`ch.action.${action}`, locale)}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <PersonalEmailModal
        locale={locale}
        target={target}
        shopOwnerEmail={shopOwnerEmail}
        shopOwnerName={shopOwnerName}
        onClose={() => setTarget(null)}
      />
    </>
  );
}
