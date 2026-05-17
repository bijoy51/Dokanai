import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  buildDataset,
  clearImported,
  hasImported,
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
  return NextResponse.json({
    email: session.email,
    hasData: session.email === DEMO || hasImported(session.email),
    isDemo: session.email === DEMO,
  });
}

export async function POST(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (session.email === DEMO) {
    return NextResponse.json(
      { error: "The demo account uses sample data and cannot be overwritten." },
      { status: 403 },
    );
  }

  let body: { products?: RawProduct[]; sales?: RawSale[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const products = Array.isArray(body.products) ? body.products : [];
  const sales = Array.isArray(body.sales) ? body.sales : [];
  if (products.length === 0 && sales.length === 0) {
    return NextResponse.json(
      { error: "Upload at least a products CSV or a sales CSV." },
      { status: 400 },
    );
  }

  const dataset = buildDataset(products, sales);
  if (dataset.products.length === 0) {
    return NextResponse.json(
      { error: "No usable products found in the uploaded files." },
      { status: 400 },
    );
  }
  setImported(session.email, dataset);

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
  if (session.email !== DEMO) clearImported(session.email);
  return NextResponse.json({ ok: true });
}
