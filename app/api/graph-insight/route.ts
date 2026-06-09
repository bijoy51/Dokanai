import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { hydrateImported } from "@/lib/data/imported";
import { graphRagAnswer } from "@/lib/ai/graph-rag";

export const dynamic = "force-dynamic";

/**
 * POST /api/graph-insight  { question: string }
 *
 * GraphRAG endpoint: builds the signed-in shop's knowledge graph, retrieves a
 * relevant subgraph for the question, and returns an LLM answer grounded in
 * those graph relationships (plus the raw triples used, for transparency).
 */
export async function POST(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  }

  let body: { question?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* handled below */
  }
  const question = (body.question ?? "").toString().trim();
  if (!question) {
    return NextResponse.json({ error: "A question is required." }, { status: 400 });
  }

  // Make sure the in-memory store is filled from the durable KV on cold starts.
  await hydrateImported(session.email);

  const result = await graphRagAnswer(question);
  return NextResponse.json(result);
}
