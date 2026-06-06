"use client";

import { useState } from "react";
import { FileText, Sheet, Zap } from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";
import { LiveSyncPanel } from "./LiveSyncPanel";
import { ZapierWebhookPanel } from "./ZapierWebhookPanel";

/**
 * Sub-tab shell inside the outer "Live Sync" tab. The two ingress
 * integrations live behind independent sub-tabs:
 *
 *   - "Google Sheets"  → LiveSyncPanel (OAuth pull, daily Cron + Sync now)
 *   - "Zapier"         → ZapierWebhookPanel (token-gated push)
 *
 * Each panel owns its own React state + its own API + its own kv namespace
 * (see lib/google/oauth.ts + lib/sheetSync/store.ts versus lib/zapierSync/store.ts).
 * Switching sub-tabs unmounts the inactive panel — by design, since their
 * state isn't shared and there's no value in keeping it warm.
 */

type SubTab = "google" | "zapier";

export function LiveSyncTabs({ locale }: { locale: Locale }) {
  const [sub, setSub] = useState<SubTab>("google");
  return (
    <div>
      {/* Sub-tab bar. Same TabButton visual language as the parent
          OnboardingTabs so the two-level structure reads as nested
          without an extra explanatory header. */}
      <div className="flex items-center gap-1 mb-4 border-b border-slate-200 overflow-x-auto">
        <SubTabButton
          active={sub === "google"}
          onClick={() => setSub("google")}
          Icon={Sheet}
          label={t("ob.live.tab.google", locale)}
        />
        <SubTabButton
          active={sub === "zapier"}
          onClick={() => setSub("zapier")}
          Icon={Zap}
          label={t("ob.live.tab.zapier", locale)}
        />
      </div>

      {sub === "google" && <LiveSyncPanel locale={locale} />}
      {/* alwaysExpanded skips the panel's own collapse toggle — the parent
          tab is now the disclosure. Auto-loads state on mount instead of
          waiting for the click. */}
      {sub === "zapier" && <ZapierWebhookPanel locale={locale} alwaysExpanded />}
    </div>
  );
}

function SubTabButton({
  active,
  onClick,
  Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  Icon: typeof FileText;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors shrink-0 " +
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
