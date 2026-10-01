import { analyzeCore, answerCore } from "./engine";
import { authenticateCore, CoreError, loadCoreSnapshot } from "./server";
import type { CoreTopic } from "./types";

const TOPICS = new Set<CoreTopic>(["inventory", "receivables", "quotations", "purchasing", "repairs", "controls", "whatsapp", "overview", "help", "search"]);
const HEADERS = { "Cache-Control": "no-store", "X-Nexus-Mode": "nexus-core" };

async function readInput(request: Request): Promise<Record<string, unknown>> {
  const max = 16384;
  if (Number(request.headers.get("content-length")) > max) throw new CoreError("The question is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new CoreError("Enter a question for Nexus.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); throw new CoreError("The question is too large.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const input: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
    return input as Record<string, unknown>;
  } catch { throw new CoreError("Enter a valid question for Nexus."); }
}

export async function handleCoreRequest(request: Request, legacyText = false): Promise<Response> {
  try {
    const actor = await authenticateCore(request);
    let question: string | undefined;
    let previousTopic: CoreTopic | undefined;
    let route: string | undefined;
    if (request.method === "POST") {
      const input = await readInput(request);
      if (typeof input.question !== "string" || !input.question.trim() || input.question.trim().length > 1500) throw new CoreError("Enter a question of up to 1,500 characters.");
      if (input.attachments !== undefined && (!Array.isArray(input.attachments) || input.attachments.length > 0)) throw new CoreError("Nexus Core analyses your Nexus records. Document attachments are not supported in this mode.");
      question = input.question.trim();
      if (input.previousTopic !== undefined) {
        if (!TOPICS.has(input.previousTopic as CoreTopic)) throw new CoreError("Choose a supported Nexus topic.");
        previousTopic = input.previousTopic as CoreTopic;
      }
      if (input.route !== undefined) {
        if (typeof input.route !== "string" || !input.route.startsWith("/") || input.route.length > 200) throw new CoreError("The current module is invalid.");
        route = input.route;
      }
    }
    const snapshot = await loadCoreSnapshot(actor);
    const analysis = analyzeCore(snapshot);
    const answer = question ? answerCore(question, snapshot, previousTopic, route) : undefined;
    if (legacyText) return new Response(answer?.text ?? analysis.headline, { headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
    return Response.json({ analysis, ...(answer ? { answer } : {}) }, { headers: HEADERS });
  } catch (error) {
    if (error instanceof CoreError) return Response.json({ error: error.message }, { status: error.status, headers: HEADERS });
    console.error("Nexus Core request failed", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "Nexus could not complete this check. Please refresh and try again." }, { status: 503, headers: HEADERS });
  }
}
