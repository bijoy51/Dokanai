/**
 * Thin OpenAI Chat Completions client with tool-calling loop.
 *
 * Non-streaming for v1 — keeps the tool-call orchestration simple and
 * reliable. The UI does its own "typed-out" animation for the assistant
 * reply, so the user still sees a typing effect.
 *
 * Configure via env:
 *   OPENAI_API_KEY   required at runtime
 *   OPENAI_MODEL     optional, default "gpt-4o-mini"
 *
 * When the key is missing, runAgent throws a clear error the API route
 * surfaces — frontend stays usable and other features are unaffected.
 */
import { findTool, toolDefsForOpenAI, type ToolContext } from "./tools";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_TOOL_ROUNDS = 5;
const TIMEOUT_MS = 60_000;

export interface AgentTurn {
  /** What the user typed. */
  user: string;
  /** Final assistant text shown to the user. */
  assistant: string;
  /** Tools the agent called, in order — useful for the UI to show "Pilot looked up X". */
  toolCalls: Array<{ name: string; args: unknown; result: unknown }>;
}

interface OAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface OAIChoice {
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  };
  finish_reason: string;
}

interface OAIResponse {
  choices: OAIChoice[];
  error?: { message: string };
}

const SYSTEM_PROMPT = `You are "Pilot", an AI co-pilot for a small Bangladeshi shop owner using the DokanAI platform. You are an expert in:
- Auto-marketing (drafting and scheduling SMS/WhatsApp/Email campaigns)
- Pricing and product bundles
- Product/customer recommendations
- Sales analytics, RTO risk, forecasting

You have tools that read the signed-in shop's real data (overview, customers, products, RTO risks, pricing suggestions, forecasts) and one tool that schedules marketing campaigns (RECORD-ONLY for now — nothing is actually sent).

Rules:
1. ALWAYS use a tool when the user asks about their data ("who is at risk?", "which products are low stock?", "show me top customers"). Do not invent numbers.
2. When the user asks to "send" or "schedule" a marketing message, first DRAFT it (use draft_marketing_message), confirm channel + audience + time with the user, then call schedule_marketing_campaign.
3. Reply in the same language the user wrote in (Bengali / English / Banglish).
4. Be concise. Numbers in BDT. When you show tabular data (top products, customer lists, risks, etc.), render it as a proper GitHub-Flavored Markdown table with a header row and a separator row of dashes, so the UI can format it as a real table. Example:
   | Name | Units | Revenue |
   | --- | --- | --- |
   | Saree | 20 | 40000 |
5. Use bullet lists ("- item") for non-tabular lists.
6. Formatting style: NEVER use em-dashes (—) or en-dashes (–) in prose. Use commas, regular hyphens (-), or two sentences instead. Avoid decorative dashes entirely.
7. If a tool returns nothing or the shop has no data yet, tell the user to import their CSV via Khata-to-Cloud. Do not fabricate.
8. Never expose internal IDs unless asked.`;

function apiKey(): string {
  const k = process.env.OPENAI_API_KEY?.trim();
  if (!k) {
    throw new Error(
      "Pilot is not configured: OPENAI_API_KEY is missing. Add it in Vercel project env (or .env for local) and redeploy.",
    );
  }
  return k;
}

async function callOpenAI(messages: OAIMessage[]): Promise<OAIChoice> {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      messages,
      tools: toolDefsForOpenAI(),
      tool_choice: "auto",
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = (await res.json()) as OAIResponse;
  if (!res.ok || !data.choices?.[0]) {
    throw new Error(data.error?.message || `OpenAI request failed (${res.status})`);
  }
  return data.choices[0];
}

/**
 * Run one user turn through the agent loop:
 *   prior history -> [tool calls -> tool results]* -> final assistant text.
 *
 * `priorMessages` is the persisted chat so far (only user + assistant text
 * turns; we do NOT replay tool round-trips between turns, to keep the saved
 * history simple).
 */
export async function runAgent(
  newUserMessage: string,
  priorMessages: Array<{ role: "user" | "assistant"; content: string }>,
  ctx: ToolContext,
): Promise<AgentTurn> {
  const msgs: OAIMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...priorMessages.map((m) => ({ role: m.role, content: m.content }) as OAIMessage),
    { role: "user", content: newUserMessage },
  ];

  const toolCalls: AgentTurn["toolCalls"] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const choice = await callOpenAI(msgs);
    const m = choice.message;

    // No tool calls → done.
    if (!m.tool_calls || m.tool_calls.length === 0) {
      return {
        user: newUserMessage,
        assistant: m.content ?? "",
        toolCalls,
      };
    }

    // Append the assistant's tool-call message verbatim so tool replies can
    // reference the right tool_call_id.
    msgs.push({
      role: "assistant",
      content: m.content ?? "",
      tool_calls: m.tool_calls,
    });

    for (const tc of m.tool_calls) {
      const tool = findTool(tc.function.name);
      let result: unknown;
      let parsedArgs: unknown = {};
      try {
        parsedArgs = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch {
        parsedArgs = { _raw: tc.function.arguments };
      }
      if (!tool) {
        result = { error: `Unknown tool: ${tc.function.name}` };
      } else {
        try {
          result = await tool.run(parsedArgs as Record<string, unknown>, ctx);
        } catch (e) {
          result = { error: e instanceof Error ? e.message : "tool failed" };
        }
      }
      toolCalls.push({ name: tc.function.name, args: parsedArgs, result });
      msgs.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
  }

  // Tool loop blew through MAX_TOOL_ROUNDS without a final text answer.
  return {
    user: newUserMessage,
    assistant:
      "Sorry — I needed more tool calls than I'm allowed for one question. Try rephrasing or asking one thing at a time.",
    toolCalls,
  };
}
