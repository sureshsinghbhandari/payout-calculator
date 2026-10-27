import "server-only";
import { BlobError, BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { writableEtag } from "./blob-etag";
import {
  parseStoredTemplates,
  templateFor,
  type EmailTemplate,
  type StoredTemplates,
  type TemplateKey,
} from "../email-templates";

/**
 * Saved email templates are one private JSON file in Vercel Blob
 * ("settings/<env>/email-templates.json"). Only templates a Master Admin
 * changed are stored; the rest use the defaults in lib/email-templates.ts.
 * Writes check the ETag and retry on a conflict, so two admins saving
 * different templates at once never undo each other's change.
 */
const ENV = process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_ENV || "local";
const PATH = `settings/${ENV}/email-templates.json`;
const WRITE_ATTEMPTS = 6;

export function isTemplateStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

async function readRaw(): Promise<{ templates: StoredTemplates; etag: string | null }> {
  if (!isTemplateStorageConfigured()) return { templates: {}, etag: null };
  const result = await get(PATH, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return { templates: {}, etag: null };
  const text = await new Response(result.stream).text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch (error) {
    // A damaged file falls back to the defaults; the next save replaces it.
    console.error("Stored email templates could not be parsed", error);
  }
  return { templates: parseStoredTemplates(data), etag: writableEtag(result.blob.etag) };
}

function isConflict(error: unknown): boolean {
  return (
    error instanceof BlobPreconditionFailedError ||
    (error instanceof BlobError && /already exists/i.test(error.message))
  );
}

/** All saved templates (missing ones use the defaults). */
export async function readEmailTemplates(): Promise<StoredTemplates> {
  return (await readRaw()).templates;
}

/** The template to send: the saved one, or the default when none is saved or it cannot be read. */
export async function getEmailTemplate(key: TemplateKey): Promise<EmailTemplate> {
  try {
    return templateFor(await readEmailTemplates(), key);
  } catch (error) {
    console.error("Reading email templates failed; using the default", key, error);
    return templateFor({}, key);
  }
}

/** Saves one template, or removes it (`null`) so the default is used again. */
export async function saveEmailTemplate(
  key: TemplateKey,
  template: EmailTemplate | null,
  by: { name: string },
): Promise<void> {
  if (!isTemplateStorageConfigured()) throw new Error("Template storage is not configured.");
  for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt++) {
    const { templates, etag } = await readRaw();
    const next: StoredTemplates = { ...templates };
    if (template) next[key] = { ...template, updatedAt: new Date().toISOString(), updatedBy: by.name };
    else delete next[key];
    try {
      await put(PATH, JSON.stringify({ templates: next }, null, 2), {
        access: "private",
        addRandomSuffix: false,
        contentType: "application/json",
        ...(etag ? { allowOverwrite: true, ifMatch: etag } : { allowOverwrite: false }),
      });
      return;
    } catch (error) {
      if (!isConflict(error) || attempt === WRITE_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 150 * attempt));
    }
  }
}
