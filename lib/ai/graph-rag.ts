import { retrieveForQuestion, type Subgraph } from "@/lib/ai/knowledge-graph";

/**
 * GraphRAG answer pipeline = retrieve subgraph (knowledge-graph.ts) -> ground
 * the LLM on those triples -> generate.
 *
 * The LLM is hard-instructed to use ONLY the retrieved relationships, so the
 * answer stays faithful to the shop's real graph (same "never fabricate"
 * contract as the Pilot agent). If OPENAI_API_KEY is missing, we degrade
 * gracefully to a deterministic, retrieval-only summary of the triples — the
 * feature still demonstrably works, just without the natural-language layer.
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";
const TIMEOUT_MS = 45_000;

export interface GraphRagResult {
  answer: string;
  grounded: boolean; // true when the LLM generated from the subgraph
  triples: string[];
  seeds: string[];
  nodeCount: number;
  edgeCount: number;
}

function retrievalOnlyAnswer(sub: Subgraph): string {
  if (sub.triples.length === 0) {
    return "No related facts were found in the shop graph yet. Import more orders to enrich it.";
  }
  const lines = sub.triples.slice(0, 12).map((t) => `- ${t}`);
  return `Here are the strongest related facts from your shop graph (LLM layer not configured):\n${lines.join("\n")}`;
}

export async function graphRagAnswer(question: string): Promise<GraphRagResult> {
  const sub = retrieveForQuestion(question);

  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return {
      answer: retrievalOnlyAnswer(sub),
      grounded: false,
      triples: sub.triples,
      seeds: sub.seeds,
      nodeCount: sub.nodeCount,
      edgeCount: sub.edgeCount,
    };
  }

  const system =
    "You are DokanAI's graph analyst. You answer questions about a shop using ONLY the " +
    "knowledge-graph relationships provided. Each relationship is `A --[rel]--> B (note)`. " +
    "Reason over the relationships (including multi-hop chains) to give a concise, practical " +
    "answer for a Bangladeshi shopkeeper. Reply in the user's language (Bengali / English / " +
    "Banglish). NEVER invent products, customers, numbers, or links that are not in the graph. " +
    "If the graph does not contain enough to answer, say so plainly. Do not use em dashes.";

  const user =
    `Question: ${question}\n\n` +
    `Seed entities: ${sub.seeds.join(", ") || "(none matched — using top-connected products)"}\n\n` +
    `Knowledge-graph relationships (${sub.edgeCount} edges over ${sub.nodeCount} nodes):\n` +
    sub.triples.map((t) => `- ${t}`).join("\n");

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!res.ok || !text) {
      // Fall back to retrieval-only rather than failing the request.
      return {
        answer: retrievalOnlyAnswer(sub),
        grounded: false,
        triples: sub.triples,
        seeds: sub.seeds,
        nodeCount: sub.nodeCount,
        edgeCount: sub.edgeCount,
      };
    }
    return {
      answer: text,
      grounded: true,
      triples: sub.triples,
      seeds: sub.seeds,
      nodeCount: sub.nodeCount,
      edgeCount: sub.edgeCount,
    };
  } catch {
    return {
      answer: retrievalOnlyAnswer(sub),
      grounded: false,
      triples: sub.triples,
      seeds: sub.seeds,
      nodeCount: sub.nodeCount,
      edgeCount: sub.edgeCount,
    };
  }
}
