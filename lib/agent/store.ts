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

// ---------- campaigns (email v1 actually sends; other channels stay record-only) ----------

export type CampaignChannel = "sms" | "whatsapp" | "email" | "push" | "other";
export type CampaignStatus =
  | "scheduled"
  | "in_progress"
  | "sent"
  | "partial"
  | "cancelled"
  | "failed";

export interface CampaignStats {
  /** Customers in the chosen segment (before email/consent filtering). */
  audience: number;
  /** Subset that had an email on file. */
  withEmail: number;
  /** Subset that was also opted in. */
  optedIn: number;
  /** Successful provider sends. */
  sent: number;
  /** Provider rejections / hard bounces / not-configured. */
  failed: number;
  /** Recipients who clicked the unsubscribe link before send. */
  unsubscribed: number;
}

export interface Campaign {
  id: string;
  createdAt: number;
  /** ISO datetime, e.g. "2026-05-28T18:00:00.000Z". */
  scheduledFor: string;
  /** ISO datetime the cron actually started processing this campaign. */
  startedAt?: string;
  /** ISO datetime processing finished. */
  finishedAt?: string;
  channel: CampaignChannel;
  /** Free-text audience descriptor, e.g. "at-risk customers". Resolved at
   *  send time by lib/email/audience.ts. */
  audience: string;
  /** The agent-drafted body. Mustache-lite merge tags ({{name}}, {{shop}},
   *  {{coupon}}, ...) substituted per recipient. */
  message: string;
  status: CampaignStatus;

  // Email-only fields (ignored for other channels in v1):
  /** Subject line (supports merge tags). */
  subject?: string;
  /** Optional CTA button. */
  ctaLabel?: string;
  ctaUrl?: string;

  stats?: CampaignStats;
}

interface CampaignsRecord {
  campaigns: Campaign[];
}

const campaignsKey = (email: string) => `campaigns:${norm(email)}`;

export async function listCampaigns(email: string): Promise<Campaign[]> {
  const rec = await kvGet<CampaignsRecord>(campaignsKey(email));
  return Array.isArray(rec?.campaigns) ? rec!.campaigns : [];
}

export async function getCampaign(email: string, id: string): Promise<Campaign | null> {
  const all = await listCampaigns(email);
  return all.find((c) => c.id === id) ?? null;
}

async function writeCampaigns(email: string, campaigns: Campaign[]): Promise<void> {
  await kvPut(campaignsKey(email), { campaigns: campaigns.slice(0, 200) } satisfies CampaignsRecord);
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
  await writeCampaigns(email, all);
  // Email campaigns are processed by the cron worker — register them in the
  // global due-queue so the cron doesn't need to enumerate every account.
  if (created.channel === "email") {
    await enqueueDue({ accountEmail: norm(email), campaignId: created.id, scheduledFor: created.scheduledFor });
  }
  return created;
}

export async function updateCampaign(
  email: string,
  id: string,
  patch: Partial<Omit<Campaign, "id" | "createdAt">>,
): Promise<Campaign | null> {
  const all = await listCampaigns(email);
  const i = all.findIndex((c) => c.id === id);
  if (i < 0) return null;
  all[i] = { ...all[i], ...patch };
  await writeCampaigns(email, all);
  return all[i];
}

// ---------- global due-queue (cross-account) ----------
// One KV key holds the list of email campaigns waiting to fire so the cron
// can pick up work without enumerating every account in KV.

export interface DueItem {
  accountEmail: string;
  campaignId: string;
  scheduledFor: string;
}
interface DueRecord {
  items: DueItem[];
}
const DUE_KEY = "due-campaigns:v1";

async function readDue(): Promise<DueItem[]> {
  const rec = await kvGet<DueRecord>(DUE_KEY);
  return Array.isArray(rec?.items) ? rec!.items : [];
}
async function writeDue(items: DueItem[]): Promise<void> {
  await kvPut(DUE_KEY, { items: items.slice(0, 1000) } satisfies DueRecord);
}
async function enqueueDue(item: DueItem): Promise<void> {
  const items = await readDue();
  // Replace existing entry for the same campaign id (idempotent re-schedule).
  const filtered = items.filter((i) => !(i.accountEmail === item.accountEmail && i.campaignId === item.campaignId));
  filtered.push(item);
  await writeDue(filtered);
}
export async function dequeueDue(item: DueItem): Promise<void> {
  const items = await readDue();
  const filtered = items.filter((i) => !(i.accountEmail === item.accountEmail && i.campaignId === item.campaignId));
  await writeDue(filtered);
}
/** All items whose scheduledFor <= nowIso. */
export async function listDue(nowIso: string): Promise<DueItem[]> {
  const items = await readDue();
  return items.filter((i) => i.scheduledFor <= nowIso);
}

// ---------- per-recipient send records (idempotency + audit) ----------
// One KV key per (campaign, recipient). Lets the cron resume safely: if a
// recipient already has a non-failed state, we skip it on retry.

export type RecipientState = "queued" | "sent" | "failed" | "skipped-unsubscribed" | "skipped-no-email";

export interface RecipientRecord {
  customerId: string;
  email?: string;
  state: RecipientState;
  providerId?: string;
  errorReason?: string;
  errorMessage?: string;
  ts: number;
}

const recipientKey = (account: string, campaignId: string, customerId: string) =>
  `cmprec:${norm(account)}:${campaignId}:${customerId}`;

export async function getRecipientRecord(
  account: string,
  campaignId: string,
  customerId: string,
): Promise<RecipientRecord | null> {
  return (await kvGet<RecipientRecord>(recipientKey(account, campaignId, customerId))) ?? null;
}
export async function putRecipientRecord(
  account: string,
  campaignId: string,
  rec: RecipientRecord,
): Promise<void> {
  await kvPut(recipientKey(account, campaignId, rec.customerId), rec);
}

// ---------- subscriber consent on the imported dataset ----------
// Flips Customer.subscribed and persists the dataset back to KV. Used by the
// public unsubscribe page + the Pilot set_subscriber_consent tool.

export async function setCustomerSubscribed(
  accountEmail: string,
  customerId: string,
  subscribed: boolean,
): Promise<{ ok: true; customer: { id: string; subscribed: boolean } } | { ok: false; reason: string }> {
  // Imported here (not at top) to avoid a cycle: imported.ts has no business
  // knowing about campaigns/agent.
  const { getImported, setImported, persistImported } = await import("@/lib/data/imported");
  const ds = getImported(accountEmail);
  if (!ds) return { ok: false, reason: "no-dataset" };
  const i = ds.customers.findIndex((c) => c.id === customerId);
  if (i < 0) return { ok: false, reason: "customer-not-found" };
  const c = ds.customers[i];
  ds.customers[i] = {
    ...c,
    subscribed,
    unsubscribedAt: subscribed ? undefined : new Date().toISOString(),
  };
  setImported(accountEmail, ds);
  await persistImported(accountEmail, ds);
  return { ok: true, customer: { id: customerId, subscribed } };
}
