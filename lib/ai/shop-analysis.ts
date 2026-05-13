/**
 * Shop-analysis stub used by /api/analyze-shop when the Python ML backend is
 * not configured. Returns the same response shape as the FastAPI service, so
 * the page works identically against either source.
 */
import { festivalCalendar } from "./forecast";

// ---------- request + response shapes (mirror ml-backend/app/schemas.py) ----------

export interface AnalyzeShopRequest {
  shop?: { name?: string; region?: string };
  listings: Array<{
    title: string;
    description?: string;
    price?: number | null;
    stock?: number | null;
    category?: string | null;
  }>;
  sales?: Array<{ date: string; product: string; qty: number; unit_price?: number | null }>;
  images?: string[];
}

export interface ShopTypeResult {
  label: string;
  confidence: number;
  alternatives: [string, number][];
  method: "model" | "heuristic";
}
export interface CatalogItem {
  title: string;
  product_type?: string | null;
  brand?: string | null;
  color?: string | null;
  size?: string | null;
  material?: string | null;
  gender?: string | null;
  garment_type?: string | null;
  occasion?: string | null;
  price_band?: string | null;
}
export interface SellingItem { product_type: string; units_30d: number; trend: "up" | "down" | "flat" }
export interface PoorItem { product_type: string; units_30d: number; days_of_stock: number }
export interface RestockItem { product_type: string; days_of_stock: number; forecast_7d: number }
export interface MissingItem { product_type: string; carried_by_similar_pct: number; reason: string }
export interface TrendItem { product_type: string; momentum: number }
export interface FestivalOutlookItem { festival: string; date: string; advice: string; expected_uplift: number; categories: string[] }
export interface PopularStyle { label: string; momentum: number; note: string; emoji: string; sample_images: string[] }
export interface UploadedImageAnalysis { image_index: number; predicted_style: string; confidence: number; trending: boolean; suggestions: string[] }

export interface AnalyzeShopResponse {
  source: "ml-backend" | "heuristic-fallback";
  shop_type: ShopTypeResult;
  catalog: CatalogItem[];
  selling_well: SellingItem[];
  selling_poorly: PoorItem[];
  restock_soon: RestockItem[];
  missing_goods: MissingItem[];
  trending: { up: TrendItem[]; down: TrendItem[] };
  festival_outlook: FestivalOutlookItem[];
  popular_styles: PopularStyle[];
  uploaded_image_analysis: UploadedImageAnalysis[];
  notes: string[];
}

// ---------- shop-type classification ----------

const KEYWORDS: Record<string, string[]> = {
  clothing: ["saree", "shari", "panjabi", "punjabi", "kurti", "kurta", "shirt", "pant", "three-piece", "threepiece", "dress", "frock", "hijab", "burka", "abaya", "blouse", "petticoat", "jacket", "shawl", "lehenga", "salwar", "shalwar", "fabric", "cloth", "tshirt", "t-shirt", "jeans", "trouser", "scarf"],
  grocery: ["rice", "chal", "oil", "tel", "dal", "lentil", "sugar", "chini", "salt", "atta", "flour", "spice", "moshla", "masala", "onion", "potato", "egg", "milk", "soap", "detergent", "noodles", "biscuit"],
  electronics: ["charger", "cable", "earbud", "earphone", "headphone", "power bank", "powerbank", "smartwatch", "watch", "bulb", "led", "battery", "adapter", "usb", "speaker", "router", "mouse", "keyboard"],
  beauty: ["lipstick", "serum", "moisturizer", "cream", "facewash", "perfume", "attar", "kajal", "henna", "mehedi", "hair oil", "shampoo", "conditioner", "foundation", "compact", "body spray", "deodorant", "sunscreen"],
  home: ["bedsheet", "blanket", "kombol", "pillow", "balish", "curtain", "porda", "clock", "knife", "freezer bag", "jaynamaz", "prayer mat", "towel", "plate", "bowl", "pan", "bucket"],
  food: ["dates", "khejur", "mishti", "sweets", "hilsa", "ilish", "honey", "modhu", "tea", "cha", "coffee", "chola", "chickpea", "biriyani", "iftar", "snack", "cake", "chocolate", "juice", "ghee"],
  pharmacy: ["tablet", "capsule", "syrup", "ointment", "paracetamol", "antiseptic", "bandage", "thermometer", "mask", "sanitizer", "vitamin", "supplement", "medicine"],
  stationery: ["pen", "pencil", "notebook", "khata", "exercise book", "eraser", "sharpener", "ruler", "marker", "highlighter", "file", "folder", "glue", "stapler", "paper"],
};

