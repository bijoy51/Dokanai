"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Loader2,
  MessageSquarePlus,
  Send,
  Sparkles,
  Trash2,
  User as UserIcon,
  Wrench,
} from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";
import { TypingText } from "./TypingText";

const NICKNAME = "Pilot";

interface ChatSummary {
  id: string;
  title: string;
  updatedAt: number;
}
interface ChatMessageUi {
  role: "user" | "assistant";
  content: string;
  /** When true and role==='assistant', animate the typing in. Already-loaded
   *  history messages should be false so they appear instantly. */
  typed?: boolean;
  toolNames?: string[];
}

interface ReadyPrompt {
  key: string;
  label: string;
  prompt: string;
}

function readyPrompts(locale: Locale): ReadyPrompt[] {
  // Send the actual prompt to the model in English so the tools fire reliably,
  // but show a localised label on the button.
  const isBn = locale === "bn";
  return [
    {
      key: "at-risk",
      label: isBn ? "ঝুঁকিতে থাকা কাস্টমার দেখাও" : "Who is at risk?",
      prompt: "List my at-risk customers with their last order date and total spend.",
    },
    {
      key: "top-products",
      label: isBn ? "টপ ৫ প্রোডাক্ট" : "Top 5 products this month",
      prompt: "Show my top 5 products by units sold in the last 30 days.",
    },
    {
      key: "low-stock",
      label: isBn ? "কম স্টক প্রোডাক্ট" : "Low-stock alerts",
      prompt: "Which products will run out soon? Show days-of-stock.",
    },
    {
      key: "pricing",
      label: isBn ? "প্রাইসিং পরামর্শ" : "Pricing suggestions",
      prompt: "Suggest pricing changes for my products.",
    },
    {
      key: "winback",
      label: isBn ? "Dormant customer winback draft" : "Draft a winback WhatsApp",
      prompt: "Draft a WhatsApp winback message for my dormant customers, then ask me when to schedule it.",
    },
    {
      key: "rto",
      label: isBn ? "RTO ঝুঁকি অর্ডার" : "RTO risk orders",
      prompt: "List my highest-risk pending COD orders and how much loss they could cause.",
    },
  ];
}

