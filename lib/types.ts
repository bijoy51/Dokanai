export type ProductCategory =
  | "clothing"
  | "electronics"
  | "beauty"
  | "food"
  | "home";

export interface Product {
  id: string;
  name: string;
  nameBn: string;
  category: ProductCategory;
  price: number;
  cost: number;
  stock: number;
  tags: string[];
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  city: string;
  joinedAt: string;
  preferredLang: "bn" | "en";
}

export interface OrderItem {
  productId: string;
  qty: number;
  unitPrice: number;
}

export type DeliveryStatus = "delivered" | "rto" | "pending" | "cancelled";

export interface Order {
  id: string;
  customerId: string;
  date: string;
  items: OrderItem[];
  total: number;
  paymentMethod: "cod" | "bkash" | "nagad" | "card";
  status: DeliveryStatus;
  city: string;
  courier: "pathao" | "steadfast" | "redx" | "ecourier";
}

export interface Festival {
  id: string;
  name: string;
  nameBn: string;
  date: string;
  /** days before the festival when demand begins to lift */
  leadDays: number;
  /** demand multiplier at peak (e.g. 2.5 = 2.5× baseline) */
  peakBoost: number;
  /** product categories most affected */
  categories: ProductCategory[];
  /** stock advice headline */
  advice: string;
  adviceBn: string;
}
