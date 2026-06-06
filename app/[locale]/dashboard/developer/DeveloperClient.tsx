"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Check,
  Code2,
  Copy,
  Database,
  Gauge,
  Key as KeyIcon,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  Zap,
} from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";

/**
 * Developer API dashboard.
 *
 * Three sub-tabs:
 *   - Keys      → list + create + revoke API keys
 *   - Examples  → copy-paste code snippets (cURL, Python, PHP, Node)
 *   - Usage     → today's call count / lifetime / next reset
 *
 * The full `sk_live_…` secret is shown ONCE inside a one-time-reveal card
 * right after creation. After dismissing that card, the panel only shows
 * the 4-char tail for identification.
 */

type SubTab = "keys" | "examples" | "usage";

interface ApiKeyPublic {
  keyId: string;
  tail: string;
  scope: "read" | "write" | "read+write";
  label: string;
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
}
interface ApiKeyCreated {
  keyId: string;
  secret: string;
  public: ApiKeyPublic;
}

export function DeveloperClient({ locale }: { locale: Locale }) {
  const [sub, setSub] = useState<SubTab>("keys");
  return (
    <div>
      <DeveloperBanner locale={locale} />
      <div className="flex items-center gap-1 mb-4 border-b border-slate-200 overflow-x-auto">
        <SubTabButton active={sub === "keys"} onClick={() => setSub("keys")} Icon={KeyIcon} label={t("dev.tab.keys", locale)} />
        <SubTabButton active={sub === "examples"} onClick={() => setSub("examples")} Icon={Code2} label={t("dev.tab.examples", locale)} />
        <SubTabButton active={sub === "usage"} onClick={() => setSub("usage")} Icon={Gauge} label={t("dev.tab.usage", locale)} />
      </div>
      {sub === "keys" && <KeysPanel locale={locale} />}
      {sub === "examples" && <ExamplesPanel locale={locale} />}
      {sub === "usage" && <UsagePanel locale={locale} />}
    </div>
  );
}

// ---------- KEYS ----------

