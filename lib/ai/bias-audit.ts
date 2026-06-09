import { getStore } from "@/lib/data/store";
import { rfmScores } from "@/lib/ai/churn";
import type { Customer } from "@/lib/types";

/**
 * Fairness / bias audit for the shop's AI outputs.
 *
 * It does NOT just assert "we mitigate bias" — it measures it. For each
 * sensitive dimension (city, preferred language) we compare a group's share of
 * the whole customer base against its share inside an AI-driven selection:
 *
 *   - Marketing reach  : customers the email engine can actually reach
 *                        (subscribed === true)
 *   - High-value tier  : customers the RFM model labels vip / loyal
 *
 * representation ratio = (group share inside selection) / (group share overall)
 *   ratio ~1   : proportionate (fair)
 *   ratio <1   : under-represented
 *   ratio >1   : over-represented
 *
 * Large deviations are flagged so a human can decide whether the skew is
 * benign (real demand) or a bias to correct before sending campaigns. This is
 * the concrete safeguard behind the "responsible AI" claim.
 */

export type BiasStatus = "fair" | "watch" | "skewed";

export interface BiasGroupRow {
  group: string;
  population: number;
  populationShare: number; // 0..1
  selected: number;
  selectedShare: number; // 0..1
  ratio: number; // selectedShare / populationShare
  status: "ok" | "under" | "over";
}

export interface BiasFinding {
  lens: string;
  dimension: string;
  rows: BiasGroupRow[];
  maxDeviation: number; // max |ratio - 1| across rows
  status: BiasStatus;
}

export interface BiasReport {
  findings: BiasFinding[];
  overall: BiasStatus;
  notes: string[];
  totalCustomers: number;
}

const MIN_GROUP = 3; // ignore tiny groups (ratios get noisy)
const WATCH = 0.25; // |ratio-1| in [0.25, 0.5) -> watch
const SKEW = 0.5; // |ratio-1| >= 0.5 -> skewed

function dimValue(dim: string, c: Customer): string {
  if (dim === "City") return c.city || "Unknown";
  if (dim === "Preferred language") return c.preferredLang === "bn" ? "Bangla" : "English";
  return "Unknown";
}

function buildFinding(
  lens: string,
  dimension: string,
  customers: Customer[],
  selectedIds: Set<string>,
): BiasFinding | null {
  const pop = new Map<string, number>();
  const sel = new Map<string, number>();
  for (const c of customers) {
    const g = dimValue(dimension, c);
    pop.set(g, (pop.get(g) ?? 0) + 1);
    if (selectedIds.has(c.id)) sel.set(g, (sel.get(g) ?? 0) + 1);
  }
  const totalPop = customers.length;
  const totalSel = [...sel.values()].reduce((a, b) => a + b, 0);
  if (totalPop === 0 || totalSel === 0) return null;

  const rows: BiasGroupRow[] = [];
  let maxDeviation = 0;
  for (const [group, population] of pop) {
    if (population < MIN_GROUP) continue;
    const selected = sel.get(group) ?? 0;
    const populationShare = population / totalPop;
    const selectedShare = selected / totalSel;
    const ratio = populationShare > 0 ? selectedShare / populationShare : 0;
    const dev = Math.abs(ratio - 1);
    maxDeviation = Math.max(maxDeviation, dev);
    rows.push({
      group,
      population,
      populationShare: Number(populationShare.toFixed(3)),
      selected,
      selectedShare: Number(selectedShare.toFixed(3)),
      ratio: Number(ratio.toFixed(2)),
      status: dev < WATCH ? "ok" : ratio < 1 ? "under" : "over",
    });
  }
  if (rows.length === 0) return null;
  rows.sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1));

  const status: BiasStatus = maxDeviation >= SKEW ? "skewed" : maxDeviation >= WATCH ? "watch" : "fair";
  return { lens, dimension, rows, maxDeviation: Number(maxDeviation.toFixed(2)), status };
}

export function biasAudit(): BiasReport {
  const store = getStore();
  const customers = store.customers;
  const notes: string[] = [];

  if (customers.length === 0) {
    return { findings: [], overall: "fair", notes: ["No customers imported yet."], totalCustomers: 0 };
  }

  // Selection sets
  const subscribed = new Set(customers.filter((c) => c.subscribed && c.email).map((c) => c.id));
  const highValue = new Set(
    rfmScores()
      .filter((s) => s.segment === "vip" || s.segment === "loyal")
      .map((s) => s.customerId),
  );

  const lenses: Array<{ name: string; ids: Set<string> }> = [
    { name: "Marketing reach (opted-in subscribers)", ids: subscribed },
    { name: "High-value tier (VIP + loyal)", ids: highValue },
  ];
  const dimensions = ["City", "Preferred language"];

  const findings: BiasFinding[] = [];
  for (const lens of lenses) {
    if (lens.ids.size === 0) {
      notes.push(`No customers in selection "${lens.name}" — skipped.`);
      continue;
    }
    for (const dim of dimensions) {
      const f = buildFinding(lens.name, dim, customers, lens.ids);
      if (f) findings.push(f);
    }
  }

  const order: Record<BiasStatus, number> = { fair: 0, watch: 1, skewed: 2 };
  const overall = findings.reduce<BiasStatus>(
    (worst, f) => (order[f.status] > order[worst] ? f.status : worst),
    "fair",
  );
  if (overall !== "fair") {
    notes.push(
      "Flagged skews are surfaced for human review, not auto-corrected: a skew can reflect real demand. Review before launching broad campaigns.",
    );
  }

  return { findings, overall, notes, totalCustomers: customers.length };
}
