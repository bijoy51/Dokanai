import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { deleteChat, getChat } from "@/lib/agent/store";

/** GET /api/agent/history/[chatId] -> the full chat (messages included) */
export async function GET(_req: Request, { params }: { params: { chatId: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const chat = await getChat(session.email, params.chatId);
  if (!chat) return NextResponse.json({ error: "Chat not found." }, { status: 404 });
  return NextResponse.json(chat);
}

/** DELETE /api/agent/history/[chatId] -> { ok: true } */
export async function DELETE(_req: Request, { params }: { params: { chatId: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  await deleteChat(session.email, params.chatId);
  return NextResponse.json({ ok: true });
}
