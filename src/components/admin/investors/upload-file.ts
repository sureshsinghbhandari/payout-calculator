import { DOCUMENT_KINDS, type DocumentKind } from "@/lib/documents";

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Sends a file straight from the browser to the investor's private folder in Supabase Storage (the upload route
 * at /admin/investors/<id>/documents/upload hands out a short-lived signed URL). Returns the file's pathname,
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

  const permission = await fetch(`/admin/investors/${encodeURIComponent(investorId)}/documents/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pathname }),
  });
  const target = (await permission.json().catch(() => null)) as { signedUrl?: string; apiKey?: string | null; error?: string } | null;
  if (!permission.ok || !target?.signedUrl) throw new Error(target?.error ?? "The upload could not be started.");

  // Same request shape Supabase's own client sends for a signed upload.
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", new File([file], file.name, { type: DOCUMENT_KINDS[kind].contentType }));

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", target.signedUrl!);
    xhr.setRequestHeader("x-upsert", "false");
    if (target.apiKey) xhr.setRequestHeader("apikey", target.apiKey);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("The file could not be uploaded.")));
    xhr.onerror = () => reject(new Error("The file could not be uploaded. Check your connection."));
    xhr.send(form);
  });
  return pathname;
}
