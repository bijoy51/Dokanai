"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText, Images } from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";
import { KhataUploader } from "./KhataUploader";
import { PhotoUploader } from "./PhotoUploader";
import { PdfUploader } from "./PdfUploader";

/**
 * Tabbed shell for Khata-to-Cloud onboarding.
 *
 * Three import paths:
 *   - CSV    -> the existing KhataUploader (unchanged behavior + flow)
 *   - Photos -> PhotoUploader: 1-8 images -> /api/import/extract via OpenAI Vision
 *   - PDF    -> PdfUploader:   1 PDF      -> /api/import/extract via pdf-parse + OpenAI
 *
 * Each tab is independent — switching between tabs preserves whatever the
 * user had selected (files stay in component state, errors stay localised
 * to the tab) until they actually submit and replace the dataset.
 */
type TabKey = "csv" | "photos" | "pdf";

export function OnboardingTabs({ locale }: { locale: Locale }) {
  const [tab, setTab] = useState<TabKey>("csv");

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-4 border-b border-slate-200 overflow-x-auto">
        <TabButton
          active={tab === "csv"}
          onClick={() => setTab("csv")}
          Icon={FileSpreadsheet}
          label={t("ob.tab.csv", locale)}
        />
        <TabButton
          active={tab === "photos"}
          onClick={() => setTab("photos")}
          Icon={Images}
          label={t("ob.tab.photos", locale)}
        />
        <TabButton
          active={tab === "pdf"}
          onClick={() => setTab("pdf")}
          Icon={FileText}
          label={t("ob.tab.pdf", locale)}
        />
      </div>

      {/* Per-tab help text */}
      <p className="text-xs text-slate-500 mb-3">
        {tab === "csv" && t("ob.tab.csvHint", locale)}
        {tab === "photos" && t("ob.tab.photosHint", locale)}
        {tab === "pdf" && t("ob.tab.pdfHint", locale)}
      </p>

      {tab === "csv" && <KhataUploader locale={locale} />}
      {tab === "photos" && <PhotoUploader locale={locale} />}
      {tab === "pdf" && <PdfUploader locale={locale} />}
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
