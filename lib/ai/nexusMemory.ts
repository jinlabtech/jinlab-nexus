import type { NexusToolContext } from "@/lib/ai/nexusTools";

type MemoryItem = {
  key?: string;
  text?: string;
  category?: string;
  confidence?: number;
};

async function rpc(
  name: string,
  args: Record<string, unknown>,
  context: NexusToolContext
) {
  const response = await fetch(
    `${context.supabaseUrl}/rest/v1/rpc/${name}`,
    {
      method: "POST",
      headers: {
        apikey: context.supabaseKey,
        Authorization: context.authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      cache: "no-store",
    }
  );

  const text = await response.text();

  if (!response.ok) {
    console.error(`Nexus Memory RPC ${name} failed:`, response.status, text);
    throw new Error(`Nexus memory could not execute ${name}.`);
  }

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function loadNexusMemory(
  context: NexusToolContext
): Promise<string> {
  try {
    const result = await rpc(
      "get_nexus_ai_memory",
      { p_limit: 50 },
      context
    );

    if (!Array.isArray(result) || result.length === 0) {
      return "";
    }

    return result
      .filter(
        (item: MemoryItem) =>
          typeof item?.text === "string" &&
          item.text.trim()
      )
      .map((item: MemoryItem) => {
        const category =
          typeof item.category === "string"
            ? item.category
            : "general";

        const key =
          typeof item.key === "string"
            ? item.key
            : "memory";

        return `[${category}] ${key}: ${item.text}`;
      })
      .join("\n")
      .slice(0, 18000);
  } catch (error) {
    console.error("Nexus long-term memory read failed:", error);
    return "";
  }
}

function extractOutputText(payload: any) {
  if (typeof payload?.output_text === "string") {
    return payload.output_text;
  }

  if (!Array.isArray(payload?.output)) {
    return "";
  }

  let text = "";

  for (const item of payload.output) {
    if (!Array.isArray(item?.content)) continue;

    for (const part of item.content) {
      if (
        part?.type === "output_text" &&
        typeof part?.text === "string"
      ) {
        text += part.text;
      }
    }
  }

  return text;
}

function parseMemoryJSON(text: string) {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {}
  }

  return null;
}

function normalizeKey(value: unknown) {
  if (typeof value !== "string") return "";

  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

export async function captureNexusMemories({
  openaiKey,
  question,
  answer,
  conversationId,
  context,
}: {
  openaiKey: string;
  question: string;
  answer: string;
  conversationId: string | null;
  context: NexusToolContext;
}) {
  if (!question.trim() || !answer.trim()) return;

  try {
    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-5.6-luna",
          store: false,

          reasoning: {
            effort: "low",
          },

          text: {
            verbosity: "low",
          },

          max_output_tokens: 450,

          instructions: `
You are the long-term memory curator for Nexus.

Study the direct user message and the assistant response.

Save only information that is likely to be useful in future conversations.

Good memories include:
- user preferences
- recurring instructions
- project direction
- long-term goals
- decisions
- established facts
- important architecture choices
- continuing work state
- naming conventions
- constraints that will matter later

Do NOT save:
- passwords
- API keys
- access tokens
- authentication secrets
- full bank/account/card numbers
- temporary one-off numbers with no future value
- random greetings
- speculative conclusions
- facts invented by the assistant
- content originating only from an attached document unless the user
  explicitly asks Nexus to remember it
- sensitive personal information unless the user explicitly requests
  that it be remembered

JINLAB is not the only possible subject.
Memory may concern any subject or project the user works on.

If the user explicitly says remember, keep, save, don't forget, always,
from now on, or similar language, strongly consider it durable.

Return ONLY valid JSON in this exact structure:

{
  "memories": [
    {
      "key": "stable_short_identifier",
      "text": "clear standalone memory",
      "category": "general|preference|project|decision|instruction|fact",
      "confidence": 0.0
    }
  ]
}

Return {"memories":[]} when nothing deserves long-term memory.
`,
          input: [
            {
              role: "user",
              content:
                `USER MESSAGE:\n${question.slice(0, 6000)}` +
                `\n\nASSISTANT RESPONSE:\n${answer.slice(0, 8000)}`,
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      console.error(
        "Nexus memory extraction failed:",
        response.status,
        await response.text()
      );
      return;
    }

    const payload = await response.json();

    const parsed = parseMemoryJSON(
      extractOutputText(payload)
    );

    const memories = Array.isArray(parsed?.memories)
      ? parsed.memories.slice(0, 8)
      : [];

    for (const memory of memories) {
      const key = normalizeKey(memory?.key);

      const text =
        typeof memory?.text === "string"
          ? memory.text.trim().slice(0, 2000)
          : "";

      if (!key || !text) continue;

      const category =
        typeof memory?.category === "string"
          ? memory.category
          : "general";

      const confidence =
        typeof memory?.confidence === "number"
          ? Math.min(
              Math.max(memory.confidence, 0),
              1
            )
          : 0.8;

      await rpc(
        "upsert_nexus_ai_memory",
        {
          p_memory_key: key,
          p_memory_text: text,
          p_category: category,
          p_source_conversation_id:
            conversationId,
          p_confidence: confidence,
        },
        context
      );
    }
  } catch (error) {
    console.error(
      "Nexus memory capture failed:",
      error
    );
  }
}
