import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { hydrateImported } from "@/lib/data/imported";
import { runAgent } from "@/lib/agent/openai";
import {
  getChat,
  newChat,
  saveChat,
  type Chat,
  type ChatMessage,
} from "@/lib/agent/store";

/**
 * POST /api/agent/chat
 *   body: { chatId?: string, message: string }
 *   -> { chatId, assistant, toolCalls }
 *
 * Runs one turn of the Pilot agent. Creates a new chat if `chatId` is omitted,
 * otherwise appends to the existing chat. Always hydrates the imported shop
 * data from the durable KV first so tools see the latest store on any
 * serverless instance.
 */
export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { chatId?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const userMessage = (body.message ?? "").trim();
  if (!userMessage) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  // Make sure the agent's data-reading tools see the persisted imports.
  await hydrateImported(session.email);

  // Load or create the chat.
  let chat: Chat;
  if (body.chatId) {
    const existing = await getChat(session.email, body.chatId);
    chat = existing ?? newChat(userMessage);
    if (!existing) chat.id = body.chatId; // keep the id the client gave
  } else {
    chat = newChat(userMessage);
  }

  // Pass only prior user/assistant text turns to the model. Tool round-trips
  // from earlier turns are intentionally NOT replayed — keeps the saved
  // history simple and avoids tool_call_id reconstruction across turns.
  const prior = chat.messages
    .filter((m): m is ChatMessage & { role: "user" | "assistant" } => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  let turn;
  try {
    turn = await runAgent(userMessage, prior, { email: session.email });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Agent failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const now = Date.now();
  chat.messages.push({ role: "user", content: userMessage, createdAt: now });
  chat.messages.push({ role: "assistant", content: turn.assistant, createdAt: now });
  chat.updatedAt = now;
  // Refresh the title from the first user message if it's still the default.
  if (chat.messages.filter((m) => m.role === "user").length === 1) {
    chat.title = userMessage.slice(0, 60);
  }
  await saveChat(session.email, chat);

  return NextResponse.json({
    chatId: chat.id,
    title: chat.title,
    assistant: turn.assistant,
    toolCalls: turn.toolCalls,
  });
}
