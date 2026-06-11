import { describe, it, expect } from "vitest";
import { deriveCatalog, deriveRestock, deriveSelling, trendsScopedToShop } from "@/lib/ai/shop-analysis";

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

describe("analyze: attribute inference (Fix 3)", () => {
  const catalog = deriveCatalog([
    { title: "Saree", price: 2000, stock: 0 },
    { title: "Mens Panjabi", price: 1500, stock: 8 },
  ]);
  it("infers gender + occasion for a saree", () => {
    const saree = catalog[0];
    expect(saree.gender).toBe("women");
    expect(saree.occasion).toBe("festive");
  });
  it("respects explicit gender in the title for panjabi", () => {
    const panjabi = catalog[1];
    expect(panjabi.gender).toBe("men");
  });
});

describe("analyze: restock flags out-of-stock (Fix 2)", () => {
  it("includes a zero-stock product in restock_soon", () => {
    const restock = deriveRestock(
      [{ title: "Saree", price: 2000, stock: 0 }],
      [],
      "clothing",
    );
    expect(restock.some((r) => /saree/i.test(r.product_type))).toBe(true);
  });
});

describe("analyze: selling-well uses real names + real units (Fix)", () => {
  const listings = [
    { title: "Striped Polo Shirt", price: 900, stock: 10, category: "clothing" },
    { title: "Silk Saree Red", price: 3000, stock: 5, category: "clothing" },
  ];
  const sales = [
    { date: daysAgo(3), product: "Striped Polo Shirt", qty: 4, unit_price: 900 },
    { date: daysAgo(3), product: "Silk Saree Red", qty: 2, unit_price: 3000 },
  ];
  const { selling_well } = deriveSelling(listings, sales, "clothing");
  const labels = selling_well.map((s) => s.product_type);

  it("labels rows with full product titles, not generic garment types", () => {
    expect(labels).toContain("Striped Polo Shirt");
    expect(labels).not.toContain("shirt");
    expect(labels).not.toContain("saree");
  });
  it("reports real 30-day units (not zero) for recently sold items", () => {
    const polo = selling_well.find((s) => s.product_type === "Striped Polo Shirt");
    expect(polo?.units_30d).toBe(4);
  });
});

describe("analyze: trends scoped to shop category (Fix 4)", () => {
  it("drops cross-category items from a clothing shop's trends", () => {
    const listings = [
      { title: "Saree", price: 2000, stock: 10, category: "clothing" },
      { title: "LED Bulb Pack", price: 300, stock: 50, category: "electronics" },
    ];
    const sales = [
      { date: daysAgo(5), product: "Saree", qty: 5, unit_price: 2000 },
      { date: daysAgo(40), product: "Saree", qty: 2, unit_price: 2000 },
      { date: daysAgo(5), product: "LED Bulb Pack", qty: 6, unit_price: 300 },
      { date: daysAgo(40), product: "LED Bulb Pack", qty: 1, unit_price: 300 },
    ];
    const trends = trendsScopedToShop("clothing", listings, sales);
    const all = [...trends.up, ...trends.down].map((t) => t.product_type.toLowerCase());
    expect(all.some((p) => p.includes("led"))).toBe(false);
  });
});
