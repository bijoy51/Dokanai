/**
 * Server-side extraction of shop data from photos or PDFs.
 *
 * Two entry points:
 *   - extractFromImages(images): GPT-4o-mini vision reads each photo
 *     (receipt, handwritten ledger, m-banking screenshot, Excel shot,
 *     etc.) and returns a single merged { products, sales } shape that
 *     matches what the CSV importer (lib/data/imported.ts) already
 *     understands.
 *   - extractFromPdf(buffer): pdf-parse pulls all selectable text out
 *     of the PDF; the same model then structures it into products+sales.
 *
 * The output shape is intentionally identical to what KhataUploader
 * builds from CSV rows so the existing POST /api/import endpoint can
 * accept either path with zero changes.
 *
 * Requires OPENAI_API_KEY (already set on the project — same key the
 * Pilot agent uses).
 */

import type { RawProduct, RawSale } from "@/lib/data/imported";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const TIMEOUT_MS = 90_000;

/** Hard caps so a runaway model response can't blow our memory. */
const MAX_PRODUCTS = 500;
const MAX_SALES = 2000;

export interface Extracted {
  products: RawProduct[];
  sales: RawSale[];
  /** Free-text note from the model if it couldn't read parts of the
   *  source (e.g. "page 3 was blurry, no rows extracted"). Surfaced in
   *  the UI so the user knows whether to retry with better photos. */
  notes: string;
}

// ---------------------------------------------------------------------------
// Shared prompt + JSON schema. Centralised so photos and PDF behave the same.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an extraction assistant for a Bangladeshi small-shop dashboard called DokanAI.

Your one job: read the user's source (photos of a paper ledger / receipts / phone screenshots / Excel exports, OR text extracted from a PDF) and output a JSON object with two arrays — products and sales — that mirror what a CSV importer expects.

RULES
- products: each row is one distinct catalogue item the user sells. Fields: name (required), category (one of: clothing, electronics, beauty, food, home — pick the best fit; default to "home"), price (BDT integer), stock (integer, default 0 if unknown), cost (BDT integer, optional).
- sales: each row is one sale event. Fields: date (YYYY-MM-DD), product (the product name as written; must reference one of the products above OR be a new product, in which case ALSO add it to products), qty (integer >= 1), unit_price (BDT integer), customer (optional name), email (optional), payment ("cash" | "cod" | "bkash" | "nagad" | "card" — best guess), status ("delivered" | "pending" | "rto" | "cancelled" — default "delivered" unless the source clearly says otherwise), city (optional).
- Bangla and English mixed text is normal. Normalise product names to title-case English when possible; if not possible, keep the Bangla word.
- All currency values are integers (no decimals). 100tk written as "১০০" or "100" -> 100.
- Dates: convert any date format you see (২৬/০৫/২০২৬, "26 May 2026", "May 26", etc.) to ISO YYYY-MM-DD. If the year is missing, assume the current year.
- If a row is illegible or contradictory, SKIP it. Do not fabricate.
- If the source is empty or unintelligible, return empty arrays and put a one-sentence explanation in "notes".
- Hard cap: do not output more than 500 products or 2000 sales rows.

