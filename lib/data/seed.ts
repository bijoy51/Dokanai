import type {
  Customer,
  DeliveryStatus,
  Order,
  OrderItem,
  Product,
  ProductCategory,
} from "@/lib/types";
import { festivalBoost } from "./festivals";

// Deterministic PRNG so seeds are stable across server restarts
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20260612);
const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)];
const range = (a: number, b: number) => Math.floor(rng() * (b - a + 1)) + a;

// === Products ===
const PRODUCT_TEMPLATES: Array<Omit<Product, "id" | "stock">> = [
  // Clothing
  { name: "Cotton Saree", nameBn: "সুতি শাড়ি", category: "clothing", price: 1850, cost: 1100, tags: ["festive", "women"] },
  { name: "Silk Saree", nameBn: "সিল্ক শাড়ি", category: "clothing", price: 4500, cost: 2800, tags: ["festive", "women"] },
  { name: "Designer Panjabi", nameBn: "ডিজাইনার পাঞ্জাবি", category: "clothing", price: 2200, cost: 1300, tags: ["festive", "men"] },
  { name: "Cotton Three-piece", nameBn: "সুতি থ্রি-পিস", category: "clothing", price: 1650, cost: 950, tags: ["women"] },
  { name: "Embroidered Blouse", nameBn: "এমব্রয়ডারি ব্লাউজ", category: "clothing", price: 750, cost: 400, tags: ["women", "match-saree"] },
  { name: "Casual Shirt", nameBn: "ক্যাজুয়াল শার্ট", category: "clothing", price: 1100, cost: 650, tags: ["men"] },
  { name: "Kids Eid Dress", nameBn: "বাচ্চাদের ঈদ পোশাক", category: "clothing", price: 1300, cost: 750, tags: ["festive", "kids"] },
  { name: "Winter Jacket", nameBn: "শীতের জ্যাকেট", category: "clothing", price: 2400, cost: 1500, tags: ["winter"] },
  { name: "Woolen Shawl", nameBn: "উলের শাল", category: "clothing", price: 950, cost: 500, tags: ["winter"] },
  { name: "Hijab", nameBn: "হিজাব", category: "clothing", price: 380, cost: 180, tags: ["women"] },
  // Beauty
  { name: "Attar Perfume", nameBn: "আতর", category: "beauty", price: 850, cost: 400, tags: ["festive", "ramadan"] },
  { name: "Lipstick", nameBn: "লিপস্টিক", category: "beauty", price: 480, cost: 220, tags: ["women"] },
  { name: "Face Serum", nameBn: "ফেস সিরাম", category: "beauty", price: 1200, cost: 600, tags: ["skincare"] },
  { name: "Hair Oil", nameBn: "চুলের তেল", category: "beauty", price: 320, cost: 150, tags: ["everyday"] },
  { name: "Moisturizer", nameBn: "ময়েশ্চারাইজার", category: "beauty", price: 650, cost: 320, tags: ["skincare"] },
  { name: "Kajal", nameBn: "কাজল", category: "beauty", price: 220, cost: 90, tags: ["women"] },
  { name: "Henna Cone", nameBn: "মেহেদি", category: "beauty", price: 60, cost: 25, tags: ["festive"] },
  { name: "Body Spray", nameBn: "বডি স্প্রে", category: "beauty", price: 540, cost: 280, tags: ["men"] },
  // Food
  { name: "Premium Dates 1kg", nameBn: "প্রিমিয়াম খেজুর ১ কেজি", category: "food", price: 1100, cost: 700, tags: ["ramadan", "festive"] },
  { name: "Chickpea (Chola) 1kg", nameBn: "ছোলা ১ কেজি", category: "food", price: 140, cost: 90, tags: ["ramadan"] },
  { name: "Sweet Box (Mishti)", nameBn: "মিষ্টির বক্স", category: "food", price: 750, cost: 450, tags: ["festive"] },
  { name: "Hilsa Fish 1kg", nameBn: "ইলিশ মাছ ১ কেজি", category: "food", price: 1850, cost: 1300, tags: ["pohela-boishakh"] },
  { name: "Fragrant Rice 5kg", nameBn: "সুগন্ধী চাল ৫ কেজি", category: "food", price: 950, cost: 700, tags: ["everyday"] },
  { name: "Spice Mix Pack", nameBn: "মসলা প্যাক", category: "food", price: 280, cost: 160, tags: ["everyday"] },
  { name: "Premium Tea 500g", nameBn: "প্রিমিয়াম চা ৫০০ গ্রাম", category: "food", price: 420, cost: 240, tags: ["everyday"] },
  { name: "Honey 500g", nameBn: "মধু ৫০০ গ্রাম", category: "food", price: 580, cost: 330, tags: ["everyday"] },
  // Electronics
  { name: "Bluetooth Earbuds", nameBn: "ব্লুটুথ ইয়ারবাড", category: "electronics", price: 1850, cost: 1100, tags: ["gadget"] },
  { name: "Phone Charger", nameBn: "ফোন চার্জার", category: "electronics", price: 480, cost: 220, tags: ["gadget"] },
  { name: "Power Bank 10000mAh", nameBn: "পাওয়ার ব্যাংক", category: "electronics", price: 1450, cost: 850, tags: ["gadget"] },
  { name: "USB Cable", nameBn: "ইউএসবি কেবল", category: "electronics", price: 220, cost: 90, tags: ["gadget"] },
  { name: "LED Bulb", nameBn: "এলইডি বাল্ব", category: "electronics", price: 180, cost: 90, tags: ["home"] },
  { name: "Smartwatch", nameBn: "স্মার্টওয়াচ", category: "electronics", price: 2800, cost: 1700, tags: ["gadget"] },
  // Home
  { name: "Bedsheet (Double)", nameBn: "বেডশীট (ডাবল)", category: "home", price: 1450, cost: 850, tags: ["home"] },
  { name: "Blanket", nameBn: "কম্বল", category: "home", price: 1250, cost: 750, tags: ["winter", "home"] },
  { name: "Pillow Pack of 2", nameBn: "বালিশ ২টি", category: "home", price: 680, cost: 380, tags: ["home"] },
  { name: "Kitchen Knife Set", nameBn: "কিচেন ছুরি সেট", category: "home", price: 950, cost: 550, tags: ["eid-ul-adha"] },
  { name: "Freezer Bag Roll", nameBn: "ফ্রিজার ব্যাগ", category: "home", price: 320, cost: 180, tags: ["eid-ul-adha"] },
  { name: "Wall Clock", nameBn: "দেয়াল ঘড়ি", category: "home", price: 580, cost: 320, tags: ["home"] },
  { name: "Curtain Set", nameBn: "পর্দার সেট", category: "home", price: 1850, cost: 1100, tags: ["home"] },
  { name: "Prayer Mat", nameBn: "জায়নামাজ", category: "home", price: 420, cost: 230, tags: ["ramadan"] },
];

