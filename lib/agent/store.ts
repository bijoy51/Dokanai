/**
 * Per-account persistence for the Pilot AI agent.
 *
 * Chats are stored with **one KV key per chat** (`chat:<email>:<chatId>`)
 * plus a small summary index (`chat-index:<email>`). This avoids the race
 * where two concurrent saves of different chats each read+modify+write a
 * single array key and clobber each other's entry. The chat content itself
 * is now safe under concurrency; only the index is best-effort (worst case
 * a chat is briefly missing from the sidebar — its content is still
 * retrievable by id).
 *
 * Campaigns remain a single array per account — they're write-once-per-
 * scheduling and rarely overlap.
 *
 * Reads transparently fall back to the legacy single-array key
 * `chats:<email>` so chats created before this refactor still appear.
 */
import { kvDelete, kvGet, kvPut } from "@/lib/kv";

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

export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: number;
}

interface ChatIndex {
  items: ChatSummary[];
}

/** Legacy shape (kept for read-only back-compat). */
interface LegacyChatsRecord {
  chats: Chat[];
}

const chatKey = (email: string, id: string) => `chat:${norm(email)}:${id}`;
const indexKey = (email: string) => `chat-index:${norm(email)}`;
const legacyKey = (email: string) => `chats:${norm(email)}`;

const MAX_CHATS_IN_INDEX = 50;

async function loadLegacy(email: string): Promise<Chat[]> {
  const rec = await kvGet<LegacyChatsRecord>(legacyKey(email));
  return Array.isArray(rec?.chats) ? rec!.chats : [];
}

export async function listChats(email: string): Promise<ChatSummary[]> {
  const idx = await kvGet<ChatIndex>(indexKey(email));
  const fromIndex: ChatSummary[] = Array.isArray(idx?.items) ? idx!.items : [];
  // Merge in any legacy chats that aren't yet in the new index so the user
  // doesn't lose history written before the refactor.
  const legacy = await loadLegacy(email);
  if (legacy.length === 0) return sortByUpdated(fromIndex);
  const seen = new Set(fromIndex.map((s) => s.id));
  for (const c of legacy) {
    if (!seen.has(c.id)) {
      fromIndex.push({ id: c.id, title: c.title, updatedAt: c.updatedAt });
      seen.add(c.id);
    }
  }
  return sortByUpdated(fromIndex);
}

function sortByUpdated(arr: ChatSummary[]): ChatSummary[] {
  return [...arr].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getChat(email: string, chatId: string): Promise<Chat | null> {
  // Primary: per-chat key (race-safe).
  const direct = await kvGet<Chat>(chatKey(email, chatId));
  if (direct && Array.isArray(direct.messages)) return direct;
  // Back-compat: chats created before the per-key refactor.
  const legacy = await loadLegacy(email);
  return legacy.find((c) => c.id === chatId) ?? null;
}

export async function saveChat(email: string, chat: Chat): Promise<void> {
  // 1) Write the chat itself to its own key — concurrent saves of OTHER
  //    chats can no longer clobber this one.
  await kvPut(chatKey(email, chat.id), chat);

  // 2) Best-effort: upsert the summary in the index. A race here can at
  //    worst drop one summary briefly; the chat content is safe in step 1.
  const idx = (await kvGet<ChatIndex>(indexKey(email))) ?? { items: [] };
  const items = Array.isArray(idx.items) ? idx.items : [];
  const i = items.findIndex((s) => s.id === chat.id);
  const summary: ChatSummary = { id: chat.id, title: chat.title, updatedAt: chat.updatedAt };
  if (i >= 0) items[i] = summary;
  else items.unshift(summary);
  items.sort((a, b) => b.updatedAt - a.updatedAt);
  await kvPut(indexKey(email), { items: items.slice(0, MAX_CHATS_IN_INDEX) } satisfies ChatIndex);
}

export async function deleteChat(email: string, chatId: string): Promise<void> {
  await kvDelete(chatKey(email, chatId));
  const idx = (await kvGet<ChatIndex>(indexKey(email))) ?? { items: [] };
  const next = (idx.items ?? []).filter((s) => s.id !== chatId);
  await kvPut(indexKey(email), { items: next } satisfies ChatIndex);
}

export function newChat(firstUserMessage: string): Chat {
  const now = Date.now();
  return {
    id: `c_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
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

export async function addCampaign(
  email: string,
  c: Omit<Campaign, "id" | "createdAt" | "status">,
): Promise<Campaign> {
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
