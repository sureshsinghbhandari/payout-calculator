import "server-only";
import { randomBytes } from "node:crypto";
import { BlobError, BlobPreconditionFailedError, del, get, put } from "@vercel/blob";
import {
  DOCUMENT_KINDS,
  isDocumentType,
  sortDocuments,
  type DocumentKind,
  type InvestorDocument,
} from "../documents";
import { writableEtag } from "./blob-etag";

/**
 * Investor documents. Each file is a private blob
 * ("documents/<env>/<investor id>/<random>.<ext>"); the list of documents is
 * one private JSON index ("documents/<env>/index.json"). Index writes check
 * the file's ETag and retry on a conflict, like the account files. Files are
 * only ever served through routes that check who is asking.
 */
const ENV = process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_ENV || "local";
const ROOT = `documents/${ENV}/`;
const INDEX_PATH = `${ROOT}index.json`;
const WRITE_ATTEMPTS = 4;
/** Random part of a file's pathname: 32 hex characters. */
const FILE_NAME = /^[a-f0-9]{32}\.(pdf|jpg|png)$/;

export function isDocumentStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

export class DocumentError extends Error {}

/** Folder an investor's files are uploaded to. */
export function documentFolder(investorId: string): string {
  return `${ROOT}${investorId}/`;
}

/** Whether `pathname` is a file name this app would give a document of this investor and kind. */
export function isDocumentPathname(pathname: string, investorId: string, kind?: DocumentKind): boolean {
  const folder = documentFolder(investorId);
  if (!pathname.startsWith(folder)) return false;
  const name = pathname.slice(folder.length);
  return FILE_NAME.test(name) && (!kind || name.endsWith(`.${DOCUMENT_KINDS[kind].extension}`));
}

// ---------- index ----------

const str = (v: unknown) => (typeof v === "string" ? v : null);

function parseIndex(data: unknown): InvestorDocument[] {
  const list = (data as { documents?: unknown })?.documents;
  if (!Array.isArray(list)) throw new Error("Invalid documents index.");
  return list.flatMap((raw): InvestorDocument[] => {
    const d = (raw ?? {}) as Record<string, unknown>;
    const id = str(d.id);
    const investorId = str(d.investorId);
    const title = str(d.title);
    const pathname = str(d.pathname);
    const kind = str(d.kind);
    const size = typeof d.size === "number" && Number.isFinite(d.size) ? d.size : null;
    if (!id || !investorId || !title || !pathname || size === null || !isDocumentType(d.type)) return [];
    if (kind !== "pdf" && kind !== "jpeg" && kind !== "png") return [];
    return [
      {
        id,
        investorId,
        title,
        type: d.type,
        kind,
        fileName: str(d.fileName) ?? `document.${DOCUMENT_KINDS[kind].extension}`,
        pathname,
        size,
        uploadedAt: str(d.uploadedAt) ?? new Date(0).toISOString(),
        uploadedBy: str(d.uploadedBy) ?? "",
        uploadedById: str(d.uploadedById) ?? "",
      },
    ];
  });
}

async function readIndex(): Promise<{ documents: InvestorDocument[]; etag: string | null }> {
  if (!isDocumentStorageConfigured()) return { documents: [], etag: null };
  const result = await get(INDEX_PATH, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return { documents: [], etag: null };
  const text = await new Response(result.stream).text();
  return { documents: parseIndex(JSON.parse(text)), etag: writableEtag(result.blob.etag) };
}

function isConflict(error: unknown): boolean {
  return (
    error instanceof BlobPreconditionFailedError ||
    (error instanceof BlobError && /already exists/i.test(error.message))
  );
}

async function mutateIndex<R>(change: (documents: InvestorDocument[]) => { documents: InvestorDocument[]; result: R }): Promise<R> {
  if (!isDocumentStorageConfigured()) throw new DocumentError("Document storage is not configured.");
  for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt++) {
    const { documents, etag } = await readIndex();
    const { documents: next, result } = change(documents);
    try {
      await put(INDEX_PATH, JSON.stringify({ documents: next }, null, 2), {
        access: "private",
        addRandomSuffix: false,
        contentType: "application/json",
        ...(etag ? { allowOverwrite: true, ifMatch: etag } : { allowOverwrite: false }),
      });
      return result;
    } catch (error) {
      if (!isConflict(error) || attempt === WRITE_ATTEMPTS) throw error;
    }
  }
  throw new DocumentError("Saving failed.");
}

// ---------- public API ----------

/** One investor's documents, newest first. */
export async function listDocuments(investorId: string): Promise<InvestorDocument[]> {
  const { documents } = await readIndex();
  return sortDocuments(documents.filter((d) => d.investorId === investorId));
}

/** A document of this investor (never another investor's), or null. */
export async function getDocument(investorId: string, documentId: string): Promise<InvestorDocument | null> {
  return (await listDocuments(investorId)).find((d) => d.id === documentId) ?? null;
}

export function addDocument(input: Omit<InvestorDocument, "id" | "uploadedAt">): Promise<InvestorDocument> {
  return mutateIndex((documents) => {
    if (documents.some((d) => d.pathname === input.pathname)) throw new DocumentError("This file has already been added.");
    const doc: InvestorDocument = {
      ...input,
      id: `doc_${randomBytes(6).toString("hex")}`,
      uploadedAt: new Date().toISOString(),
    };
    return { documents: [...documents, doc], result: doc };
  });
}

/** Removes a document from the index, then deletes its file. Returns the removed document. */
export async function removeDocument(investorId: string, documentId: string): Promise<InvestorDocument> {
  const removed = await mutateIndex((documents) => {
    const doc = documents.find((d) => d.id === documentId && d.investorId === investorId);
    if (!doc) throw new DocumentError("This document could not be found. Reload the page.");
    return { documents: documents.filter((d) => d !== doc), result: doc };
  });
  await deleteDocumentFile(removed.pathname);
  return removed;
}

/** Deletes an uploaded file. Failures are logged (the file is no longer listed anywhere). */
export async function deleteDocumentFile(pathname: string): Promise<void> {
  try {
    await del(pathname);
  } catch (error) {
    console.error("Deleting a document file failed", pathname, error);
  }
}

/** Size and first bytes of an uploaded file (to check what it really is), or null when it is missing. */
export async function inspectDocumentFile(pathname: string): Promise<{ size: number; head: Uint8Array } | null> {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  const reader = result.stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (length < 16) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      length += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const head = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    head.set(chunk, offset);
    offset += chunk.length;
  }
  return { size: result.blob.size, head };
}

/** The file's content as a stream, or null when it is missing. */
export async function openDocumentFile(
  doc: InvestorDocument,
): Promise<{ stream: ReadableStream<Uint8Array>; size: number } | null> {
  const result = await get(doc.pathname, { access: "private", useCache: false });
  return result && result.statusCode === 200 ? { stream: result.stream, size: result.blob.size } : null;
}

/** Response headers for downloading a document as an attachment. */
export function downloadHeaders(doc: InvestorDocument, size: number): HeadersInit {
  // Plain ASCII fallback, plus the exact name for browsers that read filename*.
  const ascii = doc.fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return {
    "Content-Type": DOCUMENT_KINDS[doc.kind].contentType,
    "Content-Length": String(size),
    "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
}
