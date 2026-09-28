/** Liveness check for container orchestration. Doesn't touch ESPN or the database. */
export function GET() {
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
