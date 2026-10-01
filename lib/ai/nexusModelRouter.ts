export type NexusModelDecision = {
  model: "gpt-5.6-luna" | "gpt-5.6-terra" | "gpt-5.6-sol";
  effort: "high" | "xhigh" | "max";
  reason: string;
};

export function chooseNexusModel(
  question: string
): NexusModelDecision {
  const q = question.trim().toLowerCase();

  const simpleLookup =
    q.length < 140 &&
    /\b(find|show|lookup|which invoice|which repair|how much|status|where is|who is)\b/i.test(q) &&
    !/\b(why|analyse|analyze|reason|strategy|recommend|compare|design|diagnose|research|plan|risk|architecture|explain deeply)\b/i.test(q);

  const mediumReasoning =
    /\b(compare|recommend|summarise|summarize|review|explain|evaluate|cash flow|performance|inventory|operations)\b/i.test(q);

  if (simpleLookup) {
    return {
      model: "gpt-5.6-luna",
      effort: "xhigh",
      reason: "Focused lookup with strong reasoning",
    };
  }

  if (mediumReasoning && q.length < 500) {
    return {
      model: "gpt-5.6-terra",
      effort: "max",
      reason: "Deep analytical reasoning",
    };
  }

  return {
    model: "gpt-5.6-sol",
    effort: "max",
    reason: "Maximum Nexus intelligence",
  };
}
