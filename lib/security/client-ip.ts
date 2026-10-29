/**
 * Vercel overwrites x-forwarded-for with the connecting client's address, so
 * its first value is trustworthy there. cf-connecting-ip is ignored: without
 * Cloudflare's proxy in front, any client can set it.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}
