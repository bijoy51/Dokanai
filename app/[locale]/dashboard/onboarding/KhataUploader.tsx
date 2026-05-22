"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Check,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  UploadCloud,
  X,
} from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";

// localStorage mirror so the data survives a serverless cold start.
// DataSync (in the dashboard layout) re-POSTs this if the server lost it.
const DATASET_KEY = "dokanai:dataset:v1";

interface ImportStatus {
  email: string;
  hasData: boolean;
  isDemo: boolean;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, "").trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') inQ = !inQ;
      else if (c === "," && !inQ) {
        cols.push(cur);
        cur = "";
      } else cur += c;
    }
    cols.push(cur);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] ?? "").trim().replace(/^"|"$/g, "");
    });
    return row;
  });
}

function readFile(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsText(f);
  });
}

function n(v: string | undefined): number | undefined {
  if (v === undefined || v === "") return undefined;
  const x = Number(v);
  return Number.isFinite(x) ? x : undefined;
}

/** First non-empty value among the given column aliases. */
function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v.trim() !== "") return v.trim();
  }
  return "";
}

// Common header aliases so real-world exports (e.g. the synthetic
// shop_sales.csv that uses `product_type`) import without manual renaming.
const PRODUCT_NAME_KEYS = ["name", "product", "product_type", "product_name", "item", "item_name", "title", "productname"];
const DATE_KEYS = ["date", "order_date", "sale_date", "datetime", "time"];
const QTY_KEYS = ["qty", "quantity", "units", "count"];
const UNIT_PRICE_KEYS = ["unit_price", "unitprice", "price", "rate", "amount"];

export function KhataUploader({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [status, setStatus] = useState<ImportStatus | null>(null);
  const [productsFile, setProductsFile] = useState<File | null>(null);
  const [salesFile, setSalesFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ products: number; customers: number; orders: number } | null>(null);

  const productsInput = useRef<HTMLInputElement>(null);
  const salesInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/import")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && setStatus(s))
      .catch(() => {});
  }, []);

  const runImport = async () => {
    setError("");
    setDone(null);
    if (!productsFile && !salesFile) {
      setError(t("ob.errNoFile", locale));
      return;
    }
    setLoading(true);
    try {
      const products = productsFile
        ? parseCsv(await readFile(productsFile))
            .map((r) => ({
              name: pick(r, ...PRODUCT_NAME_KEYS),
              category: pick(r, "category", "type") || undefined,
              price: n(pick(r, "price", "unit_price", "rate")),
              cost: n(pick(r, "cost", "buy_price")),
              stock: n(pick(r, "stock", "quantity", "qty")),
            }))
            .filter((p) => p.name)
        : [];
      const sales = salesFile
        ? parseCsv(await readFile(salesFile))
            .map((r) => ({
              date: pick(r, ...DATE_KEYS),
              product: pick(r, ...PRODUCT_NAME_KEYS),
              qty: n(pick(r, ...QTY_KEYS)),
              unit_price: n(pick(r, ...UNIT_PRICE_KEYS)),
              customer: pick(r, "customer", "customer_name", "buyer") || undefined,
              payment: pick(r, "payment", "payment_method") || undefined,
              status: pick(r, "status", "delivery_status") || undefined,
              city: pick(r, "city", "district", "location") || undefined,
            }))
            .filter((s) => s.date && s.product)
        : [];

      // A file was chosen but no rows matched the expected columns — tell the
      // user up front instead of POSTing empty arrays and failing opaquely.
      if (products.length === 0 && sales.length === 0) {
        setError(t("ob.errGeneric", locale));
        return;
      }

      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products, sales }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("ob.errGeneric", locale));
        return;
      }
      // Mirror the raw rows to localStorage so the dashboard can rehydrate
      // the server after a cold start. Reset the rehydrate-attempt counter
      // so a fresh import gets a fresh set of retries.
      try {
        localStorage.setItem(
          DATASET_KEY,
          JSON.stringify({ email: status?.email ?? "", products, sales }),
        );
        sessionStorage.removeItem("dokanai:rehydrate-attempts");
      } catch {
        /* storage full/disabled — non-fatal */
      }
      setDone(data.counts);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("ob.errGeneric", locale));
    } finally {
      setLoading(false);
    }
  };

  const clearData = async () => {
    setLoading(true);
    setError("");
    try {
      await fetch("/api/import", { method: "DELETE" });
      try {
        localStorage.removeItem(DATASET_KEY);
      } catch {
        /* non-fatal */
      }
      setDone(null);
      setStatus((s) => (s ? { ...s, hasData: false } : s));
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  // Demo account: read-only sample data.
  if (status?.isDemo) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        {t("ob.demoNotice", locale)}
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
        <div className="flex items-center gap-2 text-emerald-800 font-medium">
          <Check className="w-5 h-5" />
          {t("ob.successTitle", locale)}
        </div>
        <p className="text-sm text-emerald-700 mt-1">
          {done.products} {t("ob.cProducts", locale)} · {done.orders} {t("ob.cOrders", locale)} ·{" "}
          {done.customers} {t("ob.cCustomers", locale)}
        </p>
        <div className="mt-4 flex gap-2">
          <Link
            href={`/${locale}/dashboard`}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            {t("ob.goDashboard", locale)} <ArrowRight className="w-4 h-4" />
          </Link>
          <button
            onClick={() => setDone(null)}
            className="inline-flex items-center gap-2 border border-slate-300 text-slate-700 px-4 py-2 rounded-md text-sm hover:bg-slate-50"
          >
            {t("ob.importMore", locale)}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {status?.hasData && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-slate-600">{t("ob.alreadyImported", locale)}</span>
          <button
            onClick={clearData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-700 disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t("ob.clearData", locale)}
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="text-sm font-medium flex items-center gap-2 mb-1">
          <UploadCloud className="w-4 h-4 text-brand-600" />
          {t("ob.uploadTitle", locale)}
        </div>
        <p className="text-xs text-slate-500 mb-4">{t("ob.uploadHint", locale)}</p>

        <CsvPicker
          label={t("ob.productsCsv", locale)}
          hint={t("ob.productsCsvHint", locale)}
          file={productsFile}
          inputRef={productsInput}
          onPick={setProductsFile}
        />
        <div className="h-3" />
        <CsvPicker
          label={t("ob.salesCsv", locale)}
          hint={t("ob.salesCsvHint", locale)}
          file={salesFile}
          inputRef={salesInput}
          onPick={setSalesFile}
        />

        {error && (
          <div className="mt-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={runImport}
          disabled={loading || (!productsFile && !salesFile)}
          className="mt-5 w-full inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 rounded-md text-sm font-medium disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
          {loading ? t("common.loading", locale) : t("ob.importBtn", locale)}
        </button>
      </div>

      <p className="text-xs text-slate-400">{t("ob.tip", locale)}</p>
    </div>
  );
}

function CsvPicker({
  label,
  hint,
  file,
  inputRef,
  onPick,
}: {
  label: string;
  hint: string;
  file: File | null;
  inputRef: React.RefObject<HTMLInputElement>;
  onPick: (f: File | null) => void;
}) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div
        className="mt-1 rounded-md border border-dashed border-slate-300 px-3 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-50"
        onClick={() => inputRef.current?.click()}
      >
        <FileSpreadsheet className="w-4 h-4 text-slate-500" />
        <div className="flex-1 text-sm text-slate-600 truncate">{file ? file.name : hint}</div>
        {file && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPick(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="text-slate-500 hover:text-rose-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
