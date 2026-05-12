import { upcomingFestivals } from "@/lib/data/festivals";
import { getStore } from "@/lib/data/store";
import { rfmScores } from "./churn";
import type { Locale } from "@/lib/i18n/messages";

export type Audience = "all" | "dormant" | "vip" | "atrisk";
export type Goal = "winback" | "upsell" | "festival";
export type Channel = "whatsapp" | "sms" | "messenger";

export interface GeneratedMessage {
  audience: Audience;
  count: number;
  channel: Channel;
  bodyEn: string;
  bodyBn: string;
  cta: string;
  ctaBn: string;
}

export function audienceCount(a: Audience): number {
  if (a === "all") return getStore().customers.length;
  const seg = rfmScores();
  if (a === "vip") return seg.filter((s) => s.segment === "vip").length;
  if (a === "dormant") return seg.filter((s) => s.segment === "dormant").length;
  if (a === "atrisk") return seg.filter((s) => s.segment === "atrisk").length;
  return 0;
}

export function generateMessage(
  audience: Audience,
  goal: Goal,
  channel: Channel
): GeneratedMessage {
  const fests = upcomingFestivals(new Date(), 30);
  const festivalEn = fests[0]?.name;
  const festivalBn = fests[0]?.nameBn;

  let bodyEn = "";
  let bodyBn = "";
  let cta = "Shop now";
  let ctaBn = "এখনই কিনুন";

  if (goal === "winback") {
    bodyEn = `Hi {{name}}, we've missed you! Come back to {{shop}} and enjoy 15% off your next order. Your offer expires in 48 hours.`;
    bodyBn = `প্রিয় {{name}}, আপনাকে অনেক দিন দেখিনি! {{shop}}-এ ফিরে এসে পরবর্তী অর্ডারে ১৫% ছাড় উপভোগ করুন। অফার ৪৮ ঘণ্টা পর্যন্ত।`;
    cta = "Use code BACK15";
    ctaBn = "কুপন কোড: BACK15";
  } else if (goal === "upsell") {
    bodyEn = `Hi {{name}}, picked up something new lately? Our latest arrivals match your style. Pair it with our matching item and save 10%.`;
    bodyBn = `প্রিয় {{name}}, নতুন কিছু খুঁজছেন? আমাদের নতুন কালেকশন আপনার স্টাইলের সাথে মিলবে। মিলিয়ে নিন এবং ১০% ছাড় পান।`;
    cta = "View collection";
    ctaBn = "কালেকশন দেখুন";
  } else if (goal === "festival") {
    if (festivalEn) {
      bodyEn = `${festivalEn} Mubarak, {{name}}! Get exclusive ${festivalEn} arrivals at {{shop}}. Early-bird pricing this week only.`;
      bodyBn = `${festivalBn} মোবারক, {{name}}! {{shop}}-এ ${festivalBn} স্পেশাল কালেকশন। এ সপ্তাহে আর্লি-বার্ড দাম।`;
    } else {
      bodyEn = `Hi {{name}}, our seasonal collection is here. Get 12% off this week at {{shop}}.`;
      bodyBn = `প্রিয় {{name}}, নতুন সিজন কালেকশন এসেছে {{shop}}-এ। এ সপ্তাহে ১২% ছাড়।`;
    }
    cta = "See offers";
    ctaBn = "অফার দেখুন";
  }

  // SMS is shorter
  if (channel === "sms") {
    bodyEn = bodyEn.replace(/Your offer.*48 hours\./, "Limited offer.");
    bodyBn = bodyBn.replace(/অফার ৪৮ ঘণ্টা পর্যন্ত।/, "");
  }

  return {
    audience,
    count: audienceCount(audience),
    channel,
    bodyEn,
    bodyBn,
    cta,
    ctaBn,
  };
}

export function renderForLocale(g: GeneratedMessage, locale: Locale, sampleName = "Rashida") {
  const body = (locale === "bn" ? g.bodyBn : g.bodyEn)
    .replaceAll("{{name}}", sampleName)
    .replaceAll("{{shop}}", "আপনার দোকান");
  const cta = locale === "bn" ? g.ctaBn : g.cta;
  return { body, cta };
}
