import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listChats } from "@/lib/agent/store";

/** GET /api/agent/history -> { chats: [{id, title, updatedAt}, ...] } */
export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const chats = await listChats(session.email);
  return NextResponse.json({
    chats: chats
      .map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt),
  });
}
