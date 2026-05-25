/**
 * Per-account persistence for the Pilot AI agent.
 *
 * Stores chat history and scheduled marketing campaigns in the same shared
 * /kv store the rest of the app uses (see lib/kv.ts), so chats and campaigns
 * survive Vercel cold-starts and follow the user across serverless instances.
 *
 * Keys: `chats:<email>` and `campaigns:<email>`. Each holds the full list as
 * a single JSON object — fine at hackathon scale; trivial to migrate to a
 * real DB later by swapping lib/kv.ts.
 */
import { kvGet, kvPut } from "@/lib/kv";

const norm = (email: string) => email.trim().toLowerCase();

// ---------- chats ----------

export type ChatRole = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Present when the assistant called a tool — JSON-stringified args. */
  toolName?: string;
  toolArgs?: string;
  /** Present on a tool-result message — the JSON-stringified result. */
  toolResult?: string;
  createdAt: number;
}

export interface Chat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

interface ChatsRecord {
  chats: Chat[];
}

const chatsKey = (email: string) => `chats:${norm(email)}`;

export async function listChats(email: string): Promise<Chat[]> {
  const rec = await kvGet<ChatsRecord>(chatsKey(email));
  return Array.isArray(rec?.chats) ? rec!.chats : [];
}

export async function getChat(email: string, chatId: string): Promise<Chat | null> {
  const all = await listChats(email);
  return all.find((c) => c.id === chatId) ?? null;
}

export async function saveChat(email: string, chat: Chat): Promise<void> {
  const all = await listChats(email);
  const i = all.findIndex((c) => c.id === chat.id);
  if (i >= 0) all[i] = chat;
  else all.unshift(chat);
  // Cap to last 50 chats per account to keep the KV value bounded.
  const trimmed = all.slice(0, 50);
  await kvPut(chatsKey(email), { chats: trimmed } satisfies ChatsRecord);
}

export async function deleteChat(email: string, chatId: string): Promise<void> {
  const all = await listChats(email);
  const next = all.filter((c) => c.id !== chatId);
  await kvPut(chatsKey(email), { chats: next } satisfies ChatsRecord);
}

export function newChat(firstUserMessage: string): Chat {
  const now = Date.now();
  return {
    id: `c_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    // Title is the first 60 chars of the first user message; can be re-titled later.
    title: firstUserMessage.trim().slice(0, 60) || "New chat",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

// ---------- campaigns (record-only) ----------

export type CampaignChannel = "sms" | "whatsapp" | "email" | "push" | "other";
export type CampaignStatus = "scheduled" | "cancelled" | "sent";

export interface Campaign {
  id: string;
  createdAt: number;
  /** ISO date or human string the user gave; we don't enforce a format. */
  scheduledFor: string;
  channel: CampaignChannel;
  /** e.g. "at-risk customers", "top 50 buyers", or a manual list. */
  audience: string;
  message: string;
  status: CampaignStatus;
}

interface CampaignsRecord {
  campaigns: Campaign[];
}

const campaignsKey = (email: string) => `campaigns:${norm(email)}`;

export async function listCampaigns(email: string): Promise<Campaign[]> {
  const rec = await kvGet<CampaignsRecord>(campaignsKey(email));
  return Array.isArray(rec?.campaigns) ? rec!.campaigns : [];
}

export async function addCampaign(email: string, c: Omit<Campaign, "id" | "createdAt" | "status">): Promise<Campaign> {
  const all = await listCampaigns(email);
  const created: Campaign = {
    ...c,
    id: `mk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    status: "scheduled",
  };
  all.unshift(created);
  await kvPut(campaignsKey(email), { campaigns: all.slice(0, 200) } satisfies CampaignsRecord);
  return created;
}
