/**
 * Tools the Pilot agent can call. Each tool wraps an already-shipped
 * lib/ai/* function or a small read off lib/data/store, so the answers
 * the agent gives always match what the dashboard shows. Adding a tool
 * here automatically makes it callable by the LLM via /api/agent/chat.
 *
 * Each tool MUST be JSON-serializable in/out and side-effect-free except
 * for the explicitly-marked "act" tools (e.g. schedule_marketing_campaign).
 */
import { getStore } from "@/lib/data/store";
import { computeOverview, recentOrders } from "@/lib/ai/overview";
import { rfmScores, segmentBreakdown, type Segment } from "@/lib/ai/churn";
import { pendingCodRisks, rtoSummaryProjection } from "@/lib/ai/rto";
import { priceRecommendations, bundleRecommendations } from "@/lib/ai/pricing";
import { recommendForCustomer, customerSummaries } from "@/lib/ai/recommend";
import { forecastAll, dailyForecastTotal } from "@/lib/ai/forecast";
import {
  audienceCount,
  generateMessage,
  type Audience,
  type Channel as MarketingChannel,
  type Goal,
} from "@/lib/ai/marketing";
import { addCampaign, listCampaigns, type CampaignChannel } from "@/lib/agent/store";

export interface ToolContext {
  email: string;
}

export interface Tool<TArgs = Record<string, unknown>> {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments (OpenAI function-calling format). */
  parameters: Record<string, unknown>;
  run: (args: TArgs, ctx: ToolContext) => Promise<unknown> | unknown;
}

const limit = (n: unknown, def: number, max: number) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return def;
  return Math.min(Math.floor(v), max);
};

