/** Calls one of the app's /api/cron/* routes with the shared secret. Does nothing while paused. */
export async function callCronRoute(path) {
  if (process.env.PROVIDER_ACTIVE === "false") return new Response("paused");
  const secret = process.env.CRON_SECRET;
  const origin = (process.env.SITE_URL || process.env.URL || "").replace(/\/$/, "");
  if (!secret || !origin) return new Response("CRON_SECRET or site URL missing", { status: 500 });
  const response = await fetch(`${origin}${path}`, { headers: { authorization: `Bearer ${secret}` } });
  return new Response(await response.text(), { status: response.status });
}
