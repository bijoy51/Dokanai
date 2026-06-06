/**
 * Google Sheets reader.
 *
 * The new Live Sync model is pull-based: the user pastes a sheet ID, we
 * fetch via the Sheets v4 REST API using their OAuth access token, and
 * normalise the rows into the canonical RawProduct/RawSale shape that
 * lib/data/imported.ts → mergeDataset() already consumes.
 *
 * Heuristic row split (matches the old Apps Script behaviour, so the
 * merge dedup keys stay stable across the migration):
 *   - Products  = rows with `name` AND `price` populated
 *   - Sales     = rows with `date` AND `product` populated
 *   - A single row may match both (an itemised invoice line).
 *
 * We read the FIRST tab only. If the user has multiple tabs (e.g.
 * separate Products and Sales sheets) we read them in order until we
 * hit the row caps. That's a known limitation — UX is one input, one
 * sheet pulled.
 */

import type { RawProduct, RawSale } from "@/lib/data/imported";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const MAX_ROWS_PER_TAB = 50_000; // matches the webhook's MAX_SALES cap

export interface SheetReadResult {
  sheetTitle: string;
  tabsRead: string[];
  rowCount: number;
  products: RawProduct[];
  sales: RawSale[];
}

interface SpreadsheetMeta {
  properties: { title: string };
  sheets: Array<{ properties: { title: string; sheetId: number } }>;
}

interface ValuesResponse {
  range: string;
  majorDimension: "ROWS" | "COLUMNS";
  values?: string[][];
}

/**
 * Extract the spreadsheet ID from either a full Google Sheets URL or a
 * bare ID. Accepts:
 *   - https://docs.google.com/spreadsheets/d/<ID>/edit#gid=0
 *   - https://docs.google.com/spreadsheets/d/<ID>/
 *   - <ID>
 * Returns null if no plausible ID can be extracted.
 */
export function extractSheetId(input: string): string | null {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return null;
  // Full URL: pull the segment after /d/.
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (urlMatch) return urlMatch[1];
  // Bare ID: Google sheet IDs are 40-50 chars of [A-Za-z0-9_-].
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * Hit the Sheets API for spreadsheet metadata. Used to discover the tab
 * names and to surface a nice "couldn't access this sheet" message when
 * the OAuth user doesn't own / can't see the sheet.
 */
export async function getSpreadsheetMeta(
  accessToken: string,
  spreadsheetId: string,
): Promise<SpreadsheetMeta> {
  const url = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties.title,sheets.properties.sheetId`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    // Map a few common cases to plain-English errors the panel can show.
    if (res.status === 403) {
      throw new Error(
        "Google denied access to this sheet. Make sure the sheet is in the same Google account you signed in with — or, if it's a shared sheet, that you have at least View access.",
      );
    }
    if (res.status === 404) {
      throw new Error(
        "Sheet not found. Double-check the sheet ID — it's the long string in the URL between /d/ and /edit.",
      );
    }
    throw new Error(`Sheets API error (${res.status}): ${text.slice(0, 300)}`);
  }
  return (await res.json()) as SpreadsheetMeta;
}

async function getValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  const url = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets values fetch failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as ValuesResponse;
  return json.values ?? [];
}

/**
 * Split each row into a RawProduct and/or a RawSale based on which
 * columns are populated. Matches the old Apps Script heuristic in
 * LiveSyncPanel.tsx so the merge dedup keys don't shift.
 */
function classifyRows(rows: Record<string, unknown>[]): {
  products: RawProduct[];
  sales: RawSale[];
} {
  const products: RawProduct[] = [];
  const sales: RawSale[] = [];
  for (const r of rows) {
    const name = pickString(r, ["name", "title", "product_name", "item"]);
    const price = pickAny(r, ["price", "unit_price", "rate"]);
    if (name && price !== undefined && price !== "") {
      products.push({
        name,
        title: name,
        category: pickString(r, ["category", "type"]) ?? undefined,
        price: typeof price === "number" ? price : String(price),
        cost: numOrUndef(pickAny(r, ["cost", "buy_price", "purchase_price"])),
        stock: numOrUndef(pickAny(r, ["stock", "qty_in_stock", "inventory"])),
      });
    }
    const date = pickString(r, ["date", "order_date", "sale_date"]);
    const productName = pickString(r, ["product", "item", "name"]);
    if (date && productName) {
      sales.push({
        date,
        product: productName,
        qty: numOrUndef(pickAny(r, ["qty", "quantity", "units"])) ?? 1,
        unit_price: numOrUndef(pickAny(r, ["unit_price", "price", "rate"])),
        customer: pickString(r, ["customer", "customer_name", "buyer"]) ?? undefined,
        payment: pickString(r, ["payment", "payment_method", "method"]) ?? undefined,
        status: pickString(r, ["status", "delivery_status"]) ?? undefined,
        city: pickString(r, ["city", "town", "area"]) ?? undefined,
        email: pickString(r, ["email", "customer_email"]) ?? undefined,
        consent: pickString(r, ["consent", "marketing_consent", "opt_in"]) ?? undefined,
      });
    }
  }
  return { products, sales };
}

function pickAny(r: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (r[k] !== undefined && r[k] !== null && r[k] !== "") return r[k];
  }
  return undefined;
}
function pickString(r: Record<string, unknown>, keys: string[]): string | null {
  const v = pickAny(r, keys);
  if (v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}
function numOrUndef(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Convert a 2D array (header row + data rows) into row objects keyed by
 * lowercased, trimmed header names. Blank header cells are dropped so
 * trailing empty columns don't spawn ""-keyed properties.
 */
function valuesToRows(values: string[][]): Record<string, unknown>[] {
  if (values.length < 2) return [];
  const headers = values[0].map((h) => String(h ?? "").trim().toLowerCase());
  return values.slice(1).map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      if (!h) return;
      obj[h] = row[i] ?? "";
    });
    return obj;
  });
}

/**
 * Pull every tab in the sheet, classify each row, and return the merged
 * products + sales. Reads up to MAX_ROWS_PER_TAB rows per tab.
 */
export async function readSheetIntoCanonical(
  accessToken: string,
  spreadsheetId: string,
): Promise<SheetReadResult> {
  const meta = await getSpreadsheetMeta(accessToken, spreadsheetId);
  const tabsRead: string[] = [];
  const allProducts: RawProduct[] = [];
  const allSales: RawSale[] = [];
  let rowCount = 0;

  for (const sheet of meta.sheets) {
    const tab = sheet.properties.title;
    const range = `${tab}!A1:Z${MAX_ROWS_PER_TAB + 1}`;
    const values = await getValues(accessToken, spreadsheetId, range);
    if (values.length < 2) continue; // header-only or empty
    tabsRead.push(tab);
    const rows = valuesToRows(values);
    rowCount += rows.length;
    const { products, sales } = classifyRows(rows);
    allProducts.push(...products);
    allSales.push(...sales);
  }

  return {
    sheetTitle: meta.properties.title,
    tabsRead,
    rowCount,
    products: allProducts,
    sales: allSales,
  };
}
