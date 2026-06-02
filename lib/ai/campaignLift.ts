import { getStore } from "@/lib/data/store";
import { resolveAudience } from "@/lib/email/audience";
import { listCampaigns, type Campaign } from "@/lib/agent/store";

/**
 * Campaign conversion-lift estimator.
 *
 * For each completed (status = "sent" | "partial") email campaign we compare
 * the audience's purchase activity in the 14 days AFTER the campaign was sent
 * vs. the 14 days BEFORE. The output is a per-campaign lift% plus a roll-up
 * across all measurable campaigns.
 *
 * Important caveats baked into the methodology:
 *
 *   - This is a NAIVE pre/post estimate, not a true causal experiment. We
 *     don't run holdouts, so the numbers double-count any seasonal trend
 *     that overlaps the after-window. The card surfaces both raw numbers
 *     so the merchant can sanity-check.
 *
 *   - We re-resolve the audience NOW (using the current customer table)
 *     because we don't snapshot recipient lists per campaign. For audiences
 *     defined by RFM segments this is usually stable across two weeks, but
 *     re-imports can shift membership. Acceptable for v1.
 *
 *   - Campaigns whose finishedAt < 14 days ago are excluded ("too soon to
 *     measure"). Campaigns older than 90 days are also excluded ("post-
 *     window already drifted into next-month seasonality").
 */

const MS_DAY = 86_400_000;
const WINDOW_DAYS = 14;

export interface CampaignLift {
  campaignId: string;
  subject: string;
  audience: string;
  sentAt: string;
  recipients: number;
  revenueBefore: number;
  revenueAfter: number;
  ordersBefore: number;
  ordersAfter: number;
  liftPct: number;
}

export interface LiftRollup {
  campaigns: CampaignLift[];
  totalRevenueBefore: number;
  totalRevenueAfter: number;
  totalOrdersBefore: number;
  totalOrdersAfter: number;
  weightedLiftPct: number;
  /** Campaigns we couldn't measure yet because <14 days have passed. */
  pendingCount: number;
}

function isoDateAt(epoch: number): string {
  return new Date(epoch).toISOString().slice(0, 10);
}

function measure(campaign: Campaign): CampaignLift | "pending" | "skip" {
  const pivot = campaign.finishedAt ?? campaign.scheduledFor;
  if (!pivot) return "skip";
  const pivotEpoch = new Date(pivot).getTime();
  if (Number.isNaN(pivotEpoch)) return "skip";

  const ageDays = (Date.now() - pivotEpoch) / MS_DAY;
  if (ageDays < WINDOW_DAYS) return "pending";
  if (ageDays > 90) return "skip";
  if (campaign.status !== "sent" && campaign.status !== "partial") return "skip";

  const audience = resolveAudience(campaign.audience);
  if (audience.recipients.length === 0) return "skip";
  const recipientIds = new Set(audience.recipients.map((r) => r.customerId));

  const beforeStart = isoDateAt(pivotEpoch - WINDOW_DAYS * MS_DAY);
  const beforeEnd = isoDateAt(pivotEpoch);
  const afterStart = isoDateAt(pivotEpoch);
  const afterEnd = isoDateAt(pivotEpoch + WINDOW_DAYS * MS_DAY);

  let revBefore = 0;
  let revAfter = 0;
  let ordBefore = 0;
  let ordAfter = 0;
  const store = getStore();
  for (const o of store.orders) {
    if (!recipientIds.has(o.customerId)) continue;
    if (o.status === "cancelled" || o.status === "rto") continue;
    if (o.date > beforeStart && o.date <= beforeEnd) {
      revBefore += o.total;
      ordBefore += 1;
    } else if (o.date > afterStart && o.date <= afterEnd) {
      revAfter += o.total;
      ordAfter += 1;
    }
  }

  const liftPct =
    revBefore > 0 ? ((revAfter - revBefore) / revBefore) * 100 : revAfter > 0 ? 100 : 0;

  return {
    campaignId: campaign.id,
    subject: campaign.subject ?? campaign.message.slice(0, 60),
    audience: campaign.audience,
    sentAt: isoDateAt(pivotEpoch),
    recipients: audience.recipients.length,
    revenueBefore: Math.round(revBefore),
    revenueAfter: Math.round(revAfter),
    ordersBefore: ordBefore,
    ordersAfter: ordAfter,
    liftPct: Number(liftPct.toFixed(1)),
  };
}

export async function campaignLiftRollup(email: string): Promise<LiftRollup> {
  const campaigns = await listCampaigns(email);
  const measurable: CampaignLift[] = [];
  let pending = 0;
  for (const c of campaigns) {
    const r = measure(c);
    if (r === "pending") pending += 1;
    else if (r !== "skip") measurable.push(r);
  }

  const totalBefore = measurable.reduce((s, x) => s + x.revenueBefore, 0);
  const totalAfter = measurable.reduce((s, x) => s + x.revenueAfter, 0);
  const totalOB = measurable.reduce((s, x) => s + x.ordersBefore, 0);
  const totalOA = measurable.reduce((s, x) => s + x.ordersAfter, 0);

  const weightedLift =
    totalBefore > 0
      ? ((totalAfter - totalBefore) / totalBefore) * 100
      : totalAfter > 0
      ? 100
      : 0;

  return {
    campaigns: measurable.sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1)).slice(0, 6),
    totalRevenueBefore: Math.round(totalBefore),
    totalRevenueAfter: Math.round(totalAfter),
    totalOrdersBefore: totalOB,
    totalOrdersAfter: totalOA,
    weightedLiftPct: Number(weightedLift.toFixed(1)),
    pendingCount: pending,
  };
}
