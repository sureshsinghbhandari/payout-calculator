import { upload } from "@vercel/blob/client";
import { DOCUMENT_KINDS, type DocumentKind } from "@/lib/documents";

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Sends a file straight from the browser to the investor's private folder in the Blob store (the upload route
 * at /admin/investors/<id>/documents/upload hands out the short-lived token). Returns the file's pathname,
 * which the caller then passes to registerDocumentAction to check and list it. Throws when the upload fails.
 */
export async function uploadInvestorFile(options: {
  investorId: string;
  uploadFolder: string;
  file: File;
  kind: DocumentKind;
  onProgress: (percent: number) => void;
}): Promise<string> {
  const { investorId, uploadFolder, file, kind, onProgress } = options;
  const pathname = `${uploadFolder}${randomHex(16)}.${DOCUMENT_KINDS[kind].extension}`;
  await upload(pathname, file, {
    access: "private",
    handleUploadUrl: `/admin/investors/${encodeURIComponent(investorId)}/documents/upload`,
    contentType: DOCUMENT_KINDS[kind].contentType,
    onUploadProgress: ({ percentage }) => onProgress(Math.round(percentage)),
  });
  return pathname;
}