function classifyShopType(listings: AnalyzeShopRequest["listings"]): ShopTypeResult {
  const texts = listings
    .map((l) => `${l.title ?? ""} ${l.description ?? ""}`.toLowerCase().trim())
    .filter(Boolean);
  if (!texts.length) return { label: "clothing", confidence: 0.4, alternatives: [], method: "heuristic" };

  const votes = new Map<string, number>();
  for (const t of texts) {
    let bestType: string | null = null;
    let bestHits = 0;
    for (const [type, words] of Object.entries(KEYWORDS)) {
      const hits = words.reduce((n, w) => (t.includes(w) ? n + 1 : n), 0);
      if (hits > bestHits) {
        bestHits = hits;
        bestType = type;
      }
    }
    if (bestType) votes.set(bestType, (votes.get(bestType) ?? 0) + 1);
  }
  if (!votes.size) return { label: "clothing", confidence: 0.4, alternatives: [], method: "heuristic" };

  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((s, [, c]) => s + c, 0);
  return {
    label: ranked[0][0],
    confidence: Math.round((ranked[0][1] / total) * 1000) / 1000,
    alternatives: ranked.slice(1, 4).map(([k, v]) => [k, Math.round((v / total) * 1000) / 1000] as [string, number]),
    method: "heuristic",
  };
}

// ---------- attribute extraction (regex + gazetteer) ----------

const COLORS = ["red", "blue", "green", "black", "white", "yellow", "pink", "purple", "orange", "brown", "grey", "gray", "maroon", "navy", "beige", "cream", "gold", "silver", "pastel"];
const MATERIALS = ["cotton", "silk", "linen", "georgette", "chiffon", "denim", "wool", "woolen", "polyester", "khadi", "jamdani", "muslin", "leather"];
const GARMENTS: Record<string, string[]> = {
  saree: ["saree", "shari", "sari", "jamdani"],
  panjabi: ["panjabi", "punjabi"],
  kurti: ["kurti", "kurta", "anarkali"],
  "three-piece": ["three-piece", "threepiece", "three piece", "salwar", "shalwar"],
  shirt: ["shirt", "tshirt", "t-shirt"],
  pant: ["pant", "trouser", "jeans", "palazzo"],
  dress: ["dress", "frock", "gown", "lehenga"],
  blouse: ["blouse"],
  hijab: ["hijab", "scarf", "abaya", "burka"],
  jacket: ["jacket", "blazer", "coat"],
  shawl: ["shawl", "chador", "stole"],
};
const OCCASIONS: Record<string, string[]> = {
  festive: ["eid", "puja", "festive", "wedding", "bridal", "party", "boishakh"],
  casual: ["casual", "daily", "everyday"],
  formal: ["formal", "office"],
  winter: ["winter", "warm", "woolen"],
};

