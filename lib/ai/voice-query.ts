import { computeOverview } from "./overview";
import { segmentBreakdown } from "./churn";
import { forecastAll } from "./forecast";
import { festivalCalendar } from "./forecast";
import type { Locale } from "@/lib/i18n/messages";

/**
 * Romanized-Bengali markers ("Banglish") that strongly indicate the speaker
 * wanted Bengali. We keep this conservative — only tokens that have ~no
 * collision with normal English words. `ki` alone is too weak (collides
 * with "kid", "kit"), so it's only detected as part of multi-word phrases
 * like "tumi ki", "apni ki", "ki bolo", "ki ache".
 *
 * Multi-word entries are matched as substrings; single-word entries are
 * matched as whole word tokens via \b boundaries so we don't false-positive
 * on e.g. "amine" → "ami".
 */
const BN_PHONETIC_WORDS = [
  // pronouns
  "tumi", "ami", "amar", "tomar", "amra", "tomra", "apni", "apnar", "amake", "tomake", "apnara",
  // common verbs / aux
  "bolo", "bole", "bolen", "bolte", "boleche", "bolchhe",
  "ache", "achen", "ashe", "ashen", "ashben", "asbo", "korbo", "korben", "korchen", "korchi",
  "bujhi", "bujho", "bujhen", "bujhte", "paro", "paren", "parо",
  "shuni", "shuno", "khache", "khaben",
  // greetings + courtesy
  "salam", "namashkar", "namaskar", "dhonnobad", "dhonyobad", "dhonyabad",
  // question/wh words (multi-letter, low collision)
  "kemon", "kothay", "kobe", "keno", "kake",
  // domain nouns
  "bikri", "bikiri", "bangla", "bengali", "bangali", "dokan", "khoddor", "khodder",
  // adverbs / phrases from old list
  "sobcheye", "shobcheye", "shera", "okhane",
];

const BN_PHONETIC_PHRASES = [
  "aaj koto",
  "kotota",
  "kemon achen",
  "kemon acho",
  "kemon achi",
  "tumi ki",
  "apni ki",
  "ki ache",
  "ki khobor",
  "ki bolo",
  "ki bolen",
  "ki korben",
  "kothay theke",
  "bangla bolo",
  "bangla bolte",
  "bangla bujho",
  "bangla bujhte",
  "bangla paro",
  "bangla parо",
  "bangla janen",
  "bangla bujhen",
  "aamar dokan",
  "amar customer",
];

function hasBnPhonetic(text: string): boolean {
  const lower = text.toLowerCase();
  if (BN_PHONETIC_PHRASES.some((p) => lower.includes(p))) return true;
  for (const w of BN_PHONETIC_WORDS) {
    // Whole-word check; tolerate punctuation around the token.
    const re = new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, "i");
    if (re.test(lower)) return true;
  }
  return false;
}

/** Returns true if the text has unambiguous English signal words. Used as
 *  a tie-breaker when the user is on a Bengali UI but spoke English. */
function hasStrongEnglishSignal(text: string): boolean {
  return /\b(today|tomorrow|how|what|which|why|when|where|tell|show|please|the|and|with|from|about)\b/i.test(
    text,
  );
}

/** Lightweight intent classifier for short Bangla / English questions.
 *
 *  `uiLocale` is the locale the user has selected in the UI (en/bn). It is
 *  used ONLY when the text itself has no clear language signal — at which
 *  point we default to whatever the user picked. Spoken text with Bangla
 *  script or Banglish markers always wins. */
