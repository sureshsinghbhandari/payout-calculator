import "server-only";

/**
 * Which data set this deployment uses: "production", or a name such as "preview" or "local".
 * Production data and everything else live in separate folders/keys of the same Supabase project,
 * so a preview or local run can never touch live data.
 *
 * Set APP_ENV=production on the provider that serves the live site (Vercel, Netlify or Cloudflare).
 * When APP_ENV is not set, Vercel's own VERCEL_ENV is used, so existing Vercel deployments keep
 * their current data without any change. Anywhere else the default is "local" (an empty data set),
 * so forgetting APP_ENV shows an empty site instead of ever writing to live data by accident.
 */
export const APP_ENV: string = (() => {
  const explicit = process.env.APP_ENV?.trim();
  if (explicit) return explicit;
  return process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_ENV || "local";
})();

export const IS_PRODUCTION_DATA = APP_ENV === "production";