OUTPUT FORMAT: a single JSON object matching the schema. No prose, no markdown fences.`;

// JSON schema we hand to the OpenAI structured-output mode so it can't
// drift away from the shape the CSV importer expects.
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["products", "sales", "notes"],
  properties: {
    products: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name"],
        properties: {
          name: { type: "string" },
          category: { type: "string" },
          price: { type: "number" },
          cost: { type: "number" },
          stock: { type: "number" },
        },
      },
    },
    sales: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "product"],
        properties: {
          date: { type: "string" },
          product: { type: "string" },
          qty: { type: "number" },
          unit_price: { type: "number" },
          customer: { type: "string" },
          email: { type: "string" },
          payment: { type: "string" },
          status: { type: "string" },
          city: { type: "string" },
        },
      },
    },
    notes: { type: "string" },
  },
} as const;

function apiKey(): string {
  const k = process.env.OPENAI_API_KEY?.trim();
  if (!k) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Photos / PDF import needs it to read the source. Add it in Vercel project env and redeploy.",
    );
  }
  return k;
}

interface OAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

async function callOpenAI(messages: unknown[]): Promise<Extracted> {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages,
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: { name: "shop_import", strict: false, schema: OUTPUT_SCHEMA },
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = (await res.json()) as OAIChatResponse;
  if (!res.ok) {
    throw new Error(data.error?.message || `OpenAI request failed (${res.status})`);
  }
  const text = data.choices?.[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Model did not return parseable JSON. Try with clearer photos or a smaller PDF.");
  }
  return normalise(parsed);
}

function normalise(raw: unknown): Extracted {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const productsIn = Array.isArray(obj.products) ? obj.products : [];
  const salesIn = Array.isArray(obj.sales) ? obj.sales : [];
  const notes = typeof obj.notes === "string" ? obj.notes : "";

  const products: RawProduct[] = [];
  for (const p of productsIn) {
    if (products.length >= MAX_PRODUCTS) break;
    const o = p as Record<string, unknown>;
    const name = String(o.name ?? "").trim();
    if (!name) continue;
    products.push({
      name,
      category: o.category != null ? String(o.category).toLowerCase() : undefined,
      price: o.price != null ? Number(o.price) : undefined,
      cost: o.cost != null ? Number(o.cost) : undefined,
      stock: o.stock != null ? Number(o.stock) : undefined,
    });
  }

  const sales: RawSale[] = [];
  for (const s of salesIn) {
    if (sales.length >= MAX_SALES) break;
    const o = s as Record<string, unknown>;
    const date = String(o.date ?? "").trim();
    const product = String(o.product ?? "").trim();
    if (!date || !product) continue;
    sales.push({
      date,
      product,
      qty: o.qty != null ? Number(o.qty) : undefined,
      unit_price: o.unit_price != null ? Number(o.unit_price) : undefined,
      customer: o.customer != null ? String(o.customer) : undefined,
      email: o.email != null ? String(o.email) : undefined,
      payment: o.payment != null ? String(o.payment) : undefined,
      status: o.status != null ? String(o.status) : undefined,
      city: o.city != null ? String(o.city) : undefined,
    });
  }

  return { products, sales, notes };
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

interface ImageFile {
  /** MIME type, e.g. "image/jpeg" / "image/png". */
  mime: string;
  /** Raw bytes. */
  bytes: Uint8Array;
}

/** OpenAI vision accepts these image MIME types. Anything else is skipped. */
const SUPPORTED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function extractFromImages(images: ImageFile[]): Promise<Extracted> {
  const usable = images.filter((i) => SUPPORTED_IMAGE_MIME.has(i.mime));
  if (usable.length === 0) {
    throw new Error("No supported images provided. Upload JPEG, PNG, WebP, or GIF.");
  }
  const userContent: Array<Record<string, unknown>> = [
    {
      type: "text",
      text:
        usable.length === 1
          ? "Read this photo of the shop's records and extract products + sales as JSON per the schema."
          : `Read these ${usable.length} photos of the shop's records (they are different pages / receipts of the same shop) and extract a single merged products + sales JSON per the schema.`,
    },
  ];
  for (const img of usable) {
    const b64 = Buffer.from(img.bytes).toString("base64");
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${img.mime};base64,${b64}`, detail: "auto" },
    });
  }
  return callOpenAI([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ]);
}

export async function extractFromPdf(pdfBytes: Uint8Array): Promise<Extracted> {
  // unpdf is the serverless-safe replacement for pdf-parse — it wraps
  // pdfjs-dist without spawning a worker, which is what was crashing
  // pdf-parse v2 on Vercel's Node runtime. Lazy-imported so the
  // photos path doesn't pay the load cost.
  const { extractText } = await import("unpdf");
  const result = await extractText(new Uint8Array(pdfBytes), { mergePages: true });
  // extractText returns { text: string | string[], totalPages: number }
  // when mergePages=true it's a single string; otherwise a per-page array.
  const text = (Array.isArray(result.text) ? result.text.join("\n") : result.text || "").trim();
  if (text.length < 20) {
    throw new Error(
      "Couldn't read any text from the PDF — it may be a scanned image. Try uploading the pages as Photos instead.",
    );
  }
  // Cap the text we send so we don't burn tokens / hit context limits on
  // huge multi-page PDFs. ~50k chars is a few dozen ledger pages.
  const truncated = text.slice(0, 50_000);
  return callOpenAI([
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Below is the text extracted from a PDF of the shop's records. Extract products + sales as JSON per the schema.\n\n--- PDF TEXT START ---\n${truncated}\n--- PDF TEXT END ---`,
    },
  ]);
}
