"use client";

import { useMemo, useState } from "react";
import { Package, ShoppingCart, Search } from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";
import { formatBDT } from "@/lib/utils";
import { StatusPill } from "@/components/StatusPill";
import type { DeliveryStatus, ProductCategory } from "@/lib/types";

export interface ProductRow {
  id: string;
  name: string;
  nameBn: string;
  category: ProductCategory;
  price: number;
  cost: number;
  stock: number;
}

export interface SaleRow {
  orderId: string;
  date: string;
  customerName: string;
  productName: string;
  productNameBn: string;
  qty: number;
  unitPrice: number;
  total: number;
  status: DeliveryStatus;
  city: string;
  payment: "cod" | "bkash" | "nagad" | "card";
}

type Tab = "products" | "sales";

/**
 * Two-tab data viewer for the Uploads page. Tabs:
 *
 *   - Products — every product currently in the catalog.
 *   - Sales    — every sale row, sorted newest-first.
 *
 * Both tables include a free-text search across the visible columns so the
 * shopkeeper can quickly find a specific row. Capping happens server-side
 * (see Uploads.tsx); when the dataset is bigger than the cap, a note at
 * the bottom of the table makes that explicit.
 */
export function UploadedDataTabs({
  locale,
  products,
  sales,
  totalProducts,
  totalOrders,
}: {
  locale: Locale;
  products: ProductRow[];
  sales: SaleRow[];
  totalProducts: number;
  totalOrders: number;
}) {
  const [tab, setTab] = useState<Tab>("products");
  const [query, setQuery] = useState("");

  // Reset the query when the tab flips so a previous filter doesn't carry
  // over and surprise the user.
  const onTab = (next: Tab) => {
    if (next === tab) return;
    setTab(next);
    setQuery("");
  };

  const filteredProducts = useMemo(() => {
    if (!query.trim()) return products;
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.nameBn.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q),
    );
  }, [products, query]);

  const filteredSales = useMemo(() => {
    if (!query.trim()) return sales;
    const q = query.trim().toLowerCase();
    return sales.filter(
      (s) =>
        s.productName.toLowerCase().includes(q) ||
        s.productNameBn.toLowerCase().includes(q) ||
        s.customerName.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q) ||
        s.orderId.toLowerCase().includes(q) ||
        s.date.includes(q),
    );
  }, [sales, query]);

  return (
    <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 -mb-px overflow-x-auto">
          <TabButton
            active={tab === "products"}
            onClick={() => onTab("products")}
            Icon={Package}
            label={t("uploads.tab.products", locale)}
            count={totalProducts}
          />
          <TabButton
            active={tab === "sales"}
            onClick={() => onTab("sales")}
            Icon={ShoppingCart}
            label={t("uploads.tab.sales", locale)}
            count={totalOrders}
          />
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              tab === "products"
                ? t("uploads.searchProducts", locale)
                : t("uploads.searchSales", locale)
            }
            className="w-full pl-8 pr-3 py-1.5 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {tab === "products" ? (
        <ProductsTable rows={filteredProducts} totalCount={totalProducts} locale={locale} />
      ) : (
        <SalesTable rows={filteredSales} totalCount={totalOrders} locale={locale} />
      )}
    </section>
  );
}

// ---------- tabs ----------

function TabButton({
  active,
  onClick,
  Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  Icon: typeof Package;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors shrink-0 " +
        (active
          ? "border-brand-600 text-brand-700 font-medium"
          : "border-transparent text-slate-600 hover:text-slate-900")
      }
    >
      <Icon className="w-4 h-4" />
      {label}
      <span
        className={
          "ml-1 text-[11px] px-1.5 py-0.5 rounded-full " +
          (active ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-600")
        }
      >
        {count.toLocaleString()}
      </span>
    </button>
  );
}

// ---------- products table ----------