export const PRODUCTS: Product[] = PRODUCT_TEMPLATES.map((p, i) => ({
  id: `p${(i + 1).toString().padStart(3, "0")}`,
  ...p,
  stock: range(8, 120),
}));

// === Customers ===
const FIRST_NAMES = [
  "Rashida", "Karim", "Ayesha", "Tanvir", "Nusrat", "Sakib", "Farzana",
  "Imran", "Sumaiya", "Rakib", "Mahfuza", "Arif", "Sabrina", "Hasan",
  "Rumana", "Jubayer", "Tahmina", "Mizan", "Shahida", "Nahid", "Anika",
  "Rifat", "Sharmin", "Tarek", "Nasrin", "Rezaul", "Sabina", "Shariar",
  "Maliha", "Faruk", "Lubna", "Habib", "Tasnim", "Rana", "Mukti",
];
const LAST_NAMES = ["Begum", "Khan", "Ahmed", "Rahman", "Hossain", "Islam", "Haque", "Akter", "Chowdhury", "Karim"];
const CITIES = ["Dhaka", "Chattogram", "Khulna", "Sylhet", "Rajshahi", "Barishal", "Cumilla", "Mymensingh", "Narayanganj", "Gazipur"];

export const CUSTOMERS: Customer[] = Array.from({ length: 220 }, (_, i) => {
  const joinedDaysAgo = range(7, 220);
  const join = new Date();
  join.setDate(join.getDate() - joinedDaysAgo);
  return {
    id: `c${(i + 1).toString().padStart(4, "0")}`,
    name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    phone: `+8801${range(3, 9)}${range(10000000, 99999999)}`,
    city: pick(CITIES),
    joinedAt: join.toISOString().slice(0, 10),
    preferredLang: rng() < 0.7 ? "bn" : "en",
  };
});

