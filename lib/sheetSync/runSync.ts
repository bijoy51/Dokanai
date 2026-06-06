/**
 * Shared sync routine — reads a Google Sheet via the user's stored OAuth
 * token, runs the existing append-only mergeDataset(), updates counters,
 * appends an upload-history event if anything changed.
 *
 * Called from two places:
 *   - POST /api/sheet-sync (user-initiated: connect or "Sync now")
 *   - /api/cron/sync-sheets (Vercel Cron, every ~5 min)
 */

import { readSheetIntoCanonical } from "@/lib/google/sheets";
import {
  getImported,
  hydrateImported,
  mergeDataset,
  persistImported,
  setImported,
} from "@/lib/data/imported";
import { hydrateUploadHistory, recordUpload } from "@/lib/data/upload-history";
import { recordError, recordSync } from "@/lib/sheetSync/store";

export interface RunSyncResult {
  ok: boolean;
  error?: string;
  rowCount?: number;
  tabsRead?: string[];
  counts?: { products: number; customers: number; orders: number };
  changed?: boolean;
}

export async function runSheetSync(
  email: string,
  accessToken: string,
  sheetId: string,
  sheetTitle: string | undefined,
  via: "connect" | "manual" | "cron",
): Promise<RunSyncResult> {
  try {
    const result = await readSheetIntoCanonical(accessToken, sheetId);
    if (result.products.length === 0 && result.sales.length === 0) {
      const msg =
        "No usable rows found. Your sheet needs a header row with at least one of: name+price (for products) or date+product (for sales).";
      await recordError(email, msg);
      return { ok: false, error: msg };
    }

    await hydrateImported(email);
    await hydrateUploadHistory(email);
    const existing = getImported(email);
    const { dataset, delta } = mergeDataset(existing, result.products, result.sales);
    if (dataset.products.length === 0) {
      const msg = "No usable products found in the synced rows. Check your column headers.";
      await recordError(email, msg);
      return { ok: false, error: msg };
    }
    setImported(email, dataset);
    await persistImported(email, dataset);
    await recordSync(email, result.products.length + result.sales.length);

    const counts = {
      products: dataset.products.length,
      customers: dataset.customers.length,
      orders: dataset.orders.length,
    };

    const changed =
      delta.productsAdded +
        delta.productsUpdated +
        delta.customersAdded +
        delta.ordersAdded >
      0;
    if (changed) {
      await recordUpload(email, {
        source: "live-sync",
        status: "ok",
        delta,
        totals: counts,
        note: sheetTitle ? `Google Sheets: ${sheetTitle} (${via})` : `Google Sheets (${via})`,
      });
    }

    return {
      ok: true,
      rowCount: result.rowCount,
      tabsRead: result.tabsRead,
      counts,
      changed,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sheet read failed.";
    await recordError(email, msg);
    return { ok: false, error: msg };
  }
}
