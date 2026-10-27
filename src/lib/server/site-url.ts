import "server-only";

const HOST_PATTERN = /^[a-z0-9.-]+(:\d{1,5})?$/i;

/**
 * The site's address for links in emails, e.g. "https://example.com".
 * Production uses the project's production domain, which Vercel provides
 * (VERCEL_PROJECT_PRODUCTION_URL), so a forged Host header can never put
 * another site into a password reset email. Elsewhere (previews, local
 * development) it is the address of the request.
 */
export function siteOrigin(headers: { get(name: string): string | null }): string {
  const production = process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() : "";
  const requested = headers.get("host")?.trim() ?? "";
  const host = [production, requested, process.env.VERCEL_URL?.trim()].find((h) => h && HOST_PATTERN.test(h)) ?? "localhost:3000";
  const local = /^(localhost|127\.0\.0\.1|[a-z0-9.-]+\.localhost)(:\d+)?$/i.test(host);
  return `${local ? "http" : "https"}://${host.toLowerCase()}`;
}
