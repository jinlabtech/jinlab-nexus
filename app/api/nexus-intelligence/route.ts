import { handleCoreRequest } from "@/lib/intelligence/http";
export const runtime = "nodejs";
export const maxDuration = 60;
export function GET(request: Request) { return handleCoreRequest(request); }
export function POST(request: Request) { return handleCoreRequest(request); }
