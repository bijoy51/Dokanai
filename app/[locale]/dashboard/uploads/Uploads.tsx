import Link from "next/link";
import { ArrowRight, Database, History } from "lucide-react";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { getStore } from "@/lib/data/store";
import { getUploadHistory } from "@/lib/data/upload-history";
import { t, type Locale } from "@/lib/i18n/messages";
import { UploadedDataTabs, type ProductRow, type SaleRow } from "./UploadedDataTabs";

// dynamic = "force-dynamic" is now owned by ./page.tsx — Next.js only honors
// route-segment config exports from the actual page.tsx file. Keeping a
// stray one here was dead noise.

const MAX_PRODUCT_ROWS = 1000;
const MAX_SALE_ROWS = 1000;

/**
 * /dashboard/uploads
 *
 * Browsable view of everything the user has uploaded across CSV / PDF /
 * photos / live-sync. Two tabs:
 *
 *   - Products — the current product catalog (post-merge of every upload)
 *   - Sales    — every order row, flattened so multi-item orders show
 *                one row per item.
 *
 * Reads the in-memory cache hydrated by the dashboard layout, so this page
 * is server-rendered with no extra network calls on warm instances.
 */
export default function UploadsPageBody({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  const session = verifySessionToken(cookies().get(SESSION_COOKIE)?.value);
  const store = getStore();
  const events = session ? getUploadHistory(session.email) : [];

  const productRows: ProductRow[] = store.products.slice(0, MAX_PRODUCT_ROWS).map((p) => ({
    id: p.id,
    name: p.name,
    nameBn: p.nameBn,
    category: p.category,
    price: p.price,
    cost: p.cost,
    stock: p.stock,
  }));

  // Sort orders newest first then expand items into individual rows.
  const sortedOrders = [...store.orders].sort((a, b) => (a.date < b.date ? 1 : -1));
  const saleRows: SaleRow[] = [];
  for (const o of sortedOrders) {
    const cust = store.customerById(o.customerId);
    for (const it of o.items) {
      const p = store.productById(it.productId);
      saleRows.push({
        orderId: o.id,
        date: o.date,
        customerName: cust?.name ?? "—",
        productName: p?.name ?? "—",
        productNameBn: p?.nameBn ?? "—",
        qty: it.qty,
        unitPrice: it.unitPrice,
        total: it.qty * it.unitPrice,
        status: o.status,
        city: o.city,
        payment: o.paymentMethod,
      });
      if (saleRows.length >= MAX_SALE_ROWS) break;
    }
    if (saleRows.length >= MAX_SALE_ROWS) break;
  }

  const hasData = store.products.length > 0 || store.orders.length > 0;
  const totalProducts = store.products.length;
  const totalOrders = store.orders.length;

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{t("uploads.title", locale)}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("uploads.subtitle", locale)}</p>
      </header>

      {!hasData ? (
        <EmptyState locale={locale} />
      ) : (
        <>
          {/* Quick stats — actual data counts, not upload-event counts. */}
          <SummaryCards
            locale={locale}
            productCount={totalProducts}
            customerCount={store.customers.length}
            orderCount={totalOrders}
            uploadEventCount={events.length}
          />

          <UploadedDataTabs
            locale={locale}
            products={productRows}
            sales={saleRows}
            totalProducts={totalProducts}
            totalOrders={totalOrders}
          />

          <p className="mt-3 text-[11px] text-slate-400">{t("uploads.appendOnlyNote", locale)}</p>
        </>
      )}
    </div>
  );
}

function EmptyState({ locale }: { locale: Locale }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <div className="mx-auto w-12 h-12 rounded-xl bg-brand-50 border border-brand-200 grid place-items-center">
        <History className="w-6 h-6 text-brand-600" />
      </div>
      <h2 className="mt-4 text-base font-semibold text-slate-900">
        {t("uploads.emptyTitle", locale)}
      </h2>
      <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
        {t("uploads.emptyBody", locale)}
      </p>
      <Link
        href={`/${locale}/dashboard/onboarding`}
        className="mt-5 inline-flex items-center gap-1.5 text-sm bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-md px-4 py-2"
      >
        {t("uploads.emptyCta", locale)}
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

function SummaryCards({
  locale,
  productCount,
  customerCount,
  orderCount,
  uploadEventCount,
}: {
  locale: Locale;
  productCount: number;
  customerCount: number;
  orderCount: number;
  uploadEventCount: number;
}) {
  const cards: Array<{ key: string; value: number; label: string }> = [
    { key: "products", value: productCount, label: t("uploads.statsProducts", locale) },
    { key: "orders", value: orderCount, label: t("uploads.statsOrders", locale) },
    { key: "customers", value: customerCount, label: t("uploads.statsCustomers", locale) },
    { key: "imports", value: uploadEventCount, label: t("uploads.statsImports", locale) },
  ];
  return (
    <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {cards.map((c) => (
        <div key={c.key} className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
            <Database className="w-3.5 h-3.5" />
            {c.label}
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{c.value.toLocaleString()}</div>
        </div>
      ))}
    </section>
  );
}
