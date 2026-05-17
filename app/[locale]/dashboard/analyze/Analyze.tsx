"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  Check,
  FileSpreadsheet,
  Image as ImageIcon,
  PackageSearch,
  Sparkles,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";
import { formatBDT, formatPercent } from "@/lib/utils";
import type {
  AnalyzeShopResponse,
  CatalogItem,
  PopularStyle,
  TrendItem,
} from "@/lib/ai/shop-analysis";

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 1_000_000;

// The last analysis is cached here so a page reload keeps the results
// instead of resetting to the empty upload form. Cleared on logout.
const STORAGE_KEY = "dokanai:analyze:v1";

interface ParsedListing {
  title: string;
  description?: string;
  price?: number;
  stock?: number;
  category?: string;
}

interface ParsedSale {
  date: string;
  product: string;
  qty: number;
  unit_price?: number;
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
      if (c === '"') {
        inQ = !inQ;
      } else if (c === "," && !inQ) {
        cols.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
    cols.push(cur);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] ?? "").trim().replace(/^"|"$/g, "");
    });
    return row;
  });
}

async function readFile(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsText(f);
  });
}

async function fileToDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

function num(v: string | undefined): number | undefined {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export default function Analyze({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;

  const [shopName, setShopName] = useState("");
  const [region, setRegion] = useState("Dhaka");
  const [listingsFile, setListingsFile] = useState<File | null>(null);
  const [salesFile, setSalesFile] = useState<File | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoErr, setPhotoErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalyzeShopResponse | null>(null);

  const listingsInput = useRef<HTMLInputElement>(null);
  const salesInput = useRef<HTMLInputElement>(null);
  const photosInput = useRef<HTMLInputElement>(null);

  // Restore the previous analysis (and shop fields) on mount so reloading
  // the page does not throw away the results the user just generated.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        result?: AnalyzeShopResponse;
        shopName?: string;
        region?: string;
      };
      if (saved.result) setResult(saved.result);
      if (typeof saved.shopName === "string") setShopName(saved.shopName);
      if (typeof saved.region === "string" && saved.region) setRegion(saved.region);
    } catch {
      /* ignore corrupt / unavailable storage */
    }
  }, []);

  const onPickPhotos = (files: FileList | null) => {
    setPhotoErr("");
    if (!files) return;
    const arr = Array.from(files);
    const oversized = arr.find((f) => f.size > MAX_PHOTO_BYTES);
    if (oversized) {
      setPhotoErr(t("analyze.photoTooBig", locale));
      return;
    }
    const next = [...photos, ...arr].slice(0, MAX_PHOTOS);
    setPhotos(next);
  };

  const runAnalysis = async (useAccountData: boolean) => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      let listings: ParsedListing[] = [];
      let sales: ParsedSale[] = [];
      if (!useAccountData && listingsFile) {
        const rows = parseCsv(await readFile(listingsFile));
        listings = rows
          .map((r) => ({
            title: r["title"] ?? r["name"] ?? "",
            description: r["description"] ?? r["desc"] ?? "",
            price: num(r["price"]),
            stock: num(r["stock"]),
            category: r["category"] ?? undefined,
          }))
          .filter((l) => l.title);
      }
      if (!useAccountData && salesFile) {
        const rows = parseCsv(await readFile(salesFile));
        sales = rows
          .map((r) => ({
            date: r["date"] ?? "",
            product: r["product"] ?? r["name"] ?? "",
            qty: num(r["qty"]) ?? 1,
            unit_price: num(r["unit_price"]) ?? num(r["price"]),
          }))
          .filter((s) => s.date && s.product);
      }
      const images = await Promise.all(photos.map(fileToDataUrl));

      const res = await fetch("/api/analyze-shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop: { name: shopName || undefined, region: region || undefined },
          listings,
          sales,
          images,
          useAccountData,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("analyze.error", locale));
        return;
      }
      setResult(data as AnalyzeShopResponse);
      // Persist so a reload keeps the results.
      try {
        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ result: data, shopName, region }),
        );
      } catch {
        /* storage full or disabled — non-fatal */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("analyze.error", locale));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("analyze.title", locale)}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("analyze.subtitle", locale)}</p>
      </header>

      <section className="grid lg:grid-cols-2 gap-6 mb-8">
        <UploadPanel
          locale={locale}
          shopName={shopName}
          setShopName={setShopName}
          region={region}
          setRegion={setRegion}
          listingsFile={listingsFile}
          setListingsFile={setListingsFile}
          salesFile={salesFile}
          setSalesFile={setSalesFile}
          photos={photos}
          setPhotos={setPhotos}
          onPickPhotos={onPickPhotos}
          photoErr={photoErr}
          listingsInput={listingsInput}
          salesInput={salesInput}
          photosInput={photosInput}
          loading={loading}
          onAnalyze={() => runAnalysis(false)}
          canAnalyze={!!listingsFile || photos.length > 0}
        />

        <AccountAnalyzePanel
          locale={locale}
          loading={loading}
          onAnalyze={() => runAnalysis(true)}
        />
      </section>

      {error && (
        <div className="rounded-md bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 text-sm flex items-center gap-2 mb-6">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {result && <Results locale={locale} result={result} />}
    </div>
  );
}