function KeysPanel({ locale }: { locale: Locale }) {
  const [keys, setKeys] = useState<ApiKeyPublic[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState<"read" | "write" | "read+write">("read+write");
  const [justCreated, setJustCreated] = useState<ApiKeyCreated | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/developer/keys");
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      setKeys(data.keys ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/developer/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, scope }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Create failed (${res.status})`);
        return;
      }
      setJustCreated(data);
      setRevealed(false);
      setCopied(false);
      setLabel("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (k: ApiKeyPublic) => {
    if (!confirm(t("dev.confirmRevoke", locale))) return;
    setBusy(true);
    setError("");
    try {
      await fetch(`/api/developer/keys/${k.keyId}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="space-y-4">
      {/* One-time reveal card */}
      {justCreated && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2">
          <div className="text-sm font-semibold text-amber-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            {t("dev.justCreatedTitle", locale)}
          </div>
          <p className="text-xs text-amber-900/80">{t("dev.justCreatedBody", locale)}</p>
          <div className="flex items-center gap-2">
            <input
              type={revealed ? "text" : "password"}
              value={justCreated.secret}
              readOnly
              className="flex-1 rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-mono"
            />
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              className="px-2 py-1.5 text-xs border border-amber-300 rounded-md text-amber-900 hover:bg-amber-100"
            >
              {revealed ? t("dev.hide", locale) : t("dev.reveal", locale)}
            </button>
            <button
              type="button"
              onClick={() => copy(justCreated.secret)}
              className="inline-flex items-center gap-1 px-2 py-1.5 text-xs border border-amber-300 rounded-md text-amber-900 hover:bg-amber-100"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? t("dev.copied", locale) : t("dev.copy", locale)}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setJustCreated(null)}
            className="text-xs text-amber-900 underline"
          >
            {t("dev.dismissReveal", locale)}
          </button>
        </div>
      )}

      {/* Create form */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="text-sm font-medium">{t("dev.createTitle", locale)}</div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-slate-500 block mb-1">{t("dev.labelLabel", locale)}</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("dev.labelPlaceholder", locale)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">{t("dev.scopeLabel", locale)}</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as typeof scope)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="read+write">{t("dev.scope.readWrite", locale)}</option>
              <option value="read">{t("dev.scope.read", locale)}</option>
              <option value="write">{t("dev.scope.write", locale)}</option>
            </select>
          </div>
          <button
            type="button"
            onClick={create}
            disabled={busy}
            className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {t("dev.createBtn", locale)}
          </button>
        </div>
      </div>

      {/* Key list */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium">
          {t("dev.yourKeys", locale)}
        </div>
        {keys === null && (
          <div className="p-4 text-sm text-slate-500 inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> {t("dev.loading", locale)}
          </div>
        )}
        {keys && keys.length === 0 && (
          <div className="p-4 text-sm text-slate-500">{t("dev.noKeysYet", locale)}</div>
        )}
        {keys && keys.length > 0 && (
          <div className="divide-y divide-slate-100">
            {keys.map((k) => (
              <div key={k.keyId} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{k.label}</div>
                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                    sk_live_…{k.tail} · <span className="capitalize">{k.scope}</span> ·{" "}
                    {new Date(k.createdAt).toLocaleDateString()}
                    {k.lastUsedAt && (
                      <> · {t("dev.lastUsed", locale)}: {new Date(k.lastUsedAt).toLocaleString()}</>
                    )}
                    {!k.lastUsedAt && <> · {t("dev.neverUsed", locale)}</>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(k)}
                  disabled={busy}
                  className="text-xs text-rose-700 hover:text-rose-900 inline-flex items-center gap-1 border border-rose-200 hover:bg-rose-50 rounded-md px-2.5 py-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t("dev.revoke", locale)}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

// ---------- EXAMPLES ----------

function ExamplesPanel({ locale }: { locale: Locale }) {
  const [origin, setOrigin] = useState("https://dokanai.vercel.app");
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);
  const sampleKey = "sk_live_YOUR_API_KEY_HERE";

  const snippets: Array<{ lang: string; title: string; code: string }> = [
    {
      lang: "curl",
      title: t("dev.ex.curl", locale),
      code:
`# Read the demand forecast
curl -sS "${origin}/api/v1/insights/forecast" \\
  -H "Authorization: Bearer ${sampleKey}"

# Push today's sales from your database
curl -sS -X POST "${origin}/api/v1/data/sales" \\
  -H "Authorization: Bearer ${sampleKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"sales":[{"date":"2026-06-06","product":"Cotton Saree","qty":1,"unit_price":1500,"customer":"Bijoy","city":"Dhaka"}]}'`,
    },
    {
      lang: "python",
      title: t("dev.ex.python", locale),
      code:
`import requests

API = "${origin}/api/v1"
KEY = "${sampleKey}"
H = {"Authorization": f"Bearer {KEY}"}

# Push sales
requests.post(f"{API}/data/sales", headers=H, json={
    "sales": [
        {"date": "2026-06-06", "product": "Cotton Saree",
         "qty": 1, "unit_price": 1500, "customer": "Bijoy", "city": "Dhaka"}
    ]
}).raise_for_status()

# Read forecast
forecast = requests.get(f"{API}/insights/forecast", headers=H).json()
print(forecast["top_movers"][:3])`,
    },
    {
      lang: "php",
      title: t("dev.ex.php", locale),
      code:
`<?php
$API = "${origin}/api/v1";
$KEY = "${sampleKey}";

function call($method, $path, $body = null) {
    global $API, $KEY;
    $ch = curl_init("$API$path");
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Bearer $KEY",
        "Content-Type: application/json"
    ]);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    if ($body) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    return json_decode(curl_exec($ch), true);
}

// Push a sale
call("POST", "/data/sales", ["sales" => [
    ["date" => "2026-06-06", "product" => "Cotton Saree",
     "qty" => 1, "unit_price" => 1500, "customer" => "Bijoy", "city" => "Dhaka"]
]]);

// Read forecast
print_r(call("GET", "/insights/forecast")["top_movers"]);`,
    },
    {
      lang: "node",
      title: t("dev.ex.node", locale),
      code:
`const API = "${origin}/api/v1";
const KEY = "${sampleKey}";
const H = { "Authorization": \`Bearer \${KEY}\`, "Content-Type": "application/json" };

async function call(method, path, body) {
  const res = await fetch(\`\${API}\${path}\`, {
    method, headers: H, body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(\`\${res.status} \${await res.text()}\`);
  return res.json();
}

// Push a sale
await call("POST", "/data/sales", {
  sales: [{ date: "2026-06-06", product: "Cotton Saree",
            qty: 1, unit_price: 1500, customer: "Bijoy", city: "Dhaka" }],
});

// Read forecast
const forecast = await call("GET", "/insights/forecast");
console.log(forecast.top_movers.slice(0, 3));`,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-medium mb-2">{t("dev.ex.endpointsTitle", locale)}</div>
        <ul className="text-xs text-slate-600 space-y-1 font-mono">
          <li>POST /api/v1/data/sync · {t("dev.ex.descSync", locale)}</li>
          <li>POST /api/v1/data/products · {t("dev.ex.descProducts", locale)}</li>
          <li>POST /api/v1/data/sales · {t("dev.ex.descSales", locale)}</li>
          <li>GET&nbsp; /api/v1/data/products · {t("dev.ex.descReadProducts", locale)}</li>
          <li>GET&nbsp; /api/v1/data/sales · {t("dev.ex.descReadSales", locale)}</li>
          <li>GET&nbsp; /api/v1/insights/forecast · {t("dev.ex.descForecast", locale)}</li>
          <li>GET&nbsp; /api/v1/insights/popular · {t("dev.ex.descPopular", locale)}</li>
          <li>GET&nbsp; /api/v1/insights/rto · {t("dev.ex.descRto", locale)}</li>
          <li>GET&nbsp; /api/v1/insights/festivals · {t("dev.ex.descFestivals", locale)}</li>
          <li>GET&nbsp; /api/v1/insights/recommendations · {t("dev.ex.descRecs", locale)}</li>
          <li>GET&nbsp; /api/v1/health · {t("dev.ex.descHealth", locale)}</li>
          <li>GET&nbsp; /api/v1/usage · {t("dev.ex.descUsage", locale)}</li>
        </ul>
      </div>
      {snippets.map((s) => (
        <SnippetCard key={s.lang} lang={s.lang} title={s.title} code={s.code} />
      ))}
    </div>
  );
}

function SnippetCard({
  lang,
  title,
  code,
}: {
  lang: string;
  title: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between">
        <div className="text-sm font-medium">{title}</div>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md px-2 py-1"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="m-0 px-4 py-3 text-[12px] font-mono bg-slate-900 text-slate-100 overflow-x-auto leading-relaxed">
        <HighlightedCode code={code} lang={lang} />
      </pre>
    </div>
  );
}

// ---------- BANNER ----------

/**
 * Top-of-page banner. Sells the API in one glance: who it's for, what
 * data flows in / what flows out. Uses a 3-stop gradient whose colours
 * intentionally echo the syntax-highlighter palette (violet keywords,
 * emerald comments, sky function calls) so the banner and the code
 * blocks below feel like one design system.
 */
function DeveloperBanner({ locale }: { locale: Locale }) {
  return (
    <div className="relative overflow-hidden rounded-xl mb-5 p-5 sm:p-6 bg-gradient-to-br from-violet-600 via-sky-500 to-emerald-500 text-white shadow-lg">
      {/* Soft radial highlights — decorative, no semantic value */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30 mix-blend-overlay"
        style={{
          backgroundImage:
            "radial-gradient(circle at 15% 20%, rgba(255,255,255,0.4) 0%, transparent 35%), radial-gradient(circle at 85% 80%, rgba(255,255,255,0.25) 0%, transparent 35%)",
        }}
        aria-hidden="true"
      />
      <div className="relative">
        <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-semibold bg-white/15 backdrop-blur rounded-full px-2.5 py-1 mb-3">
          <Code2 className="w-3 h-3" />
          {t("dev.banner.eyebrow", locale)}
        </div>
        <h2 className="text-lg sm:text-2xl font-bold leading-tight max-w-3xl">
          {t("dev.banner.title", locale)}
        </h2>
        <p className="mt-2 text-sm sm:text-base text-white/90 max-w-3xl leading-relaxed">
          {t("dev.banner.body", locale)}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-2.5 text-[12px] sm:text-sm font-medium">
          <BannerStep Icon={Database} label={t("dev.banner.step1", locale)} />
          <ArrowRight className="w-4 h-4 opacity-80 shrink-0" />
          <BannerStep Icon={Zap} label={t("dev.banner.step2", locale)} />
          <ArrowRight className="w-4 h-4 opacity-80 shrink-0" />
          <BannerStep Icon={BarChart3} label={t("dev.banner.step3", locale)} />
        </div>
      </div>
    </div>
  );
}

function BannerStep({
  Icon,
  label,
}: {
  Icon: typeof Database;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-full px-2.5 py-1 ring-1 ring-white/20">
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}

// ---------- SYNTAX HIGHLIGHTER ----------

/**
 * Minimal per-language tokenizer. No external dependency — keeps the
 * dashboard bundle small. Covers the four languages we publish snippets
 * in (bash / python / php / node), each as a single mega-regex with
 * named groups that an `exec` walk turns into <span> token slices.
 *
 * Token colour palette (Tailwind classes against bg-slate-900):
 *   comment  → emerald  · string   → rose
 *   keyword  → violet   · number   → amber
 *   function → sky      · variable → cyan       · flag → yellow
 *
 * This is a "good-enough" highlighter, not a parser. Edge cases (nested
 * template literals, single-line regex like / / ) are NOT handled — the
 * snippets we ship don't use them. Don't extend this to handle full code
 * input from the user; reach for shiki/prismjs if/when we need that.
 */

type TokenType =
  | "comment"
  | "string"
  | "keyword"
  | "number"
  | "function"
  | "variable"
  | "flag"
  | "text";

const TOKEN_CLASS: Record<TokenType, string> = {
  comment: "text-emerald-400",
  string: "text-rose-300",
  keyword: "text-violet-300",
  number: "text-amber-300",
  function: "text-sky-300",
  variable: "text-cyan-300",
  flag: "text-yellow-300",
  text: "text-slate-100",
};

interface Tok {
  type: TokenType;
  value: string;
}

const LANG_REGEX: Record<string, RegExp> = {
  curl: new RegExp(
    [
      String.raw`(?<comment>#[^\n]*)`,
      String.raw`(?<string>"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')`,
      String.raw`(?<keyword>\b(?:curl|echo|export|cd|sleep|cat|set|true|false)\b)`,
      String.raw`(?<flag>-[a-zA-Z]+)`,
      String.raw`(?<number>\b\d+\b)`,
    ].join("|"),
    "g",
  ),
  python: new RegExp(
    [
      String.raw`(?<comment>#[^\n]*)`,
      String.raw`(?<string>(?:f|r|b)?(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'))`,
      String.raw`(?<keyword>\b(?:import|from|def|return|if|elif|else|for|while|in|not|and|or|True|False|None|class|try|except|raise|with|as|lambda|yield|async|await|pass|break|continue|global|nonlocal|is|print)\b)`,
      String.raw`(?<number>\b\d+(?:\.\d+)?\b)`,
      String.raw`(?<function>\b[a-zA-Z_]\w*(?=\())`,
    ].join("|"),
    "g",
  ),
  php: new RegExp(
    [
      String.raw`(?<comment>\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)`,
      String.raw`(?<string>"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')`,
      String.raw`(?<variable>\$[a-zA-Z_]\w*)`,
      String.raw`(?<keyword>\b(?:function|global|return|if|else|elseif|foreach|for|while|true|false|null|use|namespace|class|public|private|protected|new|echo|print|require|include|require_once|include_once|print_r|var_dump|array)\b|<\?php|\?>)`,
      String.raw`(?<number>\b\d+(?:\.\d+)?\b)`,
      String.raw`(?<function>\b[a-zA-Z_]\w*(?=\())`,
    ].join("|"),
    "g",
  ),
  node: new RegExp(
    [
      String.raw`(?<comment>\/\/[^\n]*|\/\*[\s\S]*?\*\/)`,
      // Three quote families: "…", '…', and `…` (templates).
      // Template literals: anything except a closing backtick OR a
      // backslash-escaped char. ${…} stays inside the string as plain
      // text — keeps the regex linear and matches what shiki does at
      // its rough default.
      "(?<string>\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|`(?:[^`\\\\]|\\\\.)*`)",
      String.raw`(?<keyword>\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|default|break|continue|new|class|extends|this|super|true|false|null|undefined|async|await|import|export|from|throw|try|catch|finally|in|of|typeof|instanceof)\b)`,
      String.raw`(?<number>\b\d+(?:\.\d+)?\b)`,
      String.raw`(?<function>\b[a-zA-Z_$][\w$]*(?=\())`,
    ].join("|"),
    "g",
  ),
};

function tokenize(code: string, lang: string): Tok[] {
  const re = LANG_REGEX[lang];
  if (!re) return [{ type: "text", value: code }];
  re.lastIndex = 0;
  const out: Tok[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (m.index > lastIndex) {
      out.push({ type: "text", value: code.slice(lastIndex, m.index) });
    }
    const groups = m.groups ?? {};
    let matched: TokenType = "text";
    for (const type of [
      "comment",
      "string",
      "variable",
      "keyword",
      "flag",
      "function",
      "number",
    ] as TokenType[]) {
      if (groups[type]) {
        matched = type;
        break;
      }
    }
    out.push({ type: matched, value: m[0] });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < code.length) {
    out.push({ type: "text", value: code.slice(lastIndex) });
  }
  return out;
}

function HighlightedCode({ code, lang }: { code: string; lang: string }) {
  const tokens = tokenize(code, lang);
  return (
    <>
      {tokens.map((tok, i) => (
        <span key={i} className={TOKEN_CLASS[tok.type]}>
          {tok.value}
        </span>
      ))}
    </>
  );
}

// ---------- USAGE ----------

function UsagePanel({ locale }: { locale: Locale }) {
  const [usage, setUsage] = useState<null | "loading" | {
    limit_daily: number;
    today: number;
    today_remaining: number;
    total_ever: number;
    last_call_at: string | null;
    window_resets_at: string;
  }>("loading");
  const [error, setError] = useState("");
  const [probeKey, setProbeKey] = useState("");

  const probe = async () => {
    if (!probeKey) {
      setError(t("dev.usage.probeKeyRequired", locale));
      return;
    }
    setError("");
    setUsage("loading");
    try {
      const res = await fetch("/api/v1/usage", {
        headers: { Authorization: `Bearer ${probeKey}` },
      });
      if (!res.ok) {
        setError(`${res.status} ${(await res.json())?.error ?? res.statusText}`);
        setUsage(null);
        return;
      }
      setUsage(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Probe failed");
      setUsage(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <p className="text-xs text-slate-500">{t("dev.usage.hint", locale)}</p>
        <div className="flex items-center gap-2">
          <input
            value={probeKey}
            onChange={(e) => setProbeKey(e.target.value)}
            placeholder="sk_live_…"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            type="button"
            onClick={probe}
            className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-md px-4 py-2"
          >
            <Gauge className="w-4 h-4" />
            {t("dev.usage.check", locale)}
          </button>
        </div>
      </div>
      {usage && usage !== "loading" && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label={t("dev.usage.today", locale)} value={`${usage.today.toLocaleString()} / ${usage.limit_daily.toLocaleString()}`} />
          <Stat label={t("dev.usage.remaining", locale)} value={usage.today_remaining.toLocaleString()} />
          <Stat label={t("dev.usage.totalEver", locale)} value={usage.total_ever.toLocaleString()} />
          <Stat
            label={t("dev.usage.resetsAt", locale)}
            value={new Date(usage.window_resets_at).toLocaleString()}
          />
        </div>
      )}
      {error && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function SubTabButton({
  active,
  onClick,
  Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  Icon: typeof Copy;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors shrink-0 " +
        (active
          ? "border-brand-600 text-brand-700 font-medium"
          : "border-transparent text-slate-600 hover:text-slate-900")
      }
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}