// Each customer has a "lifecycle" — they go dormant after a certain
// number of days. Most customers are still active, ~25% have churned.
const customerLifecycle = new Map<string, { activeFromDayIdx: number; activeToDayIdx: number }>();
for (const c of CUSTOMERS) {
  const r = rng();
  const totalSpan = 180;
  // 25% churn — last activity 60..160 days ago
  // 15% recent dropoff — last activity 35..70 days ago
  // 60% still active — last activity within 0..14 days ago
  let inactiveDaysAgo: number;
  if (r < 0.25) inactiveDaysAgo = 60 + Math.floor(rng() * 100);
  else if (r < 0.40) inactiveDaysAgo = 35 + Math.floor(rng() * 35);
  else inactiveDaysAgo = Math.floor(rng() * 14);
  const startDayIdx = Math.floor(rng() * 60); // joined within the first 60 days of seed window
  customerLifecycle.set(c.id, {
    activeFromDayIdx: startDayIdx,
    activeToDayIdx: totalSpan - inactiveDaysAgo,
  });
}

// === Orders ===
// Generate ~6 months of orders, with festival-driven demand spikes.
function generateOrders(): Order[] {
  const orders: Order[] = [];
  const today = new Date();
  // start ~180 days ago
  const start = new Date(today);
  start.setDate(start.getDate() - 180);

  let counter = 1;

  for (let d = 0; d <= 180; d++) {
    const date = new Date(start);
    date.setDate(start.getDate() + d);
    const dateStr = date.toISOString().slice(0, 10);

    // Compute average daily order count, scaled by festival boost
    let avgOrders = 8; // baseline
    // weekend lift
    const dow = date.getDay();
    if (dow === 5 || dow === 6) avgOrders *= 1.25;
    // monthly seasonality
    avgOrders *= 1 + 0.15 * Math.sin((d / 30) * Math.PI);

    // figure dominant festival boost across categories
    let maxBoost = 1;
    for (const cat of ["clothing", "beauty", "food", "home", "electronics"] as ProductCategory[]) {
      const { boost } = festivalBoost(date, cat);
      if (boost > maxBoost) maxBoost = boost;
    }
    avgOrders *= 0.5 + 0.5 * maxBoost; // soften so baseline isn't drowned

    const dailyCount = Math.max(1, Math.round(avgOrders + (rng() - 0.5) * avgOrders * 0.4));

    // Eligible customers for this day = those whose lifecycle covers this day index
    const eligible = CUSTOMERS.filter((c) => {
      const lc = customerLifecycle.get(c.id)!;
      return d >= lc.activeFromDayIdx && d <= lc.activeToDayIdx;
    });
    if (eligible.length === 0) continue;

    for (let k = 0; k < dailyCount; k++) {
      const customer = eligible[Math.floor(rng() * eligible.length)];
      const itemCount = rng() < 0.25 ? 2 : rng() < 0.05 ? 3 : 1;

      const items: OrderItem[] = [];
      const usedProducts = new Set<string>();
      for (let j = 0; j < itemCount; j++) {
        // weighted product selection: festival categories more likely
        const candidates = PRODUCTS.filter((p) => !usedProducts.has(p.id));
        const weights = candidates.map((p) => festivalBoost(date, p.category).boost);
        const totalW = weights.reduce((a, b) => a + b, 0);
        let r = rng() * totalW;
        let chosen = candidates[0];
        for (let i = 0; i < candidates.length; i++) {
          r -= weights[i];
          if (r <= 0) {
            chosen = candidates[i];
            break;
          }
        }
        usedProducts.add(chosen.id);
        items.push({ productId: chosen.id, qty: rng() < 0.15 ? 2 : 1, unitPrice: chosen.price });
      }

      const total = items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
      const paymentRoll = rng();
      const paymentMethod: Order["paymentMethod"] =
        paymentRoll < 0.55 ? "cod" : paymentRoll < 0.85 ? "bkash" : paymentRoll < 0.95 ? "nagad" : "card";

      // RTO mostly happens for COD orders, weighted by city + courier
      const isCod = paymentMethod === "cod";
      const cityRiskBase = ["Dhaka", "Chattogram", "Gazipur"].includes(customer.city) ? 0.15 : 0.32;
      const rtoChance = isCod ? cityRiskBase + (total > 3000 ? 0.08 : 0) : 0.02;

      let status: DeliveryStatus = "delivered";
      const today0 = new Date();
      const daysFromToday = Math.floor((today0.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      if (daysFromToday < 3) {
        status = "pending";
      } else if (rng() < rtoChance) {
        status = "rto";
      } else if (rng() < 0.01) {
        status = "cancelled";
      }

      orders.push({
        id: `o${counter.toString().padStart(5, "0")}`,
        customerId: customer.id,
        date: dateStr,
        items,
        total,
        paymentMethod,
        status,
        city: customer.city,
        courier: pick(["pathao", "steadfast", "redx", "ecourier"] as const),
      });
      counter++;
    }
  }

  return orders;
}

export const ORDERS: Order[] = generateOrders();