export function PilotClient({ locale }: { locale: Locale }) {
  const [history, setHistory] = useState<ChatSummary[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageUi[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [showGreeting, setShowGreeting] = useState(true);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Load chat history sidebar on mount.
  useEffect(() => {
    fetch("/api/agent/history")
      .then((r) => (r.ok ? r.json() : { chats: [] }))
      .then((d) => setHistory(d.chats ?? []))
      .catch(() => {});
  }, []);

  // Auto-scroll to bottom when messages change.
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const newChat = () => {
    setCurrentChatId(null);
    setMessages([]);
    setShowGreeting(true);
    setError("");
    setInput("");
  };

  const openChat = async (id: string) => {
    setError("");
    setCurrentChatId(id);
    setShowGreeting(false);
    try {
      const r = await fetch(`/api/agent/history/${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setMessages(
        (data.messages ?? [])
          .filter((m: { role: string }) => m.role === "user" || m.role === "assistant")
          .map((m: { role: "user" | "assistant"; content: string }) => ({
            role: m.role,
            content: m.content,
            typed: false,
          })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load chat.");
    }
  };

  const deleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/agent/history/${encodeURIComponent(id)}`, { method: "DELETE" });
    setHistory((h) => h.filter((c) => c.id !== id));
    if (currentChatId === id) newChat();
  };

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;
    setError("");
    setShowGreeting(false);
    setInput("");
    const userMsg: ChatMessageUi = { role: "user", content: msg };
    setMessages((m) => [...m, userMsg]);
    setSending(true);
    try {
      const r = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: currentChatId, message: msg }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Pilot failed.");
      const toolNames: string[] | undefined = Array.isArray(data.toolCalls)
        ? data.toolCalls.map((tc: { name: string }) => tc.name)
        : undefined;
      setMessages((m) => [...m, { role: "assistant", content: data.assistant ?? "", typed: true, toolNames }]);
      if (!currentChatId && data.chatId) {
        setCurrentChatId(data.chatId);
        setHistory((h) => [
          { id: data.chatId, title: data.title || msg.slice(0, 60), updatedAt: Date.now() },
          ...h.filter((c) => c.id !== data.chatId),
        ]);
      } else if (currentChatId) {
        setHistory((h) =>
          h.map((c) => (c.id === currentChatId ? { ...c, updatedAt: Date.now() } : c)).sort((a, b) => b.updatedAt - a.updatedAt),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pilot failed.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden h-[75vh] flex">
      {/* ---------- left rail: history ---------- */}
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col">
        <button
          onClick={newChat}
          className="m-3 inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-md px-3 py-2"
        >
          <MessageSquarePlus className="w-4 h-4" />
          {t("pilot.newChat", locale)}
        </button>
        <div className="px-3 pb-2 text-[10px] uppercase tracking-wide text-slate-500">{t("pilot.history", locale)}</div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
          {history.length === 0 && (
            <div className="text-xs text-slate-400 px-2 py-3">{t("pilot.noHistory", locale)}</div>
          )}
          {history.map((c) => (
            <button
              key={c.id}
              onClick={() => openChat(c.id)}
              className={`group w-full text-left px-2 py-2 rounded-md text-sm flex items-start gap-2 hover:bg-white ${
                currentChatId === c.id ? "bg-white border border-slate-200" : ""
              }`}
            >
              <span className="flex-1 truncate text-slate-700">{c.title || "Untitled"}</span>
              <span
                onClick={(e) => deleteHistoryItem(c.id, e)}
                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600"
                aria-label="Delete chat"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* ---------- right: chat ---------- */}
      <section className="flex-1 min-w-0 flex flex-col">
        {/* header: nickname + ready prompts */}
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-brand-600 grid place-items-center text-white">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-semibold leading-none">{NICKNAME}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{t("pilot.expertTagline", locale)}</div>
            </div>
          </div>
          <ReadyPromptsMenu
            prompts={readyPrompts(locale)}
            onPick={(p) => setInput(p.prompt)}
            label={t("pilot.readyPrompts", locale)}
          />
        </div>

        {/* messages */}
        <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-4 bg-slate-50/40">
          {showGreeting && messages.length === 0 && <Greeting locale={locale} />}

          {messages.map((m, i) => (
            <MessageBubble key={i} msg={m} locale={locale} />
          ))}

          {sending && (
            <div className="flex items-start gap-2">
              <Avatar role="assistant" />
              <div className="rounded-2xl rounded-tl-sm bg-white border border-slate-200 px-3 py-2 text-sm text-slate-500 inline-flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t("pilot.thinking", locale)}
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="border-t border-slate-200 p-3 flex items-end gap-2 bg-white"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder={t("pilot.inputPlaceholder", locale)}
            className="flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 max-h-32"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-md px-3 py-2 disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {t("pilot.send", locale)}
          </button>
        </form>
      </section>
    </div>
  );
}

function Greeting({ locale }: { locale: Locale }) {
  const [step, setStep] = useState<0 | 1>(0);
  const line1 = `Hi, I am ${NICKNAME}.`;
  const line2 =
    locale === "bn"
      ? "আমি অটো-মার্কেটিং, প্রাইসিং বান্ডেল, রেকমেন্ডেশন আর সেলসের এক্সপার্ট — আজ কীভাবে সাহায্য করতে পারি, স্যার?"
      : "I am an expert on auto-marketing, pricing & bundles, recommendations and sales — how can I help you today, sir?";
  return (
    <div className="flex items-start gap-2">
      <Avatar role="assistant" />
      <div className="rounded-2xl rounded-tl-sm bg-white border border-slate-200 px-3 py-2 text-sm text-slate-800 max-w-[80%]">
        <div>
          <TypingText text={line1} onDone={() => setStep(1)} />
        </div>
        {step === 1 && (
          <div className="mt-1">
            <TypingText text={line2} />
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ msg, locale }: { msg: ChatMessageUi; locale: Locale }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex items-start gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      <Avatar role={msg.role} />
      <div
        className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap max-w-[80%] ${
          isUser
            ? "bg-brand-600 text-white rounded-tr-sm"
            : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm"
        }`}
      >
        {msg.role === "assistant" && msg.typed ? <TypingText text={msg.content} /> : msg.content}
        {!isUser && msg.toolNames && msg.toolNames.length > 0 && (
          <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1 flex-wrap">
            <Wrench className="w-3 h-3" />
            {t("pilot.usedTools", locale)}: {msg.toolNames.join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}

function Avatar({ role }: { role: "user" | "assistant" }) {
  if (role === "user") {
    return (
      <div className="w-7 h-7 rounded-full bg-slate-200 grid place-items-center shrink-0">
        <UserIcon className="w-3.5 h-3.5 text-slate-600" />
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-full bg-brand-600 grid place-items-center shrink-0 text-white">
      <Bot className="w-3.5 h-3.5" />
    </div>
  );
}

function ReadyPromptsMenu({
  prompts,
  onPick,
  label,
}: {
  prompts: ReadyPrompt[];
  onPick: (p: ReadyPrompt) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-sm text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-md px-3 py-1.5"
      >
        <Sparkles className="w-4 h-4 text-brand-600" />
        {label}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-72 rounded-md border border-slate-200 bg-white shadow-lg z-10">
          {prompts.map((p) => (
            <button
              key={p.key}
              onClick={() => {
                onPick(p);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 border-b last:border-b-0 border-slate-100"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
