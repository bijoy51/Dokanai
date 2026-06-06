"use client";

import { useState } from "react";
import { Beaker, Check, Loader2, Sparkles } from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";

/**
 * Demo-data quick-loader banner.
 *
 * Sits at the very top of the onboarding page. One click on "Click here"
 * fetches two sample CSVs from /public/test-data/, builds File objects in
 * the browser, and broadcasts them via a CustomEvent that
 * KhataUploader + OnboardingTabs both listen for. Net effect for a judge
 * / new visitor:
 *   - The Live Sync tab flips to CSV.
 *   - The Products + Sales file pickers are pre-filled with the demo CSVs.
 *   - The user just hits "Import shop data" to populate the dashboard.
 *
 * No new API surface. No bypass of the existing import path — the
 * imported demo data flows through the exact same /api/import endpoint
 * regular users hit, so the dashboard renders truthfully.
 */

export const DEMO_LOAD_EVENT = "dokanai:load-demo-csv";

export interface DemoLoadEventDetail {
  productsFile: File;
  salesFile: File;
}

async function fetchAsFile(url: string, filename: string, type = "text/csv"): Promise<File> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
  const blob = await res.blob();
  // Wrap in a real File so KhataUploader's existing readFile() path works
  // identically to a user-picked file from disk.
  return new File([blob], filename, { type });
}

export function DemoDataBanner({ locale }: { locale: Locale }) {
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const onClick = async () => {
    setError("");
    setLoading(true);
    try {
      const [productsFile, salesFile] = await Promise.all([
        fetchAsFile("/test-data/products-clothing.csv", "products-clothing.csv"),
        fetchAsFile("/test-data/sales-clothing.csv", "sales-clothing.csv"),
      ]);
      const detail: DemoLoadEventDetail = { productsFile, salesFile };
      window.dispatchEvent(new CustomEvent(DEMO_LOAD_EVENT, { detail }));
      setLoaded(true);
      // Scroll the upload card into view so the user (or judge) can see the
      // pre-filled file pickers + the now-active Import button.
      window.setTimeout(() => {
        document
          .getElementById("onboarding-csv-upload")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load demo data");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl mb-5 p-4 sm:p-5 bg-gradient-to-br from-fuchsia-600 via-violet-600 to-indigo-600 text-white shadow-lg">
      <div
        className="pointer-events-none absolute inset-0 opacity-30 mix-blend-overlay"
        style={{
          backgroundImage:
            "radial-gradient(circle at 15% 20%, rgba(255,255,255,0.45) 0%, transparent 35%), radial-gradient(circle at 85% 80%, rgba(255,255,255,0.25) 0%, transparent 35%)",
        }}
        aria-hidden="true"
      />
      <div className="relative flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-white/15 backdrop-blur grid place-items-center ring-1 ring-white/30">
          <Beaker className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-semibold bg-white/15 backdrop-blur rounded-full px-2.5 py-0.5 mb-1">
            <Sparkles className="w-3 h-3" />
            {t("ob.demo.eyebrow", locale)}
          </div>
          <div className="text-sm sm:text-base leading-snug">
            {t("ob.demo.body", locale)}{" "}
            <button
              type="button"
              onClick={onClick}
              disabled={loading || loaded}
              className="inline-flex items-center gap-1 underline decoration-2 underline-offset-2 font-semibold hover:no-underline disabled:opacity-70"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t("ob.demo.loading", locale)}
                </>
              ) : loaded ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  {t("ob.demo.loaded", locale)}
                </>
              ) : (
                t("ob.demo.cta", locale)
              )}
            </button>
          </div>
          {error && (
            <div className="mt-2 text-xs bg-rose-100 text-rose-900 rounded-md px-2 py-1 inline-block">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
