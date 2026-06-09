import { describe, it, expect } from "vitest";
import { planAmount, PLANS, STRIPE_CURRENCY } from "@/lib/stripe";

describe("stripe planAmount", () => {
  it("defaults to BDT currency", () => {
    expect(STRIPE_CURRENCY).toBe("bdt");
  });

  it("prices Growth and Pro in BDT poisha", () => {
    expect(planAmount("growth")).toBe(49900); // ৳499.00
    expect(planAmount("pro")).toBe(149900); // ৳1,499.00
  });

  it("returns null for an unknown plan", () => {
    expect(planAmount("enterprise")).toBeNull();
  });

  it("exposes display names for both paid plans", () => {
    expect(PLANS.growth.name).toMatch(/growth/i);
    expect(PLANS.pro.name).toMatch(/pro/i);
  });
});