function extractAttributes(l: AnalyzeShopRequest["listings"][number]): CatalogItem {
  const text = `${l.title ?? ""} ${l.description ?? ""}`.toLowerCase();
  const find = (table: Record<string, string[]>) => {
    for (const [k, ws] of Object.entries(table)) if (ws.some((w) => text.includes(w))) return k;
    return null;
  };
  const garment = find(GARMENTS);
  const occasion = find(OCCASIONS);
  const color = COLORS.find((c) => new RegExp(`\\b${c}\\b`).test(text)) ?? null;
  const material = MATERIALS.find((m) => text.includes(m)) ?? null;
  let gender: string | null = null;
  if (/\b(women|ladies|girl|woman|female)\b/.test(text)) gender = "women";
  else if (/\b(men|gents|boy|man|male)\b/.test(text)) gender = "men";
  else if (/\b(kids|child|baby|boys|girls)\b/.test(text)) gender = "kids";
  const sizeMatch = text.match(/\b(xxl|xl|xs|s|m|l)\b/i) ?? text.match(/size\s*[:\-]?\s*(\d{1,2})/i);
  const size = sizeMatch ? (sizeMatch[1] ?? "").toUpperCase() || null : null;
  const price = typeof l.price === "number" ? l.price : null;
  const price_band = price === null ? null : price < 600 ? "low" : price < 2500 ? "mid" : "high";
  const product_type = garment ?? guessProductType(text) ?? l.category ?? null;
  return {
    title: l.title,
    product_type,
    brand: null,
    color,
    size,
    material,
    gender,
    garment_type: garment,
    occasion,
    price_band,
  };
}

function guessProductType(text: string): string | null {
  const tokens = text.match(/[a-z]{3,}/g) ?? [];
  const stop = new Set(["the", "and", "for", "with", "new", "best", "pack", "set", "premium", "quality"]);
  for (const tok of tokens) if (!stop.has(tok)) return tok;
  return null;
}

// ---------- forecasting + selling-well/poorly ----------

const CATEGORY_PRIORS: Record<string, number> = {
  clothing: 1.2, grocery: 3.5, electronics: 0.8, beauty: 1.5,
  home: 1.0, food: 2.2, pharmacy: 2.0, stationery: 1.6,
};
const TYPE_TO_BOOST_CAT: Record<string, string> = {
  saree: "clothing", panjabi: "clothing", kurti: "clothing", "three-piece": "clothing",
  shirt: "clothing", dress: "clothing", blouse: "clothing", hijab: "clothing", jacket: "clothing", shawl: "clothing",
  perfume: "beauty", attar: "beauty", lipstick: "beauty", serum: "beauty",
  dates: "food", mishti: "food", hilsa: "food", tea: "food", honey: "food",
  blanket: "home", knife: "home", "prayer mat": "home",
};

function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

function boostCategory(productType: string | null | undefined, shopType: string): string {
  if (productType && TYPE_TO_BOOST_CAT[productType.toLowerCase()]) return TYPE_TO_BOOST_CAT[productType.toLowerCase()];
  return ["clothing", "beauty", "food", "home"].includes(shopType) ? shopType : "clothing";
}

function festivalBoostForDate(date: Date, category: string): number {
  let total = 1;
  for (const f of festivalCalendar()) {
    if (!f.categories.includes(category as never)) continue;
    const fdate = new Date(f.date);
    const diff = daysBetween(date, fdate);
    if (diff <= f.leadDays && diff >= -3) {
      const ramp = diff >= 0 ? (f.leadDays - diff) / f.leadDays : Math.max(0, 1 + diff / 3);
      total *= 1 + (f.peakBoost - 1) * Math.max(0, ramp);
    }
  }
  return total;
}

function aggregateSales(sales: NonNullable<AnalyzeShopRequest["sales"]>) {
  const today = new Date();
  const units30 = new Map<string, number>();
  const unitsPrior30 = new Map<string, number>();
  for (const s of sales) {
    const d = new Date(s.date);
    if (isNaN(d.getTime())) continue;
    const age = daysBetween(d, today);
    const key = (s.product || "").trim().toLowerCase();
    if (!key) continue;
    const q = Number(s.qty) || 1;
    if (age >= 0 && age < 30) units30.set(key, (units30.get(key) ?? 0) + q);
    else if (age >= 30 && age < 60) unitsPrior30.set(key, (unitsPrior30.get(key) ?? 0) + q);
  }
  return { units30, unitsPrior30 };
}

