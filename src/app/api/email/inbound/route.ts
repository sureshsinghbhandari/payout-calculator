import { handleEmailWebhook } from "@/lib/server/email";

/**
 * Resend webhook: customer replies (email.received) and delivery updates for
 * emails the app sent. The signature is checked before anything is read.
 */
export async function POST(request: Request): Promise<Response> {
  const payload = await request.text();
  if (payload.length > 1_000_000) return new Response(null, { status: 413 });
  const status = await handleEmailWebhook(payload, request.headers);
  return new Response(null, { status });
}