// ---------- upload panel ----------

function UploadPanel(props: {
  locale: Locale;
  shopName: string;
  setShopName: (v: string) => void;
  region: string;
  setRegion: (v: string) => void;
  listingsFile: File | null;
  setListingsFile: (f: File | null) => void;
  salesFile: File | null;
  setSalesFile: (f: File | null) => void;
  photos: File[];
  setPhotos: (f: File[]) => void;
  onPickPhotos: (fl: FileList | null) => void;
  photoErr: string;
  listingsInput: React.RefObject<HTMLInputElement>;
  salesInput: React.RefObject<HTMLInputElement>;
  photosInput: React.RefObject<HTMLInputElement>;
  loading: boolean;
  onAnalyze: () => void;
  canAnalyze: boolean;
}) {
  const { locale } = props;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="text-sm font-medium mb-3 flex items-center gap-2">
        <Upload className="w-4 h-4 text-brand-600" />
        {t("analyze.uploadTitle", locale)}
      </div>
      <p className="text-xs text-slate-500 mb-4">{t("analyze.uploadHint", locale)}</p>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs text-slate-500">{t("analyze.shopName", locale)}</label>
          <input
            value={props.shopName}
            onChange={(e) => props.setShopName(e.target.value)}
            placeholder="Rashida's Boutique"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500">{t("analyze.region", locale)}</label>
          <input
            value={props.region}
            onChange={(e) => props.setRegion(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      <FilePicker
        label={t("analyze.listingsCsv", locale)}
        hint={t("analyze.listingsCsvHint", locale)}
        file={props.listingsFile}
        inputRef={props.listingsInput}
        onPick={(f) => props.setListingsFile(f)}
        accept=".csv"
        icon={FileSpreadsheet}
      />
      <div className="h-3" />
      <FilePicker
        label={t("analyze.salesCsv", locale)}
        hint={t("analyze.salesCsvHint", locale)}
        file={props.salesFile}
        inputRef={props.salesInput}
        onPick={(f) => props.setSalesFile(f)}
        accept=".csv"
        icon={FileSpreadsheet}
      />

      <div className="mt-4">
        <div className="text-xs text-slate-500 mb-1">{t("analyze.photos", locale)}</div>
        <div className="flex flex-wrap items-center gap-2">
          {props.photos.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-[11px] bg-slate-100 border border-slate-200 rounded-full px-2 py-1"
            >
              <ImageIcon className="w-3 h-3" /> {f.name.slice(0, 18)}
              <button
                onClick={() => props.setPhotos(props.photos.filter((_, j) => j !== i))}
                className="text-slate-500 hover:text-rose-600"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {props.photos.length < MAX_PHOTOS && (
            <button
              onClick={() => props.photosInput.current?.click()}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              <Upload className="w-3 h-3" /> {t("analyze.addPhoto", locale)}
            </button>
          )}
          <input
            ref={props.photosInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => props.onPickPhotos(e.target.files)}
          />
        </div>
        {props.photoErr && (
          <div className="mt-2 text-xs text-rose-600">{props.photoErr}</div>
        )}
        <div className="mt-1 text-[11px] text-slate-400">{t("analyze.photoHint", locale)}</div>
      </div>

      <button
        onClick={props.onAnalyze}
        disabled={!props.canAnalyze || props.loading}
        className="mt-5 w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
      >
        <BarChart3 className="w-4 h-4" />
        {props.loading ? t("common.loading", locale) : t("analyze.analyzeUploaded", locale)}
      </button>
    </div>
  );
}

function FilePicker(props: {
  label: string;
  hint?: string;
  file: File | null;
  inputRef: React.RefObject<HTMLInputElement>;
  onPick: (f: File | null) => void;
  accept: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const Icon = props.icon;
  return (
    <div>
      <div className="text-xs text-slate-500">{props.label}</div>
      <div
        className="mt-1 rounded-md border border-dashed border-slate-300 px-3 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-50"
        onClick={() => props.inputRef.current?.click()}
      >
        <Icon className="w-4 h-4 text-slate-500" />
        <div className="flex-1 text-sm text-slate-600 truncate">
          {props.file ? props.file.name : props.hint ?? "Click to upload"}
        </div>
        {props.file && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              props.onPick(null);
              if (props.inputRef.current) props.inputRef.current.value = "";
            }}
            className="text-slate-500 hover:text-rose-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <input
        ref={props.inputRef}
        type="file"
        accept={props.accept}
        className="hidden"
        onChange={(e) => props.onPick(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

function AccountAnalyzePanel({
  locale,
  loading,
  onAnalyze,
}: {
  locale: Locale;
  loading: boolean;
  onAnalyze: () => void;
}) {
  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50 p-5">
      <div className="text-sm font-medium mb-2 flex items-center gap-2 text-brand-900">
        <Sparkles className="w-4 h-4" />
        {t("analyze.demoTitle", locale)}
      </div>
      <p className="text-xs text-brand-900/80 mb-4">{t("analyze.demoHint", locale)}</p>
      <button
        onClick={onAnalyze}
        disabled={loading}
        className="w-full inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
      >
        <BarChart3 className="w-4 h-4" />
        {loading ? t("common.loading", locale) : t("analyze.analyzeAccount", locale)}
      </button>
      <ul className="mt-4 text-[12px] text-brand-900/80 space-y-1">
        <li>· {t("analyze.bullet1", locale)}</li>
        <li>· {t("analyze.bullet2", locale)}</li>
        <li>· {t("analyze.bullet3", locale)}</li>
      </ul>
    </div>
  );
}

// ---------- results ----------

function Results({ locale, result }: { locale: Locale; result: AnalyzeShopResponse }) {
  const isMl = result.source === "ml-backend";
  return (
    <div className="space-y-6">
      <div
        className={`rounded-xl border p-4 flex flex-wrap items-center gap-3 ${
          isMl ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"
        }`}
      >
        <Check className={`w-5 h-5 ${isMl ? "text-emerald-600" : "text-amber-600"}`} />
        <div className="flex-1 min-w-[200px]">
          <div className={`text-sm font-medium ${isMl ? "text-emerald-900" : "text-amber-900"}`}>
            {isMl ? t("analyze.sourceMl", locale) : t("analyze.sourceFallback", locale)}
          </div>
          <div className={`text-xs ${isMl ? "text-emerald-700" : "text-amber-700"}`}>
            {t("analyze.shopTypeLabel", locale)}:{" "}
            <span className="font-semibold capitalize">{result.shop_type.label}</span>{" "}
            ({formatPercent(result.shop_type.confidence * 100, 0)},{" "}
            <span className="italic">{result.shop_type.method}</span>)
          </div>
        </div>
        <div className="flex gap-2 text-[11px]">
          <Chip label={`${result.catalog.length} ${t("analyze.items", locale)}`} />
          <Chip label={`${result.missing_goods.length} ${t("analyze.gapsLabel", locale)}`} />
          <Chip label={`${result.popular_styles.length} ${t("analyze.stylesLabel", locale)}`} />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Section title={t("analyze.sellingWell", locale)} icon={TrendingUp}>
          {result.selling_well.length ? (
            <SellingTable rows={result.selling_well} locale={locale} />
          ) : (
            <Empty msg={t("analyze.noSellingData", locale)} />
          )}
        </Section>
        <Section title={t("analyze.sellingPoorly", locale)} icon={ArrowDown}>
          {result.selling_poorly.length ? (
            <PoorTable rows={result.selling_poorly} locale={locale} />
          ) : (
            <Empty msg={t("analyze.noSellingData", locale)} />
          )}
        </Section>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Section title={t("analyze.restockSoon", locale)} icon={PackageSearch}>
          {result.restock_soon.length ? (
            <RestockTable rows={result.restock_soon} locale={locale} />
          ) : (
            <Empty msg={t("analyze.noRestock", locale)} />
          )}
        </Section>
        <Section title={t("analyze.trending", locale)} icon={ArrowUp}>
          <TrendingPanel up={result.trending.up} down={result.trending.down} locale={locale} />
        </Section>
      </div>

      <Section title={t("analyze.missingGoods", locale)} icon={Sparkles}>
        {result.missing_goods.length ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {result.missing_goods.map((m, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="text-sm font-medium">{m.product_type}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{m.reason}</div>
                <div className="mt-2 inline-flex items-center text-[11px] px-2 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-200">
                  {formatPercent(m.carried_by_similar_pct * 100, 0)} of similar shops
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty msg={t("analyze.noMissing", locale)} />
        )}
      </Section>

      <Section title={t("analyze.festivalOutlook", locale)} icon={CalendarDays}>
        {result.festival_outlook.length ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {result.festival_outlook.map((f, i) => (
              <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="font-medium text-amber-900">{f.festival}</div>
                <div className="text-xs text-amber-700 mt-0.5">{f.date}</div>
                <div className="mt-2 text-sm text-amber-900">{f.advice}</div>
                <div className="mt-2 inline-flex items-center text-[11px] px-2 py-0.5 rounded bg-amber-200 text-amber-900">
                  ×{f.expected_uplift.toFixed(1)} {t("analyze.uplift", locale)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty msg={t("analyze.noFestivals", locale)} />
        )}
      </Section>

      {result.popular_styles.length > 0 && (
        <Section title={t("analyze.popularStyles", locale)} icon={Sparkles}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {result.popular_styles.map((s, i) => (
              <StyleCard key={i} style={s} />
            ))}
          </div>
        </Section>
      )}

      {result.uploaded_image_analysis.length > 0 && (
        <Section title={t("analyze.photoAnalysis", locale)} icon={ImageIcon}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {result.uploaded_image_analysis.map((u) => (
              <div key={u.image_index} className="rounded-lg border border-slate-200 p-3">
                <div className="text-[11px] uppercase text-slate-500">
                  {t("analyze.photo", locale)} #{u.image_index + 1}
                </div>
                <div className="font-medium mt-1">{u.predicted_style}</div>
                <div className="text-xs text-slate-500">
                  {formatPercent(u.confidence * 100, 0)} confidence
                  {u.trending ? ` · ${t("analyze.isTrending", locale)}` : ""}
                </div>
                <ul className="mt-2 text-[12px] text-slate-600 space-y-0.5">
                  {u.suggestions.map((s, i) => (
                    <li key={i}>· {s}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      )}

      {result.catalog.length > 0 && <CatalogPreview catalog={result.catalog} locale={locale} />}

      {result.notes.length > 0 && (
        <div className="text-[11px] text-slate-500">
          {result.notes.map((n, i) => (
            <div key={i}>· {n}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- result sub-components ----------

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium flex items-center gap-2">
        <Icon className="w-4 h-4 text-brand-600" />
        {title}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="text-sm text-slate-500">{msg}</div>;
}

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700">
      {label}
    </span>
  );
}

function SellingTable({ rows, locale }: { rows: AnalyzeShopResponse["selling_well"]; locale: Locale }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
        <tr>
          <th className="text-left px-3 py-2">{t("analyze.product", locale)}</th>
          <th className="text-right px-3 py-2">{t("analyze.units30", locale)}</th>
          <th className="text-right px-3 py-2">{t("analyze.trend", locale)}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-slate-100">
            <td className="px-3 py-2 capitalize">{r.product_type}</td>
            <td className="px-3 py-2 text-right font-medium">{r.units_30d}</td>
            <td className="px-3 py-2 text-right">
              <TrendBadge dir={r.trend} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PoorTable({ rows, locale }: { rows: AnalyzeShopResponse["selling_poorly"]; locale: Locale }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
        <tr>
          <th className="text-left px-3 py-2">{t("analyze.product", locale)}</th>
          <th className="text-right px-3 py-2">{t("analyze.units30", locale)}</th>
          <th className="text-right px-3 py-2">{t("analyze.daysOfStock", locale)}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-slate-100">
            <td className="px-3 py-2 capitalize">{r.product_type}</td>
            <td className="px-3 py-2 text-right">{r.units_30d}</td>
            <td className="px-3 py-2 text-right text-rose-600 font-medium">
              {r.days_of_stock > 364 ? "365+" : r.days_of_stock.toFixed(0)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RestockTable({ rows, locale }: { rows: AnalyzeShopResponse["restock_soon"]; locale: Locale }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
        <tr>
          <th className="text-left px-3 py-2">{t("analyze.product", locale)}</th>
          <th className="text-right px-3 py-2">{t("analyze.daysLeft", locale)}</th>
          <th className="text-right px-3 py-2">{t("analyze.next7d", locale)}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-slate-100">
            <td className="px-3 py-2 capitalize">{r.product_type}</td>
            <td className="px-3 py-2 text-right text-amber-700 font-medium">{r.days_of_stock.toFixed(1)}</td>
            <td className="px-3 py-2 text-right">{r.forecast_7d}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TrendingPanel({ up, down, locale }: { up: TrendItem[]; down: TrendItem[]; locale: Locale }) {
  if (!up.length && !down.length) return <Empty msg={t("analyze.noTrends", locale)} />;
  return (
    <div className="space-y-3">
      {up.length > 0 && (
        <div>
          <div className="text-[11px] uppercase text-emerald-700 mb-1">↑ {t("analyze.up", locale)}</div>
          <ul className="space-y-1">
            {up.map((u, i) => (
              <li key={i} className="text-sm flex justify-between border-t border-slate-100 pt-1">
                <span className="capitalize">{u.product_type}</span>
                <span className="text-emerald-700 font-medium">+{(u.momentum * 100).toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {down.length > 0 && (
        <div>
          <div className="text-[11px] uppercase text-rose-700 mb-1">↓ {t("analyze.down", locale)}</div>
          <ul className="space-y-1">
            {down.map((d, i) => (
              <li key={i} className="text-sm flex justify-between border-t border-slate-100 pt-1">
                <span className="capitalize">{d.product_type}</span>
                <span className="text-rose-700 font-medium">{(d.momentum * 100).toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TrendBadge({ dir }: { dir: "up" | "down" | "flat" }) {
  const styles =
    dir === "up"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : dir === "down"
        ? "bg-rose-50 text-rose-700 border-rose-200"
        : "bg-slate-50 text-slate-600 border-slate-200";
  const arrow = dir === "up" ? "↑" : dir === "down" ? "↓" : "·";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] border ${styles}`}>
      {arrow} {dir}
    </span>
  );
}

function StyleCard({ style }: { style: PopularStyle }) {
  const hasImages = style.sample_images && style.sample_images.length > 0;
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="aspect-[4/3] bg-gradient-to-br from-brand-50 to-amber-50 grid place-items-center">
        {hasImages ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={style.sample_images[0]} alt={style.label} className="w-full h-full object-cover" />
        ) : (
          <div className="text-6xl">{style.emoji || "👗"}</div>
        )}
      </div>
      <div className="p-3">
        <div className="font-medium text-sm">{style.label}</div>
        <div className="text-[11px] text-slate-500 mt-0.5">{style.note}</div>
        <div className="mt-2 inline-flex items-center text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
          +{(style.momentum * 100).toFixed(0)}% momentum
        </div>
      </div>
    </div>
  );
}

function CatalogPreview({ catalog, locale }: { catalog: CatalogItem[]; locale: Locale }) {
  const [open, setOpen] = useState(false);
  const visible = useMemo(() => (open ? catalog : catalog.slice(0, 6)), [open, catalog]);
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium flex items-center justify-between">
        <span>
          {t("analyze.extractedCatalog", locale)} · {catalog.length}
        </span>
        <button onClick={() => setOpen(!open)} className="text-xs text-brand-700 hover:underline">
          {open ? t("analyze.showLess", locale) : t("analyze.showAll", locale)}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Title</th>
              <th className="text-left px-4 py-2">Type</th>
              <th className="text-left px-4 py-2">Color</th>
              <th className="text-left px-4 py-2">Material</th>
              <th className="text-left px-4 py-2">Gender</th>
              <th className="text-left px-4 py-2">Occasion</th>
              <th className="text-left px-4 py-2">Price band</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="px-4 py-2">{c.title}</td>
                <td className="px-4 py-2 text-slate-600 capitalize">{c.product_type ?? "·"}</td>
                <td className="px-4 py-2 text-slate-600 capitalize">{c.color ?? "·"}</td>
                <td className="px-4 py-2 text-slate-600 capitalize">{c.material ?? "·"}</td>
                <td className="px-4 py-2 text-slate-600 capitalize">{c.gender ?? "·"}</td>
                <td className="px-4 py-2 text-slate-600 capitalize">{c.occasion ?? "·"}</td>
                <td className="px-4 py-2 text-slate-600">{c.price_band ?? "·"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Surface formatBDT to silence the unused-import warning if needed in future expansions.
export const _formatBDT = formatBDT;