function forecastFromInputs(
  listings: AnalyzeShopRequest["listings"],
  catalog: CatalogItem[],
  sales: NonNullable<AnalyzeShopRequest["sales"]>,
  shopType: string,
): { selling_well: SellingItem[]; selling_poorly: PoorItem[]; restock_soon: RestockItem[] } {
  const { units30, unitsPrior30 } = aggregateSales(sales);
  const prior = CATEGORY_PRIORS[shopType] ?? 1.2;
  const today = new Date();
  const rows = listings.map((l, i) => {
    const key = (l.title ?? "").trim().toLowerCase();
    const u30 = units30.get(key) ?? 0;
    const uPrior = unitsPrior30.get(key) ?? 0;
    const baseDaily = u30 > 0 ? u30 / 30 : prior * 0.5;
    let boost7 = 0;
    for (let k = 1; k <= 7; k++) {
      const d = new Date(today);
      d.setDate(today.getDate() + k);
      boost7 += festivalBoostForDate(d, boostCategory(catalog[i]?.product_type, shopType));
    }
    boost7 /= 7;
    const fc7 = Math.round(baseDaily * 7 * boost7);
    const dailyFwd = Math.max(baseDaily * boost7, 1e-6);
    const stock = typeof l.stock === "number" ? l.stock : null;
    const daysOfStock = stock !== null ? stock / dailyFwd : 999;
    return {
      product_type: catalog[i]?.product_type ?? l.category ?? l.title,
      units_30d: u30,
      units_prior_30d: uPrior,
      forecast_7d: fc7,
      days_of_stock: Math.min(daysOfStock, 999),
      stock,
    };
  });

  const well = [...rows].sort((a, b) => b.units_30d - a.units_30d || b.forecast_7d - a.forecast_7d).slice(0, 8);
  const selling_well: SellingItem[] = well.map((r) => {
    let trend: SellingItem["trend"] = "flat";
    if (r.units_prior_30d > 0) {
      const g = (r.units_30d - r.units_prior_30d) / r.units_prior_30d;
      trend = g > 0.1 ? "up" : g < -0.1 ? "down" : "flat";
    } else if (r.units_30d > 0) trend = "up";
    return { product_type: r.product_type, units_30d: r.units_30d, trend };
  });

  const poor = rows.filter((r) => r.units_30d <= 2 && (r.stock ?? 0) > 5).sort((a, b) => b.days_of_stock - a.days_of_stock).slice(0, 8);
  const selling_poorly: PoorItem[] = poor.map((r) => ({
    product_type: r.product_type,
    units_30d: r.units_30d,
    days_of_stock: Math.round(Math.min(r.days_of_stock, 365) * 10) / 10,
  }));

  const restock = rows.filter((r) => r.days_of_stock < 10 && r.forecast_7d > 0).sort((a, b) => a.days_of_stock - b.days_of_stock).slice(0, 8);
  const restock_soon: RestockItem[] = restock.map((r) => ({
    product_type: r.product_type,
    days_of_stock: Math.round(r.days_of_stock * 10) / 10,
    forecast_7d: r.forecast_7d,
  }));

  return { selling_well, selling_poorly, restock_soon };
}

// ---------- missing goods ----------

