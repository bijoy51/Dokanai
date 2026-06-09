"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileText, Loader2, Package, Receipt, Sparkles, Trash2, Upload } from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";

/**
 * PDF path of Khata-to-Cloud onboarding — dual upload variant.
 *
 * Two dropzones: products PDF + sales PDF. Either or both can be empty.
 * On submit we POST both to /api/import/extract; the server hands both
 * texts to GPT-4o-mini in a single call so the model can de-duplicate
 * product names across the two sources. The model is instructed to treat
 * the "products vs sales" labels as a HINT only — if the user has a
 * messy ledger where one PDF mixes both, classification still works.
 */

// Vercel serverless body limit is 4.5 MB combined across all files.
const MAX_TOTAL_BYTES = 4_000_000;
const DATASET_KEY = "dokanai:imported-dataset:v1";

type Slot = "products" | "sales";

interface ExtractResult {
  products: Array<Record<string, unknown>>;
  sales: Array<Record<string, unknown>>;
  notes: string;
}

export function PdfUploader({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [productsFile, setProductsFile] = useState<File | null>(null);
  const [salesFile, setSalesFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractResult | null>(null);
  const [done, setDone] = useState<{ products: number; customers: number; orders: number } | null>(null);
  const [error, setError] = useState("");

  const pickFile = (slot: Slot, f: File) => {
    setError("");
    setExtracted(null);
    if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) {
      setError(t("ob.pdf.errType", locale));
      return;
    }
    const otherSize = slot === "products" ? salesFile?.size ?? 0 : productsFile?.size ?? 0;
    if (f.size + otherSize > MAX_TOTAL_BYTES) {
      setError(t("ob.pdf.errSize", locale).replace("{mb}", (MAX_TOTAL_BYTES / 1_000_000).toFixed(1)));
      return;
    }
    if (slot === "products") setProductsFile(f);
    else setSalesFile(f);
  };

  const analyze = async () => {
    setError("");
    setExtracted(null);
    if (!productsFile && !salesFile) {
      setError(t("ob.pdf.errAtLeastOne", locale));
      return;
    }
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append("mode", "pdf");
      if (productsFile) fd.append("productsFile", productsFile, productsFile.name);
      if (salesFile) fd.append("salesFile", salesFile, salesFile.name);
      const res = await fetch("/api/import/extract", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("ob.pdf.errAnalyze", locale));
        return;
      }
      setExtracted(data);
      if (!data.products?.length && !data.sales?.length) {
        setError(t("ob.pdf.errEmptyExtraction", locale));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("ob.pdf.errAnalyze", locale));
    } finally {
      setAnalyzing(false);
    }
  };

  const importIt = async () => {
    if (!extracted) return;
    setError("");
    setImporting(true);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: extracted.products, sales: extracted.sales, source: "pdf" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("ob.pdf.errImport", locale));
        return;
      }
      try {
        localStorage.setItem(
          DATASET_KEY,
          JSON.stringify({ email: "", products: extracted.products, sales: extracted.sales }),
        );
        sessionStorage.removeItem("dokanai:rehydrate-attempts");
      } catch {
        /* non-fatal */
      }
      setDone(data.counts);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("ob.pdf.errImport", locale));
    } finally {
      setImporting(false);
    }
  };

  if (done) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex items-start gap-2 text-emerald-800">
          <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-medium">{t("ob.pdf.imported", locale)}</div>
            <div className="text-sm text-emerald-700 mt-1">
              <strong>{done.products}</strong> {t("ob.photos.products", locale)} ·{" "}
              <strong>{done.customers}</strong> {t("ob.photos.customers", locale)} ·{" "}
              <strong>{done.orders}</strong> {t("ob.photos.orders", locale)}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs text-slate-500 mb-4">{t("ob.pdf.splitNote", locale)}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <DropSlot
          locale={locale}
          slot="products"
          file={productsFile}
          onPick={(f) => pickFile("products", f)}
          onClear={() => {
            setProductsFile(null);
            setExtracted(null);
          }}
        />
        <DropSlot
          locale={locale}
          slot="sales"
          file={salesFile}
          onPick={(f) => pickFile("sales", f)}
          onClear={() => {
            setSalesFile(null);
            setExtracted(null);
          }}
        />
      </div>

      <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
        {!extracted && (
          <button
            type="button"
            onClick={analyze}
            disabled={(!productsFile && !salesFile) || analyzing}
            className="inline-flex items-center justify-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-50"
          >
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {analyzing ? t("ob.pdf.analyzing", locale) : t("ob.pdf.analyze", locale)}
          </button>
        )}
        {extracted && (
          <button
            type="button"
            onClick={importIt}
            disabled={importing || (extracted.products.length === 0 && extracted.sales.length === 0)}
            className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-50"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {importing ? t("ob.photos.importing", locale) : t("ob.photos.import", locale)}
          </button>
        )}
        {extracted && !importing && (
          <button
            type="button"
            onClick={() => setExtracted(null)}
            className="text-sm text-slate-600 hover:text-slate-900 px-2 py-2"
          >
            {t("ob.photos.reset", locale)}
          </button>
        )}
      </div>

      {extracted && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="font-medium text-slate-800">
            {t("ob.photos.extracted", locale)}: <strong>{extracted.products.length}</strong>{" "}
            {t("ob.photos.products", locale)}, <strong>{extracted.sales.length}</strong>{" "}
            {t("ob.photos.sales", locale)}
          </div>
          {extracted.products[0] && (
            <div className="text-xs text-slate-500 mt-2">
              <strong>{t("ob.photos.samplePreview", locale)}</strong>{" "}
              <code className="font-mono text-[11px]">{JSON.stringify(extracted.products[0])}</code>
            </div>
          )}
          {extracted.sales[0] && (
            <div className="text-xs text-slate-500 mt-1">
              <code className="font-mono text-[11px]">{JSON.stringify(extracted.sales[0])}</code>
            </div>
          )}
          {extracted.notes && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mt-2">
              {extracted.notes}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
    </section>
  );
}

function DropSlot({
  locale,
  slot,
  file,
  onPick,
  onClear,
}: {
  locale: Locale;
  slot: Slot;
  file: File | null;
  onPick: (f: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const SlotIcon = slot === "products" ? Package : Receipt;
  const eyebrow = slot === "products" ? t("ob.pdf.productsTitle", locale) : t("ob.pdf.salesTitle", locale);
  const hint = slot === "products" ? t("ob.pdf.productsHint", locale) : t("ob.pdf.salesHint", locale);
  const dropTitle =
    slot === "products" ? t("ob.pdf.productsDropTitle", locale) : t("ob.pdf.salesDropTitle", locale);

  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">
        <SlotIcon className="w-3.5 h-3.5 text-brand-600" />
        {eyebrow}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
      />
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files?.[0]) onPick(e.dataTransfer.files[0]);
        }}
        className="cursor-pointer border-2 border-dashed border-slate-300 hover:border-brand-500 hover:bg-brand-50/40 rounded-lg p-5 text-center transition-colors min-h-[140px] flex flex-col items-center justify-center"
      >
        <FileText className="w-7 h-7 text-slate-400 mb-2" />
        <div className="text-sm font-medium text-slate-700">{dropTitle}</div>
        <div className="text-[11px] text-slate-500 mt-1 leading-snug px-2">{hint}</div>
      </div>
      {file && (
        <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="text-sm text-slate-700 truncate">{file.name}</div>
            <div className="text-xs text-slate-500 shrink-0">({(file.size / 1_000_000).toFixed(2)} MB)</div>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="text-slate-500 hover:text-rose-700 p-1"
            aria-label="Remove"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
