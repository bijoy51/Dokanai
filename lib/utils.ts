import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBDT(amount: number): string {
  return `৳${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function formatPercent(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function daysBetween(a: Date | string, b: Date | string): number {
  const d1 = typeof a === "string" ? new Date(a) : a;
  const d2 = typeof b === "string" ? new Date(b) : b;
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}