const BENCHMARK: Record<string, [string, number, string][]> = {
  clothing: [
    ["matching blouse", 0.82, "complements sarees, frequently bought together"],
    ["petticoat", 0.74, "almost always paired with sarees"],
    ["kids festive wear", 0.68, "high demand around Eid and Puja"],
    ["men's formal shoes", 0.55, "cross-sells with panjabi and shirts"],
    ["gift hampers", 0.49, "lifts average order value during festivals"],
    ["winter caps and mufflers", 0.46, "captures Dec-Feb demand"],
  ],
  grocery: [
    ["packaged snacks", 0.85, "impulse buys at checkout"],
    ["cooking ghee", 0.62, "spikes around Eid-ul-Adha"],
    ["powdered milk", 0.71, "steady repeat sales"],
    ["dish and laundry soap", 0.78, "frequently restocked household item"],
    ["instant noodles", 0.69, "fast-moving low-cost item"],
  ],
  electronics: [
    ["phone screen protectors", 0.8, "high-margin accessory, easy attach-sell"],
    ["USB wall adapters", 0.66, "complements cables and phones"],
    ["bluetooth speakers", 0.52, "popular gift item"],
    ["power strips", 0.58, "steady household demand"],
    ["memory cards", 0.49, "attach-sells with phones"],
  ],
  beauty: [
    ["sunscreen", 0.6, "year-round demand"],
    ["makeup remover", 0.55, "complements foundation"],
    ["hair masks", 0.48, "upsell from hair oil"],
    ["nail polish sets", 0.5, "festive impulse buy"],
    ["men's grooming kits", 0.43, "growing segment"],
  ],
  home: [
    ["kitchen storage containers", 0.66, "steady household demand"],
    ["doormats", 0.58, "low-cost frequent replacement"],
    ["hangers and organizers", 0.62, "complements bedsheets"],
    ["LED night lamps", 0.4, "popular gift and decor item"],
  ],
  food: [
    ["dry fruits", 0.7, "spikes during Ramadan"],
    ["packaged spices", 0.64, "complements rice and groceries"],
    ["specialty teas", 0.46, "higher-margin variants"],
    ["iftar boxes", 0.55, "seasonal high-volume item"],
  ],
  pharmacy: [
    ["first-aid kits", 0.6, "household essential"],
    ["vitamin supplements", 0.72, "growing wellness demand"],
    ["baby care products", 0.58, "steady repeat purchases"],
    ["hand sanitizers", 0.66, "year-round demand"],
  ],
  stationery: [
    ["school exercise books", 0.8, "seasonal volume around term start"],
    ["art and craft supplies", 0.5, "higher-margin add-on"],
    ["printer paper reams", 0.6, "office demand"],
    ["calculators", 0.45, "exam-season demand"],
  ],
};
const COMPLEMENTARY: Record<string, string[]> = {
  saree: ["matching blouse", "petticoat"],
  panjabi: ["pajama", "men's sandals"],
  shirt: ["trousers", "belt"],
  rice: ["cooking oil", "lentils"],
  "phone charger": ["usb cable", "phone case"],
};

function missingGoodsFor(shopType: string, catalog: CatalogItem[]): MissingItem[] {
  const present = new Set<string>();
  for (const c of catalog) {
    if (c.product_type) present.add(c.product_type.toLowerCase());
    if (c.garment_type) present.add(c.garment_type.toLowerCase());
    if (c.title) present.add(c.title.toLowerCase());
  }
  const presentText = [...present].join(" | ");
  const out: MissingItem[] = [];
  for (const [name, pct, reason] of BENCHMARK[shopType] ?? []) {
    const key = name.split(/and|,/)[0].trim().toLowerCase();
    if (!presentText.includes(key)) out.push({ product_type: name, carried_by_similar_pct: pct, reason });
  }
  const seen = new Set(out.map((m) => m.product_type.toLowerCase()));
  for (const c of catalog) {
    const base = (c.product_type ?? c.garment_type ?? "").toLowerCase();
    for (const comp of COMPLEMENTARY[base] ?? []) {
      if (!presentText.includes(comp.toLowerCase()) && !seen.has(comp.toLowerCase())) {
        out.push({ product_type: comp, carried_by_similar_pct: 0.6, reason: `complements the ${base} you already stock` });
        seen.add(comp.toLowerCase());
      }
    }
  }
  return out.slice(0, 10);
}

// ---------- trending ----------

function seasonBucket(today = new Date()): "ramadan_eid" | "boishakh" | "winter" | "default" {
  const m = today.getMonth() + 1;
  if (m === 2 || m === 3) return "ramadan_eid";
  if (m === 4) return "boishakh";
  if (m === 12 || m === 1) return "winter";
  return "default";
}

