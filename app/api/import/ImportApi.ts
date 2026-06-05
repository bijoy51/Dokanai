import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getImported,
  hasImported,
  hydrateImported,
  mergeDataset,
  persistImported,
  removeImported,
  setImported,
  type RawProduct,
  type RawSale,
} from "@/lib/data/imported";
import { hydrateUploadHistory, recordUpload, type UploadSource } from "@/lib/data/upload-history";

/**
 * /api/import
 *
 * GET    -> { hasData, email }              status for the signed-in account
 * POST   -> { products: [...], sales: [...], source?: "csv"|"pdf"|"photos" }
 *           Appends to the existing dataset. Re-uploads of the same rows
 *           are de-duplicated (orders by content hash, products by name,
 *           customers by name). Previous data is NEVER replaced or lost.
 * DELETE -> clears the signed-in account's imported data
 */

const VALID_SOURCES: UploadSource[] = ["csv", "pdf", "photos", "live-sync"];

function sanitizeSource(raw: unknown): UploadSource {
  if (typeof raw === "string") {
    const lower = raw.toLowerCase();
    if ((VALID_SOURCES as string[]).includes(lower)) return lower as UploadSource;
  }
  return "csv";
}

export async function GET() {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  // Pull the dataset from the durable KV into this instance's cache so the
  // status reflects data imported on any instance, not just this one.
  await hydrateImported(session.email);
  return NextResponse.json({
    email: session.email,
    hasData: hasImported(session.email),
  });
}

export async function POST(req: Request) {
  const LOG = "[import-api]";
  const session = getSession();
  console.log(`${LOG} POST start`, { email: session?.email ?? null });
  if (!session) {
    console.warn(`${LOG} no session -> 401`);
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { products?: RawProduct[]; sales?: RawSale[]; source?: string; note?: string; silent?: boolean };
  try {
    body = await req.json();
  } catch (e) {
    console.error(`${LOG} JSON parse failed`, e);
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const products = Array.isArray(body.products) ? body.products : [];
  const sales = Array.isArray(body.sales) ? body.sales : [];
  const source = sanitizeSource(body.source);
  const note = typeof body.note === "string" ? body.note.slice(0, 280) : undefined;
  console.log(`${LOG} received`, { products: products.length, sales: sales.length, source });
  if (products.length === 0 && sales.length === 0) {
    console.warn(`${LOG} empty payload -> 400`);
    return NextResponse.json(
      { error: "Upload at least a products CSV or a sales CSV." },
      { status: 400 },
    );
  }

  // Hydrate so we merge against the latest persisted dataset, not whatever
  // happens to be in this instance's RAM.
  await hydrateImported(session.email);
  await hydrateUploadHistory(session.email);

  const existing = getImported(session.email);
  const { dataset, delta } = mergeDataset(existing, products, sales);
  console.log(`${LOG} mergeDataset ->`, {
    products: dataset.products.length,
    customers: dataset.customers.length,
    orders: dataset.orders.length,
    delta,
  });
  if (dataset.products.length === 0) {
    console.warn(`${LOG} 0 products after merge -> 400`);
    return NextResponse.json(
      { error: "No usable products found in the uploaded files." },
      { status: 400 },
    );
  }

  setImported(session.email, dataset);
  const persisted = await persistImported(session.email, dataset);
  console.log(`${LOG} persisted =`, persisted);

  const totals = {
    products: dataset.products.length,
    customers: dataset.customers.length,
    orders: dataset.orders.length,
  };

  // Record the upload event so the /dashboard/uploads page can show it.
  // `silent: true` is set by the self-healing rehydration paths (DataSyncGuard
  // / NoDataState) so they don't pollute the history with noise events.
  if (!body.silent) {
    await recordUpload(session.email, {
      source,
      status: "ok",
      delta,
      totals,
      note,
    });
  }

  return NextResponse.json({
    ok: true,
    counts: totals,
    delta,
  });
}

export async function DELETE() {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  await removeImported(session.email);
  return NextResponse.json({ ok: true });
}
