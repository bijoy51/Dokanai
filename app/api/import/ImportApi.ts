import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  buildDataset,
  hasImported,
  hydrateImported,
  persistImported,
  removeImported,
  setImported,
  type RawProduct,
  type RawSale,
} from "@/lib/data/imported";

/**
 * /api/import
 *
 * GET    -> { hasData, email }              status for the signed-in account
 * POST   -> { products: [...], sales: [...] }  store an imported dataset
 * DELETE -> clears the signed-in account's imported data
 *
 * The demo account is read-only here: it always shows the synthetic seed.
 */

const DEMO = "demo@dokanai.app";

export async function GET() {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  // Pull the dataset from the durable KV into this instance's cache so the
  // status reflects data imported on any instance, not just this one.
  if (session.email !== DEMO) await hydrateImported(session.email);
  return NextResponse.json({
    email: session.email,
    hasData: session.email === DEMO || hasImported(session.email),
    isDemo: session.email === DEMO,
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
  if (session.email === DEMO) {
    console.warn(`${LOG} demo account -> 403`);
    return NextResponse.json(
      { error: "The demo account uses sample data and cannot be overwritten." },
      { status: 403 },
    );
  }

  let body: { products?: RawProduct[]; sales?: RawSale[] };
  try {
    body = await req.json();
  } catch (e) {
    console.error(`${LOG} JSON parse failed`, e);
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const products = Array.isArray(body.products) ? body.products : [];
  const sales = Array.isArray(body.sales) ? body.sales : [];
  console.log(`${LOG} received`, { products: products.length, sales: sales.length });
  if (products.length === 0 && sales.length === 0) {
    console.warn(`${LOG} empty payload -> 400`);
    return NextResponse.json(
      { error: "Upload at least a products CSV or a sales CSV." },
      { status: 400 },
    );
  }

  const dataset = buildDataset(products, sales);
  console.log(`${LOG} buildDataset ->`, {
    products: dataset.products.length,
    customers: dataset.customers.length,
    orders: dataset.orders.length,
  });
  if (dataset.products.length === 0) {
    console.warn(`${LOG} 0 products after build -> 400`);
    return NextResponse.json(
      { error: "No usable products found in the uploaded files." },
      { status: 400 },
    );
  }
  setImported(session.email, dataset);
  // Persist durably so a render on a different / cold instance can find it.
  const persisted = await persistImported(session.email, dataset);
  console.log(`${LOG} kvConfigured persist result =`, persisted, "(false = ML_ADMIN_SECRET not set, in-memory only)");

  return NextResponse.json({
    ok: true,
    counts: {
      products: dataset.products.length,
      customers: dataset.customers.length,
      orders: dataset.orders.length,
    },
  });
}

export async function DELETE() {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (session.email !== DEMO) await removeImported(session.email);
  return NextResponse.json({ ok: true });
}
