/**
 * Per-account shop profile.
 *
 * Captures the shop's category and physical-location context — which the
 * shopkeeper supplies once on the Khata-to-Cloud onboarding page. We use it
 * to bias product-demand recommendations on the Overview page and inside
 * the Pilot agent. Without it, recommendations are category-agnostic and
 * miss the fact that a grocery shop near a school sells different things
 * than one in a residential block.
 *
 * Storage mirrors lib/data/imported.ts:
 *  - synchronous in-memory Map keyed by lowercased email (fast page reads)
 *  - durable KV (shop-profile:<email>) for cross-instance survival
 *  - hydrate() pulls KV -> memory at the top of a request (same as imported)
 */
import { kvConfigured, kvGet, kvPut, kvDelete } from "@/lib/kv";

export type ShopType =
  | "grocery"
  | "clothing"
  | "electronics"
  | "beauty"
  | "food"
  | "home"
  | "pharmacy"
  | "stationery"
  | "mixed";

export type VenueType =
  | "near_school"
  | "near_university"
  | "near_office"
  | "near_hospital"
  | "near_market"
  | "near_religious"
  | "tourist_area"
  | "residential"
  | "mixed";

export interface ShopProfile {
  shopType: ShopType;
  city: string;
  area: string;
  venueType: VenueType;
  updatedAt: number;
}

const VALID_SHOP_TYPES: ShopType[] = [
  "grocery", "clothing", "electronics", "beauty", "food", "home", "pharmacy", "stationery", "mixed",
];
const VALID_VENUES: VenueType[] = [
  "near_school", "near_university", "near_office", "near_hospital", "near_market",
  "near_religious", "tourist_area", "residential", "mixed",
];

export function sanitizeProfile(raw: unknown): ShopProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const shopType = typeof r.shopType === "string" && (VALID_SHOP_TYPES as string[]).includes(r.shopType)
    ? (r.shopType as ShopType)
    : null;
  const venueType = typeof r.venueType === "string" && (VALID_VENUES as string[]).includes(r.venueType)
    ? (r.venueType as VenueType)
    : null;
  if (!shopType || !venueType) return null;
  const city = typeof r.city === "string" ? r.city.trim().slice(0, 80) : "";
  const area = typeof r.area === "string" ? r.area.trim().slice(0, 120) : "";
  return {
    shopType,
    venueType,
    city,
    area,
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : Date.now(),
  };
}

const store = new Map<string, ShopProfile>();
const norm = (email: string) => email.trim().toLowerCase();
const kvKey = (email: string) => `shop-profile:${norm(email)}`;

export function getShopProfile(email: string): ShopProfile | undefined {
  return store.get(norm(email));
}

export function setShopProfile(email: string, p: ShopProfile): void {
  store.set(norm(email), p);
}

export function clearShopProfile(email: string): void {
  store.delete(norm(email));
}

export async function persistShopProfile(email: string, p: ShopProfile): Promise<boolean> {
  return kvPut(kvKey(email), p);
}

/** Warm the per-instance cache from KV. Safe no-op when KV isn't configured. */
export async function hydrateShopProfile(email: string): Promise<void> {
  if (!kvConfigured()) return;
  const e = norm(email);
  if (store.has(e)) return;
  const p = await kvGet<unknown>(kvKey(e));
  const clean = sanitizeProfile(p);
  if (clean) store.set(e, clean);
}

export async function removeShopProfile(email: string): Promise<void> {
  clearShopProfile(email);
  await kvDelete(kvKey(email));
}
