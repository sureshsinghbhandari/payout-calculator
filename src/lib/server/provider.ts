import "server-only";

export type HostingProvider = "vercel" | "netlify" | "cloudflare" | "local";

/**
 * Which hosting provider this deployment runs on. For diagnostics (the health check) and the
 * paused switch only; business logic must never branch on it. Set DEPLOY_PROVIDER explicitly
 * (the deploy script does); otherwise it is detected from the platform's own variables.
 */
export function currentProvider(): HostingProvider {
  const explicit = process.env.DEPLOY_PROVIDER?.trim().toLowerCase();
  if (explicit === "vercel" || explicit === "netlify" || explicit === "cloudflare" || explicit === "local") return explicit;
  if (process.env.VERCEL) return "vercel";
  if (process.env.NETLIFY) return "netlify";
  return "local";
}

/**
 * The "silent" switch. Set PROVIDER_ACTIVE=false on a provider you are not using right now: its
 * scheduled jobs then return immediately without touching Supabase or sending email, so an idle
 * deployment (whose schedule you have not disabled yet) uses next to no resources.
 */
export function isProviderActive(): boolean {
  return process.env.PROVIDER_ACTIVE?.trim().toLowerCase() !== "false";
}