export const TOOLS: Tool[] = [
  // ---------- read: overview ----------
  {
    name: "get_shop_overview",
    description:
      "Top-line KPIs for the signed-in shop over the last 30 days: revenue, orders, repeat-purchase rate, RTO rate, and per-day revenue for the last ~30 days. Use this when the user asks how the shop is doing, sales summary, or general performance.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    run: () => {
      const m = computeOverview();
      const recent = recentOrders(5);
      return {
        revenue_last_30d: m.revenue30,
        revenue_prev_30d: m.revenuePrev30,
        orders_last_30d: m.orders30,
        orders_prev_30d: m.ordersPrev30,
        repeat_rate: m.repeatRate,
        rto_rate: m.rtoRate,
        daily: m.daily,
        recent_orders: recent,
      };
    },
  },

  // ---------- read: customers ----------
  {
    name: "list_customers_by_segment",
    description:
      "List customers in a given segment from the RFM (recency-frequency-monetary) churn model. Use 'atrisk' for the 'who is at risk?' question, 'vip' for top buyers, 'dormant' for win-back candidates.",
    parameters: {
      type: "object",
      properties: {
        segment: { type: "string", enum: ["vip", "loyal", "atrisk", "dormant", "new"] },
        limit: { type: "number", description: "Max rows to return (default 20, max 100)" },
      },
      required: ["segment"],
      additionalProperties: false,
    },
    run: (args) => {
      const seg = String((args as { segment: Segment }).segment) as Segment;
      const n = limit((args as { limit?: number }).limit, 20, 100);
      const all = rfmScores().filter((c) => c.segment === seg);
      all.sort((a, b) => b.monetary - a.monetary);
      return { segment: seg, count: all.length, customers: all.slice(0, n) };
    },
  },
  {
    name: "get_segment_breakdown",
    description: "Counts of customers in each RFM segment (vip / loyal / atrisk / dormant / new).",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    run: () => segmentBreakdown(),
  },
  {
    name: "list_top_customers",
    description: "Top customers by lifetime spend, with last-order date and order count.",
    parameters: {
      type: "object",
      properties: { limit: { type: "number", description: "default 10, max 50" } },
      additionalProperties: false,
    },
    run: (args) => {
      const n = limit((args as { limit?: number }).limit, 10, 50);
      return customerSummaries(n);
    },
  },
  {
    name: "list_recommendations_for_customer",
    description:
      "Personalised product recommendations for a specific customer (use customer id from list_top_customers / list_customers_by_segment).",
    parameters: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        limit: { type: "number", description: "default 6, max 20" },
      },
      required: ["customer_id"],
      additionalProperties: false,
    },
    run: (args) => {
      const a = args as { customer_id: string; limit?: number };
      return recommendForCustomer(a.customer_id, limit(a.limit, 6, 20));
    },
  },

  // ---------- read: products / inventory ----------
  {
    name: "list_top_products",
    description: "Best-selling products by units sold in the last 60 days.",
    parameters: {
      type: "object",
      properties: { limit: { type: "number", description: "default 10, max 50" } },
      additionalProperties: false,
    },
    run: (args) => {
      const n = limit((args as { limit?: number }).limit, 10, 50);
      const store = getStore();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 60);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const units = new Map<string, number>();
      const revenue = new Map<string, number>();
      for (const o of store.orders) {
        if (o.date < cutoffStr) continue;
        for (const it of o.items) {
          units.set(it.productId, (units.get(it.productId) ?? 0) + it.qty);
          revenue.set(it.productId, (revenue.get(it.productId) ?? 0) + it.qty * it.unitPrice);
        }
      }
      const rows = Array.from(units.entries())
        .map(([id, u]) => {
          const p = store.productById(id);
          return { id, name: p?.name ?? id, category: p?.category, units: u, revenue: revenue.get(id) ?? 0, stock: p?.stock ?? 0 };
        })
        .sort((a, b) => b.units - a.units)
        .slice(0, n);
      return rows;
    },
  },
  {
    name: "list_low_stock",
    description: "Products at risk of running out — sorted by lowest stock-cover (stock / recent daily demand).",
    parameters: {
      type: "object",
      properties: { limit: { type: "number", description: "default 10, max 50" } },
      additionalProperties: false,
    },
    run: (args) => {
      const n = limit((args as { limit?: number }).limit, 10, 50);
      const forecasts = forecastAll();
      const rows = forecasts
        .filter((f) => f.stock >= 0)
        .map((f) => ({
          id: f.productId,
          name: f.name,
          stock: f.stock,
          forecast_7d: f.forecastNext7,
          days_of_stock: f.daysOfStock,
        }))
        .sort((a, b) => a.days_of_stock - b.days_of_stock)
        .slice(0, n);
      return rows;
    },
  },

  // ---------- read: pricing & bundles ----------
  {
    name: "list_pricing_suggestions",
    description: "Per-product pricing recommendations (raise / lower / hold) with rationale and suggested price.",
    parameters: {
      type: "object",
      properties: { limit: { type: "number", description: "default 15, max 50" } },
      additionalProperties: false,
    },
    run: (args) => {
      const n = limit((args as { limit?: number }).limit, 15, 50);
      return priceRecommendations().slice(0, n);
    },
  },
  {
    name: "list_bundle_suggestions",
    description: "Suggested product bundles based on co-purchase patterns.",
    parameters: {
      type: "object",
      properties: { limit: { type: "number", description: "default 8, max 20" } },
      additionalProperties: false,
    },
    run: (args) => bundleRecommendations(limit((args as { limit?: number }).limit, 8, 20)),
  },

  // ---------- read: RTO ----------
  {
    name: "list_rto_risk_orders",
    description: "Pending COD orders ranked by RTO (return-to-origin) risk score. Use for 'which orders should I worry about?'",
    parameters: {
      type: "object",
      properties: { limit: { type: "number", description: "default 15, max 50" } },
      additionalProperties: false,
    },
    run: (args) => pendingCodRisks().slice(0, limit((args as { limit?: number }).limit, 15, 50)),
  },
  {
    name: "get_rto_projection",
    description: "Projected total RTO loss for pending COD orders, with how much is avoidable by requiring advance on high-risk orders.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    run: () => rtoSummaryProjection(),
  },

  // ---------- read: forecast ----------
  {
    name: "get_daily_forecast",
    description: "Forecast total units sold per day for the next ~14 days across all products.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    run: () => dailyForecastTotal(),
  },

  // ---------- read: marketing helpers ----------
  {
    name: "get_audience_count",
    description: "How many customers fall into a marketing audience ('all', 'vip', 'dormant', 'atrisk').",
    parameters: {
      type: "object",
      properties: { audience: { type: "string", enum: ["all", "vip", "dormant", "atrisk"] } },
      required: ["audience"],
      additionalProperties: false,
    },
    run: (args) => ({ count: audienceCount((args as { audience: Audience }).audience) }),
  },
  {
    name: "draft_marketing_message",
    description:
      "Generate a draft marketing message in EN and BN for a given audience, goal, and channel. Use this to PROPOSE a message before scheduling.",
    parameters: {
      type: "object",
      properties: {
        audience: { type: "string", enum: ["all", "vip", "dormant", "atrisk"] },
        goal: { type: "string", enum: ["winback", "upsell", "festival"] },
        channel: { type: "string", enum: ["whatsapp", "sms", "messenger"] },
      },
      required: ["audience", "goal", "channel"],
      additionalProperties: false,
    },
    run: (args) => {
      const a = args as { audience: Audience; goal: Goal; channel: MarketingChannel };
      return generateMessage(a.audience, a.goal, a.channel);
    },
  },

  // ---------- act: schedule campaign ----------
  {
    name: "schedule_marketing_campaign",
    description:
      "Schedule a marketing campaign for sending later. v1 is RECORD-ONLY: it stores the campaign with status='scheduled' and returns the saved record. Nothing is actually sent. Always confirm channel, audience, message and scheduled_for with the user before calling this.",
    parameters: {
      type: "object",
      properties: {
        channel: { type: "string", enum: ["sms", "whatsapp", "email", "push", "other"] },
        audience: { type: "string", description: "Free-text audience description, e.g. 'at-risk customers' or 'top 50 buyers'." },
        message: { type: "string" },
        scheduled_for: { type: "string", description: "When to send. ISO date/time or human description e.g. 'tomorrow 6pm'." },
      },
      required: ["channel", "audience", "message", "scheduled_for"],
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const a = args as { channel: CampaignChannel; audience: string; message: string; scheduled_for: string };
      return addCampaign(ctx.email, {
        channel: a.channel,
        audience: a.audience,
        message: a.message,
        scheduledFor: a.scheduled_for,
      });
    },
  },
  {
    name: "list_recent_campaigns",
    description: "List recently scheduled campaigns for the signed-in shop.",
    parameters: {
      type: "object",
      properties: { limit: { type: "number", description: "default 10, max 50" } },
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      const n = limit((args as { limit?: number }).limit, 10, 50);
      const all = await listCampaigns(ctx.email);
      return all.slice(0, n);
    },
  },
];

/** OpenAI Chat Completions `tools` array. */
export function toolDefsForOpenAI() {
  return TOOLS.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export function findTool(name: string): Tool | undefined {
  return TOOLS.find((t) => t.name === name);
}
