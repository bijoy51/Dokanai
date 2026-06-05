"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileText, Loader2, Sparkles, Trash2, Upload } from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";

/**
 * PDF path of Khata-to-Cloud onboarding.
 *
 * v1 reads SELECTABLE TEXT from the PDF (Excel export, digital invoice,
 * bKash statement, etc.) — pdf-parse on the server pulls text out and
 * GPT-4o-mini structures it into products + sales. For scanned PDFs
 * with no selectable text, we surface a clear error and direct the user
 * to the Photos tab instead.
 */

// Vercel serverless body limit is 4.5 MB — we leave headroom for the
// multipart envelope. Compressing a PDF client-side would mean
// rasterising every page (heavy). For now the limit stays here; the
// error message tells the user how to split a bigger PDF or rasterise
// pages to the Photos tab.
const MAX_BYTES = 4_000_000;
const DATASET_KEY = "dokanai:imported-dataset:v1";

interface ExtractResult {
  products: Array<Record<string, unknown>>;
  sales: Array<Record<string, unknown>>;
  notes: string;
}

export function PdfUploader({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractResult | null>(null);
  const [done, setDone] = useState<{ products: number; customers: number; orders: number } | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = (f: File) => {
    setError("");
    setExtracted(null);
    if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) {
      setError(t("ob.pdf.errType", locale));
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(t("ob.pdf.errSize", locale).replace("{mb}", (MAX_BYTES / 1_000_000).toFixed(1)));
      return;
    }
    setFile(f);
  };

  const analyze = async () => {
    setError("");
    setExtracted(null);
    if (!file) {
      setError(t("ob.pdf.errEmpty", locale));
      return;
    }
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append("mode", "pdf");
      fd.append("file", file, file.name);
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
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])}
      />

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files?.[0]) pickFile(e.dataTransfer.files[0]);
        }}
        className="cursor-pointer border-2 border-dashed border-slate-300 hover:border-brand-500 hover:bg-brand-50/40 rounded-lg p-6 text-center transition-colors"
      >
        <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        <div className="text-sm font-medium text-slate-700">{t("ob.pdf.dropTitle", locale)}</div>
        <div className="text-xs text-slate-500 mt-1">{t("ob.pdf.dropHint", locale)}</div>
      </div>

      {file && (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="text-sm text-slate-700 truncate">{file.name}</div>
            <div className="text-xs text-slate-500 shrink-0">({(file.size / 1_000_000).toFixed(2)} MB)</div>
          </div>
          <button
            type="button"
            onClick={() => {
              setFile(null);
              setExtracted(null);
            }}
            className="text-slate-500 hover:text-rose-700 p-1"
            aria-label="Remove"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
        {!extracted && (
          <button
            type="button"
            onClick={analyze}
            disabled={!file || analyzing}
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