function detectIntent(q: string, uiLocale: Locale): { intent: string; lang: Locale } {
  const hasBnScript = /[ঀ-৿]/.test(q);
  const hasBnPhon = hasBnPhonetic(q);
  const hasEng = hasStrongEnglishSignal(q);

  let lang: Locale;
  if (hasBnScript || hasBnPhon) lang = "bn";
  else if (hasEng) lang = "en";
  else lang = uiLocale;

  // --- Conversational intents (checked BEFORE the data intents) ---

  // "do you speak Bengali?" / "tumi ki bangla bolo?" / "bangla bolte paro?"
  // / "বাংলা বলতে পারো?" — reply in Bengali no matter what.
  if (
    /\b(bangla|bengali|বাংলা)\b/i.test(q) &&
    /(speak|bolo|bolte|bujho|bujhte|janen|paro|parо|paren|know|understand|talk)/i.test(q)
  ) {
    return { intent: "language", lang: "bn" };
  }

  // "who are you?" / "what can you do?" / "tumi ke?" / "তুমি কে?"
  if (
    /\b(who are you|what are you|what can you do|what do you do|your name|tomar nam|tumi ke|tumi kara|nam ki|তুমি কে|তোমার নাম|কী করো|কী করতে পারো)\b/i.test(
      q,
    )
  ) {
    return { intent: "identity", lang };
  }

  // greetings
  if (/(^|\s)(hi|hello|hey|assalamu|salam|namaskar|namashkar|হ্যালো|হাই|সালাম|নমস্কার)(\s|!|\?|$)/i.test(q)) {
    return { intent: "greeting", lang };
  }

  // thanks
  if (/\b(thanks?|thank you|dhonnobad|dhonyobad|dhonyabad|ধন্যবাদ)\b/i.test(q)) {
    return { intent: "thanks", lang };
  }

  // --- Data intents (existing) ---

  if (/(top|সেরা|best.?selling|sera|top.?seller|sobcheye)/i.test(q)) return { intent: "top_product", lang };
  if (/(rto|return|ফেরত|return rate)/i.test(q)) return { intent: "rto", lang };
  if (/(churn|dormant|নিষ্ক্রিয়|atrisk|at.?risk)/i.test(q)) return { intent: "churn", lang };
  if (/(festival|উৎসব|ঈদ|পূজা|eid|puja|valentine)/i.test(q)) return { intent: "festival", lang };
  if (/(stock|মজুদ|inventory)/i.test(q)) return { intent: "stock", lang };
  if (/(revenue|sales|বিক্রি|আজ.*বিক্রি|aaj.*bikri|today)/i.test(q)) return { intent: "revenue", lang };
  if (/(orders|কতটা.?অর্ডার|how many orders|order count)/i.test(q)) return { intent: "orders", lang };
  if (/(customer|ক্রেতা|গ্রাহক)/i.test(q)) return { intent: "customers", lang };
  if (/(forecast|পূর্বাভাস|next week|আগামী)/i.test(q)) return { intent: "forecast", lang };

  return { intent: "fallback", lang };
}

export interface VoiceAnswer {
  text: string;
  detectedLang: Locale;
  intent: string;
}

