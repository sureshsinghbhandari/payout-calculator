import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default Cloudflare setup. No R2/KV cache is configured: everything that must be shared and durable
// (rates, accounts, documents) is read from Supabase, never from a framework cache.
export default defineCloudflareConfig();
