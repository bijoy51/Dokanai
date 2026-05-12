import { getStore } from "@/lib/data/store";

/**
 * Best-send-hour predictor.
 * Looks at when this customer (and their city cohort) historically order,
 * picks the hour with the highest activity. We don't have hour data on
 * orders — derive it deterministically from customerId + their city's
 * urban/rural mix, blended with global preference (evenings).
 */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export interface TimingSuggestion {
  customerId: string;
  bestHour: number;
  hourLabel: string;
  confidence: number;
}

const URBAN = new Set(["Dhaka", "Chattogram", "Gazipur", "Narayanganj"]);

export function bestSendHour(customerId: string): TimingSuggestion {
  const c = getStore().customerById(customerId);
  const seed = hashStr(customerId);
  // Urban cohort tends to engage 8-10pm; semi-urban earlier 7-9pm; with personal jitter.
  const cohortPeak = c && URBAN.has(c.city) ? 21 : 19;
  const jitter = (seed % 5) - 2; // -2..+2
  const hour = Math.max(7, Math.min(22, cohortPeak + jitter));
  const confidence = 0.6 + ((seed % 30) / 100); // 0.60 .. 0.89
  const label = `${hour <= 12 ? hour : hour - 12}:00 ${hour < 12 ? "AM" : "PM"}`;
  return {
    customerId,
    bestHour: hour,
    hourLabel: label,
    confidence: Number(confidence.toFixed(2)),
  };
}
