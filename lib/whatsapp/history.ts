const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/;

/** Keep PostgreSQL microseconds intact; only safe timestamp characters reach filters. */
export function parseHistoryCursor(encoded: string): { id: string; createdAt: string } {
  if (encoded.length > 300 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error("Invalid history cursor");
  const cursor: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  if (!cursor || typeof cursor !== "object" || !("id" in cursor) || !("createdAt" in cursor)) throw new Error("Invalid history cursor");
  const { id, createdAt } = cursor;
  if (typeof id !== "string" || !ID.test(id) || typeof createdAt !== "string") throw new Error("Invalid history cursor");
  const timestamp = TIMESTAMP.exec(createdAt);
  if (!timestamp || !Number.isFinite(Date.parse(createdAt))) throw new Error("Invalid history cursor");
  const date = new Date(`${timestamp[1]}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== timestamp[1]) throw new Error("Invalid history cursor");
  return { id, createdAt };
}