const SEASONAL_TRENDS: Record<string, Record<string, [string, number][]>> = {
  ramadan_eid: {
    clothing: [["pastel three-piece", 0.34], ["embroidered panjabi", 0.28], ["kids Eid frock", 0.22]],
    beauty: [["attar perfume", 0.31], ["henna cones", 0.19]],
    food: [["premium dates", 0.4], ["iftar snack boxes", 0.27]],
  },
  boishakh: {
    clothing: [["red-and-white saree", 0.3], ["cotton panjabi", 0.21]],
    food: [["hilsa fish", 0.33], ["traditional sweets", 0.18]],
  },
  winter: {
    clothing: [["woolen shawl", 0.29], ["winter jacket", 0.24], ["warm caps", 0.17]],
    home: [["blanket", 0.26]],
  },
  default: {
    clothing: [["casual kurti", 0.12], ["graphic t-shirt", 0.09]],
    grocery: [["instant noodles", 0.1]],
    electronics: [["bluetooth earbuds", 0.14], ["smartwatch", 0.11]],
    beauty: [["face serum", 0.13]],
    home: [["kitchen storage set", 0.08]],
    food: [["specialty tea", 0.07]],
    pharmacy: [["vitamin supplements", 0.1]],
    stationery: [["art supplies", 0.06]],
  },
};
const DOWN_TRENDS: Record<string, [string, number][]> = {
  clothing: [["heavy bridal lehenga", -0.16], ["formal blazer", -0.09]],
  electronics: [["wired earphones", -0.18]],
  beauty: [["compact powder", -0.07]],
};

