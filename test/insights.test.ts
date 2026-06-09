import { describe, it, expect } from "vitest";
import { biasAudit } from "@/lib/ai/bias-audit";
import { autopilotPlan } from "@/lib/ai/autopilot";
import { modelQuality } from "@/lib/ai/model-quality";

// next/headers is mocked to "no session" (test/setup.ts), so getStore() is
// empty here — we assert the safe empty-state behaviour of each feature.
describe("bias audit (empty shop)", () => {
  const report = biasAudit();
  it("is fair with no customers", () => {
    expect(report.overall).toBe("fair");
    expect(report.totalCustomers).toBe(0);
    expect(report.findings).toHaveLength(0);
  });
});

describe("autopilot (empty shop)", () => {
  const plan = autopilotPlan();
  it("proposes no urgent actions and reports all clear", () => {
    expect(plan.actions).toHaveLength(0);
    expect(plan.summary.toLowerCase()).toContain("all clear");
  });
});

describe("model quality", () => {
  const report = modelQuality();
  it("always reports the trained churn + forecaster cards", () => {
    const names = report.models.map((m) => m.name.toLowerCase());
    expect(names.some((n) => n.includes("churn"))).toBe(true);
    expect(names.some((n) => n.includes("forecaster"))).toBe(true);
  });
});
