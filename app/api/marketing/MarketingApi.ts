import { NextResponse } from "next/server";
import { generateMessage, type Audience, type Channel, type Goal } from "@/lib/ai/marketing";

export async function POST(req: Request) {
  const body = await req.json();
  const audience = (body.audience ?? "all") as Audience;
  const goal = (body.goal ?? "winback") as Goal;
  const channel = (body.channel ?? "whatsapp") as Channel;
  const msg = generateMessage(audience, goal, channel);
  return NextResponse.json(msg);
}
