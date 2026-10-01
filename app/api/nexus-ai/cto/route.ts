import { handleCoreRequest } from "@/lib/intelligence/http";

// Keep the existing endpoint available to earlier Nexus clients while the core
// uses its own rules and permitted business records for every answer.
export const runtime = "nodejs";
export const maxDuration = 60;
export function POST(request: Request) { return handleCoreRequest(request, true); }