export function answerQuery(question: string, uiLocale: Locale = "en"): VoiceAnswer {
  const { intent, lang } = detectIntent(question, uiLocale);

  // ---------------- conversational intents ----------------

  if (intent === "language") {
    return {
      intent,
      detectedLang: "bn",
      text: "হ্যাঁ, আমি বাংলায় কথা বলতে পারি। আপনি বাংলায় বা ইংরেজিতে বিক্রি, অর্ডার, ক্রেতা, স্টক, RTO, পূর্বাভাস ও উৎসব নিয়ে প্রশ্ন করতে পারেন।",
    };
  }

  if (intent === "identity") {
    return {
      intent,
      detectedLang: lang,
      text:
        lang === "bn"
          ? "আমি DokanAI-এর ভয়েস কো-পাইলট। আপনি বিক্রি, অর্ডার, ক্রেতা, স্টক, RTO, পূর্বাভাস ও উৎসব নিয়ে আমাকে প্রশ্ন করতে পারেন।"
          : "I am DokanAI's voice co-pilot. Ask me about revenue, orders, customers, stock, RTO, forecasts, and festivals.",
    };
  }

  if (intent === "greeting") {
    return {
      intent,
      detectedLang: lang,
      text:
        lang === "bn"
          ? "সালাম! আজ কীভাবে সাহায্য করতে পারি?"
          : "Hi! How can I help you today?",
    };
  }

  if (intent === "thanks") {
    return {
      intent,
      detectedLang: lang,
      text: lang === "bn" ? "স্বাগতম! আরও কিছু জিজ্ঞেস করুন।" : "You're welcome! Ask me anything else.",
    };
  }

  // ---------------- data intents ----------------

  if (intent === "revenue") {
    const m = computeOverview();
    const today = new Date().toISOString().slice(0, 10).slice(5);
    const todayRev = m.daily.find((d) => d.date === today)?.revenue ?? m.daily[m.daily.length - 1].revenue;
    return {
      intent,
      detectedLang: lang,
      text:
        lang === "bn"
          ? `আজ পর্যন্ত প্রায় ${Math.round(todayRev).toLocaleString("bn-BD")} টাকা বিক্রি হয়েছে। গত ৩০ দিনে মোট ${Math.round(m.revenue30).toLocaleString("bn-BD")} টাকা।`
          : `Today's revenue is around ৳${Math.round(todayRev).toLocaleString()}. Last 30 days total: ৳${Math.round(m.revenue30).toLocaleString()}.`,
    };
  }

  if (intent === "orders") {
    const m = computeOverview();
    return {
      intent,
      detectedLang: lang,
      text:
        lang === "bn"
          ? `গত ৩০ দিনে মোট ${m.orders30} টি অর্ডার এসেছে।`
          : `In the last 30 days you've received ${m.orders30} orders.`,
    };
  }

  if (intent === "top_product") {
    const all = forecastAll();
    const ranked = [...all].sort((a, b) => b.forecastNext7 - a.forecastNext7).slice(0, 3);
    if (lang === "bn") {
      const list = ranked.map((r) => r.nameBn).join(", ");
      return {
        intent,
        detectedLang: lang,
        text: `আগামী সপ্তাহের সেরা পণ্য: ${list}। শীর্ষ পণ্যের ৭ দিনের অনুমিত বিক্রি ${ranked[0]?.forecastNext7} ইউনিট।`,
      };
    }
    const list = ranked.map((r) => r.name).join(", ");
    return {
      intent,
      detectedLang: lang,
      text: `Top movers next week: ${list}. The leader is forecast at ${ranked[0]?.forecastNext7} units.`,
    };
  }

  if (intent === "rto") {
    const m = computeOverview();
    return {
      intent,
      detectedLang: lang,
      text:
        lang === "bn"
          ? `আপনার বর্তমান RTO হার ${m.rtoRate.toFixed(1)} শতাংশ। উচ্চ-ঝুঁকির অর্ডারে অগ্রিম পেমেন্ট চাইলে এটি কমাতে পারেন।`
          : `Your current RTO rate is ${m.rtoRate.toFixed(1)}%. Requiring advance payment for high-risk orders reduces it.`,
    };
  }

  if (intent === "churn") {
    const seg = segmentBreakdown();
    const dormant = seg.find((s) => s.segment === "dormant")?.count ?? 0;
    const atrisk = seg.find((s) => s.segment === "atrisk")?.count ?? 0;
    return {
      intent,
      detectedLang: lang,
      text:
        lang === "bn"
          ? `${dormant} জন ক্রেতা নিষ্ক্রিয় এবং ${atrisk} জন ঝুঁকিতে আছেন। অটো-মার্কেটিং থেকে উইন-ব্যাক ক্যাম্পেইন পাঠান।`
          : `${dormant} customers are dormant and ${atrisk} are at risk. Send a win-back campaign from Auto-Marketing.`,
    };
  }

  if (intent === "festival") {
    const fests = festivalCalendar();
    if (fests.length === 0) {
      return {
        intent,
        detectedLang: lang,
        text: lang === "bn" ? "আগামী ৬০ দিনে কোনো বড় উৎসব নেই।" : "No major festivals in the next 60 days.",
      };
    }
    const f = fests[0];
    return {
      intent,
      detectedLang: lang,
      text:
        lang === "bn"
          ? `আসন্ন উৎসব: ${f.nameBn}, ${f.date}। ${f.adviceBn}`
          : `Next festival: ${f.name} on ${f.date}. ${f.advice}`,
    };
  }

  if (intent === "stock") {
    const all = forecastAll();
    const low = all.filter((a) => a.daysOfStock < 7 && a.stock > 0).sort((a, b) => a.daysOfStock - b.daysOfStock).slice(0, 3);
    if (low.length === 0) {
      return { intent, detectedLang: lang, text: lang === "bn" ? "কোনো পণ্যের তাত্ক্ষণিক স্টক ঝুঁকি নেই।" : "No immediate stock risks." };
    }
    const list = low.map((p) => (lang === "bn" ? p.nameBn : p.name)).join(", ");
    return {
      intent,
      detectedLang: lang,
      text:
        lang === "bn"
          ? `কম স্টক: ${list}। শিগগিরই রিস্টক করুন।`
          : `Running low: ${list}. Restock soon.`,
    };
  }

  if (intent === "customers") {
    const seg = segmentBreakdown();
    const vip = seg.find((s) => s.segment === "vip")?.count ?? 0;
    return {
      intent,
      detectedLang: lang,
      text:
        lang === "bn"
          ? `আপনার ${vip} জন ভিআইপি ক্রেতা আছেন। ক্রেতা ট্যাবে বিস্তারিত দেখুন।`
          : `You have ${vip} VIP customers. See the Customers tab for full breakdown.`,
    };
  }

  if (intent === "forecast") {
    const all = forecastAll();
    const total7 = all.reduce((s, a) => s + a.forecastNext7, 0);
    return {
      intent,
      detectedLang: lang,
      text:
        lang === "bn"
          ? `আগামী ৭ দিনে আনুমানিক ${total7} ইউনিট বিক্রি হবে।`
          : `Forecast: about ${total7} units sold across all products in the next 7 days.`,
    };
  }

  return {
    intent: "fallback",
    detectedLang: lang,
    text:
      lang === "bn"
        ? "আমি বিক্রি, অর্ডার, ক্রেতা, স্টক, RTO, পূর্বাভাস ও উৎসব নিয়ে প্রশ্নের উত্তর দিতে পারি। আবার চেষ্টা করুন।"
        : "I can answer about revenue, orders, customers, stock, RTO, forecast, and festivals. Try again.",
  };
}
