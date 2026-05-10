import type { Festival } from "@/lib/types";

// Bangladesh festival calendar 2026 (key dates).
// Used by the Festival Intelligence engine to pre-alert SMEs.
export const FESTIVALS: Festival[] = [
  {
    id: "ramadan-start",
    name: "Ramadan begins",
    nameBn: "রমজান শুরু",
    date: "2026-02-18",
    leadDays: 14,
    peakBoost: 2.4,
    categories: ["food", "clothing"],
    advice: "Stock up on dates, perfumes, prayer items, iftar essentials.",
    adviceBn: "খেজুর, পারফিউম, ইফতারের সামগ্রী মজুত বাড়ান।",
  },
  {
    id: "eid-ul-fitr",
    name: "Eid-ul-Fitr",
    nameBn: "ঈদ-উল-ফিতর",
    date: "2026-03-20",
    leadDays: 21,
    peakBoost: 3.2,
    categories: ["clothing", "beauty", "food"],
    advice: "Eid is the year's biggest sales window. Stock new collections, fragrances, sweets.",
    adviceBn: "বছরের সবচেয়ে বড় বিক্রির সময়। নতুন কালেকশন, পারফিউম, মিষ্টি মজুত রাখুন।",
  },
  {
    id: "pohela-boishakh",
    name: "Pohela Boishakh",
    nameBn: "পহেলা বৈশাখ",
    date: "2026-04-14",
    leadDays: 10,
    peakBoost: 2.0,
    categories: ["clothing", "food", "home"],
    advice: "Push red-and-white themed sarees, panjabis, hilsa, traditional foods.",
    adviceBn: "লাল-সাদা শাড়ি, পাঞ্জাবি, ইলিশ, ঐতিহ্যবাহী খাবার প্রোমোট করুন।",
  },
  {
    id: "eid-ul-adha",
    name: "Eid-ul-Adha",
    nameBn: "ঈদ-উল-আযহা",
    date: "2026-05-27",
    leadDays: 14,
    peakBoost: 2.6,
    categories: ["clothing", "home", "food"],
    advice: "Stock cooking essentials, knives, freezer storage, festive clothing.",
    adviceBn: "রান্নার সামগ্রী, ছুরি, ফ্রিজার ব্যাগ, উৎসবের পোশাক মজুত করুন।",
  },
  {
    id: "durga-puja",
    name: "Durga Puja",
    nameBn: "দুর্গা পূজা",
    date: "2026-10-19",
    leadDays: 14,
    peakBoost: 2.2,
    categories: ["clothing", "beauty", "home"],
    advice: "Sarees, jewellery, sweets, decorative items see major lift.",
    adviceBn: "শাড়ি, গহনা, মিষ্টি, সাজসজ্জার সামগ্রীর চাহিদা বাড়ে।",
  },
  {
    id: "winter-collection",
    name: "Winter season",
    nameBn: "শীতকাল",
    date: "2026-12-15",
    leadDays: 30,
    peakBoost: 1.6,
    categories: ["clothing", "home"],
    advice: "Push blankets, jackets, warmers. Demand grows steadily Dec-Feb.",
    adviceBn: "কম্বল, জ্যাকেট, হিটার বিক্রি বাড়ান। ডিসেম্বর-ফেব্রুয়ারিতে চাহিদা বাড়ে।",
  },
  {
    id: "valentines",
    name: "Valentine's Day",
    nameBn: "ভ্যালেন্টাইনস ডে",
    date: "2026-02-14",
    leadDays: 7,
    peakBoost: 1.8,
    categories: ["beauty", "clothing"],
    advice: "Gift bundles, perfumes, jewellery, flowers move fast in urban markets.",
    adviceBn: "গিফট বান্ডেল, পারফিউম, গহনা, ফুলের বিক্রি শহরাঞ্চলে বাড়ে।",
  },
];

/** Returns a festival demand multiplier for a given date and category. */
export function festivalBoost(
  date: Date,
  category: string
): { boost: number; festivalId: string | null } {
  let totalBoost = 1.0;
  let dominantId: string | null = null;
  let strongest = 1.0;

  for (const f of FESTIVALS) {
    if (!f.categories.includes(category as never)) continue;
    const fDate = new Date(f.date);
    const diff = Math.floor(
      (fDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );
    // boost ramps up over leadDays, peaks at festival, decays after 3 days
    if (diff <= f.leadDays && diff >= -3) {
      const ramp =
        diff >= 0 ? (f.leadDays - diff) / f.leadDays : Math.max(0, 1 + diff / 3);
      const factor = 1 + (f.peakBoost - 1) * Math.max(0, ramp);
      totalBoost *= factor;
      if (factor > strongest) {
        strongest = factor;
        dominantId = f.id;
      }
    }
  }
  return { boost: totalBoost, festivalId: dominantId };
}

/** Returns festivals upcoming within `days` from `from`. */
export function upcomingFestivals(from: Date, days = 60): Festival[] {
  const cutoff = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  return FESTIVALS.filter((f) => {
    const d = new Date(f.date);
    return d >= from && d <= cutoff;
  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
