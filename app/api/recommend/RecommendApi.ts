import { NextResponse } from "next/server";
import { purchaseHistory, recommendForCustomer } from "@/lib/ai/recommend";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const customerId = url.searchParams.get("customerId");
  if (!customerId) return NextResponse.json({ error: "customerId required" }, { status: 400 });
  const recs = recommendForCustomer(customerId, 6);
  const history = purchaseHistory(customerId);
  return NextResponse.json({ recs, history });
}