function trendsFromSales(shopType: string, sales: NonNullable<AnalyzeShopRequest["sales"]>): { up: TrendItem[]; down: TrendItem[] } {
  if (!sales?.length) return seasonalTrends(shopType);
  const today = new Date();
  const recent = new Map<string, number>();
  const prior = new Map<string, number>();
  for (const s of sales) {
    const d = new Date(s.date);
    if (isNaN(d.getTime())) continue;
    const age = daysBetween(d, today);
    const k = (s.product || "").trim();
    if (!k) continue;
    const q = Number(s.qty) || 1;
    if (age >= 0 && age < 30) recent.set(k, (recent.get(k) ?? 0) + q);
    else if (age >= 30 && age < 60) prior.set(k, (prior.get(k) ?? 0) + q);
  }
  const all = new Set([...recent.keys(), ...prior.keys()]);
  const scored: [string, number][] = [];
  for (const k of all) {
    const r = recent.get(k) ?? 0;
    const p = prior.get(k) ?? 0;
    if (r + p < 3) continue;
    scored.push([k, Math.round(((r - p) / Math.max(p, 1)) * 100) / 100]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  const up = scored.filter(([, m]) => m > 0.1).slice(0, 6).map(([k, m]) => ({ product_type: k, momentum: m }));
  const down = scored.filter(([, m]) => m < -0.1).slice(-6).map(([k, m]) => ({ product_type: k, momentum: m }));
  if (!up.length && !down.length) return seasonalTrends(shopType);
  return { up, down };
}

function seasonalTrends(shopType: string): { up: TrendItem[]; down: TrendItem[] } {
  const bucket = seasonBucket();
  const up = (SEASONAL_TRENDS[bucket]?.[shopType] ?? SEASONAL_TRENDS.default[shopType] ?? SEASONAL_TRENDS.default.clothing)
    .map(([k, m]) => ({ product_type: k, momentum: m }));
  const down = (DOWN_TRENDS[shopType] ?? []).map(([k, m]) => ({ product_type: k, momentum: m }));
  return { up, down };
}

// ---------- popular styles ----------

const STYLE_BANK: Record<string, { label: string; emoji: string; momentum: number; note: string }[]> = {
  ramadan_eid: [
    { label: "Embroidered three-piece", emoji: "👗", momentum: 0.31, note: "top seller in clothing shops before Eid" },
    { label: "Pastel cotton saree", emoji: "🥻", momentum: 0.26, note: "rising demand for light festive looks" },
    { label: "Designer panjabi", emoji: "👔", momentum: 0.24, note: "men's Eid staple" },
    { label: "Kids Eid frock", emoji: "👶", momentum: 0.2, note: "high-volume seasonal line" },
    { label: "Anarkali kurti", emoji: "👚", momentum: 0.18, note: "popular semi-formal option" },
  ],
  boishakh: [
    { label: "Red-and-white saree", emoji: "🥻", momentum: 0.3, note: "the Pohela Boishakh signature look" },
    { label: "White cotton panjabi", emoji: "👔", momentum: 0.22, note: "men's Boishakh staple" },
    { label: "Block-print kurti", emoji: "👚", momentum: 0.16, note: "traditional print, strong demand" },
  ],
  winter: [
    { label: "Woolen shawl", emoji: "🧣", momentum: 0.29, note: "Dec-Feb essential" },
    { label: "Quilted winter jacket", emoji: "🧥", momentum: 0.24, note: "best-selling outerwear" },
    { label: "Knit sweater", emoji: "🧶", momentum: 0.19, note: "steady winter demand" },
  ],
  default: [
    { label: "Casual cotton kurti", emoji: "👚", momentum: 0.12, note: "everyday best-seller" },
    { label: "Graphic t-shirt", emoji: "👕", momentum: 0.1, note: "popular with younger buyers" },
    { label: "Slim-fit shirt", emoji: "👔", momentum: 0.09, note: "office wear staple" },
    { label: "Printed three-piece", emoji: "👗", momentum: 0.11, note: "broad appeal year-round" },
  ],
};

function popularStylesFor(shopType: string): PopularStyle[] {
  if (shopType !== "clothing") return [];
  const items = STYLE_BANK[seasonBucket()] ?? STYLE_BANK.default;
  return items.map((it) => ({ ...it, sample_images: [] }));
}

// ---------- festival outlook ----------

function festivalOutlook(): FestivalOutlookItem[] {
  return festivalCalendar().map((f) => ({
    festival: f.name,
    date: f.date,
    advice: f.advice,
    expected_uplift: Math.round(f.peakBoost * 100) / 100,
    categories: [...f.categories],
  }));
}

// ---------- main entry ----------

export function analyzeShopStub(req: AnalyzeShopRequest): AnalyzeShopResponse {
  const listings = req.listings ?? [];
  const sales = req.sales ?? [];
  const shop_type = classifyShopType(listings);
  const catalog = listings.map(extractAttributes);
  const { selling_well, selling_poorly, restock_soon } = forecastFromInputs(listings, catalog, sales, shop_type.label);
  const missing_goods = missingGoodsFor(shop_type.label, catalog);
  const trending = sales.length ? trendsFromSales(shop_type.label, sales) : seasonalTrends(shop_type.label);
  const festival_outlook = festivalOutlook();
  const popular_styles = popularStylesFor(shop_type.label);

  const uploaded_image_analysis: UploadedImageAnalysis[] = (req.images ?? []).slice(0, 6).map((_, i) => {
    const top = popular_styles[0] ?? { label: "Casual cotton kurti", momentum: 0.12 };
    return {
      image_index: i,
      predicted_style: top.label,
      confidence: 0.5,
      trending: true,
      suggestions: [
        `${top.label} is trending this season; consider featuring it`,
        "deploy the fashion-image model for real per-photo classification",
      ],
    };
  });

  const notes: string[] = [];
  if (!sales.length) notes.push("No sales history provided — forecasts use category priors.");
  notes.push("Running on heuristic fallback. Wire ML_BACKEND_URL to switch to the trained models.");

  return {
    source: "heuristic-fallback",
    shop_type,
    catalog,
    selling_well,
    selling_poorly,
    restock_soon,
    missing_goods,
    trending,
    festival_outlook,
    popular_styles,
    uploaded_image_analysis,
    notes,
  };
}
