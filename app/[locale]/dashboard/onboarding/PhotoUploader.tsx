"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, ImagePlus, Loader2, Sparkles, Trash2, Upload } from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";

/**
 * Photos path of Khata-to-Cloud onboarding.
 *
 * Flow:
 *   1. User drops in 1-8 images (jpeg / png / webp / gif) of their
 *      handwritten ledger, receipts, m-banking screenshots, etc.
 *   2. They click "Analyze with AI" — we POST multipart to
 *      /api/import/extract?mode=photos. Server hands the images to
 *      GPT-4o-mini vision and gets back {products, sales, notes}.
 *   3. We show a tiny preview (counts + first row of each) so the user
 *      can sanity-check before replacing their shop data.
 *   4. They click "Import" — we POST the canonical {products, sales}
 *      shape to /api/import (the same endpoint the CSV path uses),
 *      mirror to localStorage, and router.refresh().
 *
 * Hard cap: 8 photos, 4 MB combined (Vercel body limit headroom).
 */

const MAX_PHOTOS = 8;
const MAX_BYTES = 4_000_000;
const ALLOWED = /^image\/(jpeg|png|webp|gif)$/i;
const DATASET_KEY = "dokanai:imported-dataset:v1";

interface ExtractResult {
  products: Array<Record<string, unknown>>;
  sales: Array<Record<string, unknown>>;
  notes: string;
}

interface FilePreview {
  file: File;
  url: string;
}

export function PhotoUploader({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [files, setFiles] = useState<FilePreview[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractResult | null>(null);
  const [done, setDone] = useState<{ products: number; customers: number; orders: number } | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Revoke object URLs on unmount / file change to avoid leaks.
  useEffect(() => () => {
    files.forEach((f) => URL.revokeObjectURL(f.url));
  }, [files]);

  const addFiles = (newOnes: FileList | File[]) => {
    setError("");
    const arr = Array.from(newOnes).filter((f) => ALLOWED.test(f.type));
    if (arr.length === 0) {
      setError(t("ob.photos.errType", locale));
      return;
    }
    setFiles((prev) => {
      const combined = [...prev, ...arr.map((f) => ({ file: f, url: URL.createObjectURL(f) }))];
      if (combined.length > MAX_PHOTOS) {
        setError(t("ob.photos.errCount", locale).replace("{max}", String(MAX_PHOTOS)));
        return combined.slice(0, MAX_PHOTOS);
      }
      const total = combined.reduce((s, f) => s + f.file.size, 0);
      if (total > MAX_BYTES) {
        setError(t("ob.photos.errSize", locale).replace("{mb}", (MAX_BYTES / 1_000_000).toFixed(1)));
      }
      return combined;
    });
  };

  const removeAt = (idx: number) => {
    setFiles((prev) => {
      URL.revokeObjectURL(prev[idx].url);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const analyze = async () => {
    setError("");
    setExtracted(null);
    if (files.length === 0) {
      setError(t("ob.photos.errEmpty", locale));
      return;
    }
    const total = files.reduce((s, f) => s + f.file.size, 0);
    if (total > MAX_BYTES) {
      setError(t("ob.photos.errSize", locale).replace("{mb}", (MAX_BYTES / 1_000_000).toFixed(1)));
      return;
    }
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append("mode", "photos");
      for (const f of files) fd.append("files", f.file, f.file.name);
      const res = await fetch("/api/import/extract", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("ob.photos.errAnalyze", locale));
        return;
      }
      setExtracted(data);
      if (!data.products?.length && !data.sales?.length) {
        setError(t("ob.photos.errEmptyExtraction", locale));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("ob.photos.errAnalyze", locale));
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
        body: JSON.stringify({ products: extracted.products, sales: extracted.sales }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("ob.photos.errImport", locale));
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
      setError(e instanceof Error ? e.message : t("ob.photos.errImport", locale));
    } finally {
      setImporting(false);
    }
  };

  // ---------- success card after import ----------
  if (done) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex items-start gap-2 text-emerald-800">
          <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-medium">{t("ob.photos.imported", locale)}</div>
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

  // ---------- drop zone / file list / extracted preview ----------
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        hidden
        onChange={(e) => e.target.files && addFiles(e.target.files)}
      />

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
        }}
        className="cursor-pointer border-2 border-dashed border-slate-300 hover:border-brand-500 hover:bg-brand-50/40 rounded-lg p-6 text-center transition-colors"
      >
        <ImagePlus className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        <div className="text-sm font-medium text-slate-700">{t("ob.photos.dropTitle", locale)}</div>
        <div className="text-xs text-slate-500 mt-1">{t("ob.photos.dropHint", locale).replace("{max}", String(MAX_PHOTOS))}</div>
      </div>

      {/* Thumbnails */}
      {files.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          {files.map((f, i) => (
            <div key={i} className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.file.name} className="w-full h-24 object-cover rounded-md border border-slate-200" />
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute top-1 right-1 w-6 h-6 grid place-items-center rounded-md bg-white/80 hover:bg-white text-slate-700 hover:text-rose-700 opacity-0 group-hover:opacity-100"
                aria-label="Remove"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <div className="text-[10px] text-slate-500 truncate mt-1">{f.file.name}</div>
            </div>
          ))}
        </div>
      )}

      {/* Action row */}
      <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
        {!extracted && (
          <button
            type="button"
            onClick={analyze}
            disabled={files.length === 0 || analyzing}
            className="inline-flex items-center justify-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-50"
          >
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {analyzing ? t("ob.photos.analyzing", locale) : t("ob.photos.analyze", locale)}
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

      {/* Extraction preview */}
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

      {/* Error banner */}
      {error && (
        <div className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
    </section>
  );
}
