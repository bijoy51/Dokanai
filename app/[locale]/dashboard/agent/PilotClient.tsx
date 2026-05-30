"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  Loader2,
  MessageSquarePlus,
  Menu,
  Send,
  Trash2,
  User as UserIcon,
  Wrench,
  X,
} from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";
import { TypingText } from "./TypingText";
import { SuggestionChips, getInitialSuggestions, getFollowUpSuggestions } from "./Suggestions";

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

export function PilotClient({ locale }: { locale: Locale }) {
  const [history, setHistory] = useState<ChatSummary[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageUi[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [showGreeting, setShowGreeting] = useState(true);
  // Gates the initial chips below the greeting. Flips true after the
  // greeting finishes typing; resets to false whenever the greeting is
  // re-shown (new chat / clear).
  const [greetingDone, setGreetingDone] = useState(false);
  // History/starter rail visibility on mobile. Always-on (CSS) at lg+.
  const [railOpen, setRailOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // "Stick to bottom" mode: while true, new content auto-scrolls. The user
  // can scroll up freely; this flips to false and the typing animation
  // no longer drags them back. A ref (not state) so that the closure inside
  // AssistantMarkdown's onTick reads the current value without re-renders.
  const stickRef = useRef(true);

  const scrollToBottom = () => {
    if (!stickRef.current) return;
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  };

  // Re-evaluate stick-mode on every manual scroll. ~80px slack accommodates
  // the suggestion chip row that sits below the latest message.
  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  /** Fires when an assistant message finishes typing. Flips its `typed` flag
   *  off so the follow-up chips become eligible to render. */
  const markMessageTyped = (idx: number) => {
    setMessages((prev) => {
      if (!prev[idx] || prev[idx].typed === false) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], typed: false };
      return next;
    });
  };

  // Load chat history sidebar on mount.
  useEffect(() => {
    fetch("/api/agent/history")
      .then((r) => (r.ok ? r.json() : { chats: [] }))
      .then((d) => setHistory(d.chats ?? []))
      .catch(() => {});
  }, []);

  // Auto-scroll to bottom when messages change.
  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  // Keep focus on the input so Enter always sends (focus drifts after replies
  // / clicks elsewhere otherwise).
  useEffect(() => {
    if (!sending) inputRef.current?.focus();
  }, [sending, currentChatId, showGreeting]);

  const newChat = () => {
    setCurrentChatId(null);
    setMessages([]);
    setShowGreeting(true);
    setGreetingDone(false);
    setRailOpen(false);
    stickRef.current = true;
    setError("");
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const openChat = async (id: string) => {
    setError("");
    setRailOpen(false);
    setCurrentChatId(id);
    setShowGreeting(false);
    try {
      const r = await fetch(`/api/agent/history/${encodeURIComponent(id)}`);
      if (r.status === 404) {
        // Stale sidebar entry — drop it and reset to a new chat.
        setHistory((h) => h.filter((c) => c.id !== id));
        newChat();
        setError(t("pilot.chatGone", locale));
        return;
      }
      if (!r.ok) throw new Error(`Failed to load chat (${r.status})`);
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
    // User action -> re-stick to bottom so the new reply scrolls in even if
    // they had scrolled up earlier.
    stickRef.current = true;
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
      // Re-focus so the next Enter sends without a click.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden h-[80vh] sm:h-[75vh] flex relative">
      {/* Mobile backdrop for the rail drawer */}
      {railOpen && (
        <div
          className="lg:hidden absolute inset-0 z-20 bg-black/30"
          onClick={() => setRailOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ---------- left rail: history (drawer on mobile, static on lg+) ---------- */}
      <aside
        className={
          "absolute lg:static top-0 left-0 h-full z-30 " +
          "w-64 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col " +
          "transform transition-transform duration-200 ease-out lg:transform-none " +
          (railOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0")
        }
      >
        <div className="flex items-center gap-2 m-3">
          <button
            onClick={newChat}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-md px-3 py-2"
          >
            <MessageSquarePlus className="w-4 h-4" />
            {t("pilot.newChat", locale)}
          </button>
          <button
            type="button"
            onClick={() => setRailOpen(false)}
            aria-label="Close history"
            className="lg:hidden p-2 rounded-md hover:bg-slate-200 text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">{t("pilot.history", locale)}</div>
          {history.length === 0 && (
            <div className="text-xs text-slate-400 px-1 py-2">{t("pilot.noHistory", locale)}</div>
          )}
          <div className="space-y-1">
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
        </div>
      </aside>

      {/* ---------- right: chat ---------- */}
      <section className="flex-1 min-w-0 flex flex-col">
        {/* header: hamburger (mobile) + nickname */}
        <div className="px-3 sm:px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setRailOpen(true)}
              aria-label={t("pilot.history", locale)}
              className="lg:hidden p-2 -ml-1 rounded-md hover:bg-slate-100 text-slate-700 shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 rounded-md bg-brand-600 grid place-items-center text-white shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-none">{NICKNAME}</div>
              <div className="text-[11px] text-slate-500 mt-0.5 truncate">{t("pilot.expertTagline", locale)}</div>
            </div>
          </div>
        </div>

        {/* messages */}
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 sm:py-5 space-y-4 bg-slate-50/40"
        >
          {showGreeting && messages.length === 0 && (
            <>
              <Greeting locale={locale} onDone={() => setGreetingDone(true)} />
              {/* Starter chips below the greeting — appear once the greeting
                  has finished typing so the welcome moment stays uncluttered.
                  Vertical layout: one chip per row, full-width inside the
                  greeting column. */}
              {greetingDone && (
                <div className="ml-9 mt-2">
                  <SuggestionChips
                    variant="initial"
                    layout="vertical"
                    suggestions={getInitialSuggestions(locale)}
                    onPick={(p) => void send(p)}
                    locale={locale}
                  />
                </div>
              )}
            </>
          )}

          {messages.map((m, i) => (
            <MessageBubble
              key={i}
              msg={m}
              locale={locale}
              onTick={scrollToBottom}
              onTypingDone={m.role === "assistant" ? () => markMessageTyped(i) : undefined}
            />
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

        {/* sticky follow-up chips bar — sits between the scroller and the
            input, so it stays visible while the user scrolls the messages
            above. Only renders when the latest message is an assistant
            reply that has finished typing. */}
        {(() => {
          const last = messages[messages.length - 1];
          if (!last || last.role !== "assistant" || last.typed || sending) return null;
          return (
            <div className="border-t border-slate-100 bg-white px-3 sm:px-4 py-2.5">
              <SuggestionChips
                variant="follow-up"
                layout="horizontal"
                suggestions={getFollowUpSuggestions(last.content, locale)}
                onPick={(p) => void send(p)}
                locale={locale}
              />
            </div>
          );
        })()}

        {/* input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="border-t border-slate-200 p-2 sm:p-3 flex items-end gap-2 bg-white"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            autoFocus
            placeholder={t("pilot.inputPlaceholder", locale)}
            className="flex-1 min-w-0 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 max-h-32"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            aria-label={t("pilot.send", locale)}
            className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-md px-3 py-2 disabled:opacity-50 shrink-0"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span className="hidden sm:inline">{t("pilot.send", locale)}</span>
          </button>
        </form>
      </section>
    </div>
  );
}

function Greeting({ locale, onDone }: { locale: Locale; onDone?: () => void }) {
  const [step, setStep] = useState<0 | 1>(0);
  const line1 = `Hi, I am ${NICKNAME}.`;
  const line2 =
    locale === "bn"
      ? "আমি অটো-মার্কেটিং, প্রাইসিং বান্ডেল, রেকমেন্ডেশন আর সেলসের এক্সপার্ট — আজ কীভাবে সাহায্য করতে পারি, স্যার?"
      : "I am an expert on auto-marketing, pricing & bundles, recommendations and sales — how can I help you today, sir?";
  return (
    <div className="flex items-start gap-2">
      <Avatar role="assistant" />
      <div className="rounded-2xl rounded-tl-sm bg-white border border-slate-200 px-3 py-2 text-sm text-slate-800 max-w-[85%] sm:max-w-[80%]">
        <div>
          <TypingText text={line1} onDone={() => setStep(1)} />
        </div>
        {step === 1 && (
          <div className="mt-1">
            <TypingText text={line2} onDone={onDone} />
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({
  msg,
  locale,
  onTick,
  onTypingDone,
}: {
  msg: ChatMessageUi;
  locale: Locale;
  onTick?: () => void;
  onTypingDone?: () => void;
}) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex items-start gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      <Avatar role={msg.role} />
      <div
        className={`rounded-2xl px-3 py-2 text-sm max-w-[85%] sm:max-w-[80%] ${
          isUser
            ? "bg-brand-600 text-white rounded-tr-sm whitespace-pre-wrap"
            : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm"
        }`}
      >
        {isUser ? (
          msg.content
        ) : (
          <AssistantMarkdown content={msg.content} typed={!!msg.typed} onTick={onTick} onTypingDone={onTypingDone} />
        )}
        {!isUser && msg.toolNames && msg.toolNames.length > 0 && (
          <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1 flex-wrap border-t border-slate-100 pt-1.5">
            <Wrench className="w-3 h-3" />
            {t("pilot.usedTools", locale)}: {msg.toolNames.join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Renders the assistant's reply as Markdown (GFM, so tables work) and, when
 * `typed` is true, reveals the content one character at a time at ~25 ms/char.
 * The Markdown is re-parsed each tick — partial markdown renders best-effort
 * (a half-written table looks like pipes until the closing row arrives, then
 * snaps into a real <table>). Calls `onTick` so the chat scroller can follow.
 */
function AssistantMarkdown({
  content,
  typed,
  onTick,
  onTypingDone,
}: {
  content: string;
  typed: boolean;
  onTick?: () => void;
  /** Fires once when the typing animation reaches the end of the content
   *  (or immediately if `typed` is false / reduced-motion is set). The
   *  parent uses it to gate follow-up suggestion chips so they don't
   *  appear mid-stream. */
  onTypingDone?: () => void;
}) {
  const [shown, setShown] = useState(typed ? "" : content);
  useEffect(() => {
    if (!typed) {
      setShown(content);
      onTypingDone?.();
      return;
    }
    const reduced =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setShown(content);
      onTypingDone?.();
      return;
    }
    setShown("");
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(content.slice(0, i));
      onTick?.();
      if (i >= content.length) {
        clearInterval(id);
        onTypingDone?.();
      }
    }, 25);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, typed]);
  return (
    <div className="text-sm text-slate-800 leading-relaxed space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children }) => (
            <code className="px-1 py-0.5 rounded bg-slate-100 text-[12px] font-mono">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="rounded bg-slate-100 p-2 overflow-x-auto text-[12px]">{children}</pre>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-brand-700 underline">
              {children}
            </a>
          ),
          // GFM tables (remark-gfm)
          table: ({ children }) => (
            <div className="overflow-x-auto -mx-3 px-3">
              <table className="min-w-full border border-slate-200 rounded-md text-[13px] my-1">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-slate-50 text-slate-600">{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr className="border-t border-slate-100">{children}</tr>,
          th: ({ children }) => (
            <th className="px-2.5 py-1.5 text-left font-medium border-r last:border-r-0 border-slate-100">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-2.5 py-1.5 align-top border-r last:border-r-0 border-slate-100">{children}</td>
          ),
        }}
      >
        {shown}
      </ReactMarkdown>
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

