import { describe, it, expect } from "vitest";
import { getTier, hasTier } from "@/lib/subscription";

// With no POSTGRES_URL / ML_BACKEND_URL configured in the test env, the KV is
// a no-op returning null, so every account resolves to the safe "free" default.
describe("subscription tier gating", () => {
  it("defaults unknown accounts to free", async () => {
    await expect(getTier("nobody@example.com")).resolves.toBe("free");
  });

  it("free account does not meet the growth gate", async () => {
    await expect(hasTier("nobody@example.com", "growth")).resolves.toBe(false);
  });

  it("free account meets the free gate", async () => {
    await expect(hasTier("nobody@example.com", "free")).resolves.toBe(true);
  });

  it("empty email is free and ungated", async () => {
    await expect(getTier("")).resolves.toBe("free");
    await expect(hasTier("", "growth")).resolves.toBe(false);
  });
});
