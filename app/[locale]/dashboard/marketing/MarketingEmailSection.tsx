"use client";

import { useState } from "react";
import { CalendarClock, Send } from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";
import { EmailComposer } from "./EmailComposer";
import { ScheduledEmails } from "./ScheduledEmails";

/**
 * Two-tab container for the Auto-Marketing email feature:
 *   - "Compose"  -> EmailComposer (three audience templates, persisted per
 *                   audience+locale in localStorage)
 *   - "Scheduled" -> ScheduledEmails (list of every email campaign with
 *                    cancel button)
 *
 * The tabs are local state — the previous flat layout (composer + no list)
 * stays inside the Compose tab so nothing about it regresses. The Scheduled
 * tab is purely additive.
 *
 * When the composer fires a new schedule, we bump `refreshKey` so the
 * Scheduled tab's list reloads from the server next time it's viewed (and
 * we don't auto-jump — the user keeps composing if they want to send to a
 * second / third audience).
 */
type TabKey = "compose" | "scheduled";

export function MarketingEmailSection({ locale }: { locale: Locale }) {
  const [tab, setTab] = useState<TabKey>("compose");
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="mb-6">
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-3 border-b border-slate-200">
        <TabButton
          active={tab === "compose"}
          onClick={() => setTab("compose")}
          Icon={Send}
          label={t("mkt.tab.compose", locale)}
        />
        <TabButton
          active={tab === "scheduled"}
          onClick={() => setTab("scheduled")}
          Icon={CalendarClock}
          label={t("mkt.tab.scheduled", locale)}
        />
      </div>

      {tab === "compose" ? (
        <EmailComposer
          locale={locale}
          onScheduled={() => setRefreshKey((k) => k + 1)}
        />
      ) : (
        <ScheduledEmails locale={locale} refreshKey={refreshKey} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  Icon: typeof Send;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors " +
        (active
          ? "border-brand-600 text-brand-700 font-medium"
          : "border-transparent text-slate-600 hover:text-slate-900")
      }
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}
