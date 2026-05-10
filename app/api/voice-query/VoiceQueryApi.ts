import { NextResponse } from "next/server";
import { answerQuery } from "@/lib/ai/voice-query";

export async function POST(req: Request) {
  const body = await req.json();
  const q = (body.q as string) ?? "";
  if (!q.trim()) return NextResponse.json({ error: "empty query" }, { status: 400 });
  return NextResponse.json(answerQuery(q));
}