function categoryStyle(c: ProductCategory): string {
  const map: Record<ProductCategory, string> = {
    clothing: "bg-violet-50 text-violet-700 border-violet-200",
    electronics: "bg-blue-50 text-blue-700 border-blue-200",
    beauty: "bg-pink-50 text-pink-700 border-pink-200",
    food: "bg-emerald-50 text-emerald-700 border-emerald-200",
    home: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return map[c] ?? "bg-slate-50 text-slate-700 border-slate-200";
}

function stockPill(stock: number, locale: Locale) {
  if (stock <= 0) {
    return (
      <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
        {t("uploads.stockOut", locale)}
      </span>
    );
  }
  if (stock < 10) {
    return (
      <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
        {t("uploads.stockLow", locale)} ({stock})
      </span>
    );
  }
  return <span className="text-slate-700">{stock.toLocaleString()}</span>;
}

function ProductsTable({
  rows,
  totalCount,
  locale,
}: {
  rows: ProductRow[];
  totalCount: number;
  locale: Locale;
}) {
  if (rows.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-slate-500">
        {totalCount === 0 ? t("uploads.noProducts", locale) : t("uploads.noMatch", locale)}
      </div>
    );
  }
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">{t("uploads.colProduct", locale)}</th>
              <th className="text-left px-4 py-2">{t("uploads.colCategory", locale)}</th>
              <th className="text-right px-4 py-2">{t("uploads.colPrice", locale)}</th>
              <th className="text-right px-4 py-2 hidden md:table-cell">{t("uploads.colCost", locale)}</th>
              <th className="text-right px-4 py-2">{t("uploads.colStock", locale)}</th>
              <th className="text-left px-4 py-2 font-mono text-[10px] hidden lg:table-cell">ID</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <div className="font-medium">{locale === "bn" ? p.nameBn : p.name}</div>
                  {locale === "bn" && p.name !== p.nameBn && (
                    <div className="text-[11px] text-slate-500">{p.name}</div>
                  )}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={
                      "inline-flex items-center text-[11px] px-2 py-0.5 rounded border capitalize " +
                      categoryStyle(p.category)
                    }
                  >
                    {p.category}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-medium">{formatBDT(p.price)}</td>
                <td className="px-4 py-2 text-right text-slate-500 hidden md:table-cell">
                  {p.cost > 0 ? formatBDT(p.cost) : "·"}
                </td>
                <td className="px-4 py-2 text-right">{stockPill(p.stock, locale)}</td>
                <td className="px-4 py-2 font-mono text-[11px] text-slate-400 hidden lg:table-cell">{p.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalCount > rows.length && (
        <div className="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-100">
          {t("uploads.showing", locale)} {rows.length.toLocaleString()} {t("uploads.of", locale)}{" "}
          {totalCount.toLocaleString()}
        </div>
      )}
    </>
  );
}

// ---------- sales table ----------

function paymentStyle(p: SaleRow["payment"]): string {
  const map: Record<SaleRow["payment"], string> = {
    cod: "bg-slate-50 text-slate-700 border-slate-200",
    bkash: "bg-pink-50 text-pink-700 border-pink-200",
    nagad: "bg-orange-50 text-orange-700 border-orange-200",
    card: "bg-indigo-50 text-indigo-700 border-indigo-200",
  };
  return map[p];
}

function SalesTable({
  rows,
  totalCount,
  locale,
}: {
  rows: SaleRow[];
  totalCount: number;
  locale: Locale;
}) {
  if (rows.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-slate-500">
        {totalCount === 0 ? t("uploads.noSales", locale) : t("uploads.noMatch", locale)}
      </div>
    );
  }
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">{t("uploads.colDate", locale)}</th>
              <th className="text-left px-4 py-2">{t("uploads.colCustomer", locale)}</th>
              <th className="text-left px-4 py-2">{t("uploads.colProduct", locale)}</th>
              <th className="text-right px-4 py-2">{t("uploads.colQty", locale)}</th>
              <th className="text-right px-4 py-2 hidden md:table-cell">{t("uploads.colUnitPrice", locale)}</th>
              <th className="text-right px-4 py-2">{t("uploads.colTotal", locale)}</th>
              <th className="text-left px-4 py-2 hidden lg:table-cell">{t("uploads.colCity", locale)}</th>
              <th className="text-left px-4 py-2 hidden md:table-cell">{t("uploads.colPayment", locale)}</th>
              <th className="text-left px-4 py-2">{t("uploads.colStatus", locale)}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={`${s.orderId}-${i}`} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-500 whitespace-nowrap font-mono text-[11px]">{s.date}</td>
                <td className="px-4 py-2 whitespace-nowrap">{s.customerName}</td>
                <td className="px-4 py-2">{locale === "bn" ? s.productNameBn : s.productName}</td>
                <td className="px-4 py-2 text-right">{s.qty}</td>
                <td className="px-4 py-2 text-right hidden md:table-cell">{formatBDT(s.unitPrice)}</td>
                <td className="px-4 py-2 text-right font-medium whitespace-nowrap">{formatBDT(s.total)}</td>
                <td className="px-4 py-2 hidden lg:table-cell text-slate-600">{s.city}</td>
                <td className="px-4 py-2 hidden md:table-cell">
                  <span
                    className={
                      "inline-flex items-center text-[11px] px-2 py-0.5 rounded border uppercase " +
                      paymentStyle(s.payment)
                    }
                  >
                    {s.payment}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <StatusPill status={s.status} locale={locale} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalCount > rows.length && (
        <div className="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-100">
          {t("uploads.showing", locale)} {rows.length.toLocaleString()} {t("uploads.of", locale)}{" "}
          {totalCount.toLocaleString()}
        </div>
      )}
    </>
  );
}
