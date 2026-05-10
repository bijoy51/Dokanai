import { NextResponse } from "next/server";

/**
 * Simulated khata OCR. Accepts a multipart upload and returns
 * a deterministic but realistic set of extracted records.
 * Real Vision OCR / Bangla NLP runs when an OPENAI_API_KEY is
 * configured (left as TODO so behavior is identical without keys).
 */

const SAMPLE_ITEMS_BN = [
  "শাড়ি",
  "পাঞ্জাবি",
  "চাল",
  "মসলা",
  "খেজুর",
  "চা",
  "মিষ্টি",
  "ফেস ক্রিম",
  "শ্যাম্পু",
  "টিভি কেবল",
];
const SAMPLE_ITEMS_EN = [
  "Saree",
  "Panjabi",
  "Rice",
  "Spice",
  "Dates",
  "Tea",
  "Sweets",
  "Face cream",
  "Shampoo",
  "TV cable",
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  const seed = file ? hashStr(file.name + file.size) : Date.now();

  // PRNG
  let s = seed;
  const rng = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };

  const today = new Date();
  const records: { date: string; itemEn: string; itemBn: string; qty: number; amount: number }[] = [];
  const count = 8 + Math.floor(rng() * 7); // 8..14
  for (let i = 0; i < count; i++) {
    const daysBack = Math.floor(rng() * 30);
    const d = new Date(today);
    d.setDate(today.getDate() - daysBack);
    const idx = Math.floor(rng() * SAMPLE_ITEMS_BN.length);
    const qty = 1 + Math.floor(rng() * 3);
    const amount = [120, 220, 340, 480, 750, 1100, 1850][Math.floor(rng() * 7)] * qty;
    records.push({
      date: d.toISOString().slice(0, 10),
      itemEn: SAMPLE_ITEMS_EN[idx],
      itemBn: SAMPLE_ITEMS_BN[idx],
      qty,
      amount,
    });
  }
  records.sort((a, b) => (a.date < b.date ? 1 : -1));

  // simulate processing latency
  await new Promise((r) => setTimeout(r, 700));

  return NextResponse.json({
    fileName: file?.name ?? "khata.jpg",
    fileSize: file?.size ?? 0,
    records,
    extractedAt: new Date().toISOString(),
  });
}
