"use client";

import { upload } from "@vercel/blob/client";
import { useId, useState, useTransition } from "react";
import { deleteDocumentAction, registerDocumentAction, type DocumentActionResult } from "@/app/admin/investors/document-actions";
import {
  DOCUMENT_KINDS,
  DOCUMENT_TITLE_MAX,
  DOCUMENT_TYPE_LABELS,
  formatFileSize,
  kindFromFileName,
  MAX_DOCUMENT_BYTES,
  type PublicDocument,
} from "@/lib/documents";
import { formatTimestamp } from "./fields";
import { dangerButton, errorNotice, inputClass, primaryButton, successNotice, textLink } from "./ui";

interface Props {
  investorId: string;
  investorName: string;
  /** Blob folder this investor's files are uploaded to (from the server). */
  uploadFolder: string;
  documents: PublicDocument[];
}

/** Upload documents for an investor, and download or delete them. */
export function DocumentVault({ investorId, investorName, uploadFolder, documents }: Props) {
  return (
    <div className="space-y-6">
      <UploadForm investorId={investorId} investorName={investorName} uploadFolder={uploadFolder} />
      {documents.length === 0 ? (
        <p className="border-t border-slate-200 pt-5 text-sm text-slate-600">No documents yet.</p>
      ) : (
        <ul className="divide-y divide-slate-200 border-t border-slate-200">
          {documents.map((doc) => (
            <DocumentRow key={doc.id} investorId={investorId} doc={doc} />
          ))}
        </ul>
      )}
    </div>
  );
}

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}

function UploadForm({ investorId, investorName, uploadFolder }: Omit<Props, "documents">) {
  const [busy, setBusy] = useState<null | "uploading" | "checking">(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<DocumentActionResult | null>(null);
  // Changing the key clears the form after a successful upload.
  const [formKey, setFormKey] = useState(0);
  const baseId = useId();
  const ids = { title: `${baseId}-title`, type: `${baseId}-type`, file: `${baseId}-file`, fileHint: `${baseId}-file-hint` };
  const errors = result?.ok === false ? (result.fieldErrors ?? {}) : {};

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") ?? "").trim();
    const type = String(data.get("type") ?? "");
    const file = data.get("file");

    const fieldErrors: NonNullable<DocumentActionResult["fieldErrors"]> = {};
    if (title === "") fieldErrors.title = "Enter a title.";
    const kind = file instanceof File && file.size > 0 ? kindFromFileName(file.name) : null;
    if (!(file instanceof File) || file.size === 0) fieldErrors.file = "Choose a file.";
    else if (!kind) fieldErrors.file = "Choose a PDF, JPEG or PNG file.";
    else if (file.size > MAX_DOCUMENT_BYTES) fieldErrors.file = "Choose a file of at most 10 MB.";
    if (Object.keys(fieldErrors).length > 0 || !kind || !(file instanceof File)) {
      setResult({ ok: false, message: "Fix the highlighted fields.", fieldErrors });
      return;
    }

    setResult(null);
    setProgress(0);
    setBusy("uploading");
    try {
      const pathname = `${uploadFolder}${randomHex(16)}.${DOCUMENT_KINDS[kind].extension}`;
      try {
        await upload(pathname, file, {
          access: "private",
          handleUploadUrl: `/admin/investors/${encodeURIComponent(investorId)}/documents/upload`,
          contentType: DOCUMENT_KINDS[kind].contentType,
          onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
        });
      } catch (error) {
        console.error("Uploading a document failed", error);
        setResult({ ok: false, message: "The file could not be uploaded. Check your connection and try again." });
        return;
      }
      setBusy("checking");
      const registered = await registerDocumentAction({ investorId, pathname, title, type, fileName: file.name });
      setResult(registered);
      if (registered.ok) setFormKey((k) => k + 1);
    } catch {
      setResult({ ok: false, message: "The document could not be saved. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <form key={formKey} onSubmit={handleSubmit} className="space-y-4" noValidate>
      <p className="text-sm text-slate-600">
        Upload an agreement, certificate or other document for {investorName}. They can download it in the investor
        portal. PDF, JPEG or PNG, at most 10 MB.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={ids.title} className="text-sm font-semibold text-slate-900">
            Title
          </label>
          <input
            id={ids.title}
            name="title"
            type="text"
            required
            maxLength={DOCUMENT_TITLE_MAX}
            autoComplete="off"
            placeholder="e.g. Investment agreement 2026"
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errors.title ? `${ids.title}-error` : undefined}
            className={inputClass(errors.title)}
          />
          {errors.title && (
            <p id={`${ids.title}-error`} className="mt-1.5 text-xs font-medium text-red-700">
              {errors.title}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={ids.type} className="text-sm font-semibold text-slate-900">
            Type
          </label>
          <select
            id={ids.type}
            name="type"
            required
            defaultValue="agreement"
            aria-invalid={errors.type ? true : undefined}
            aria-describedby={errors.type ? `${ids.type}-error` : undefined}
            className={inputClass(errors.type)}
          >
            {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {errors.type && (
            <p id={`${ids.type}-error`} className="mt-1.5 text-xs font-medium text-red-700">
              {errors.type}
            </p>
          )}
        </div>
      </div>
      <div>
        <label htmlFor={ids.file} className="text-sm font-semibold text-slate-900">
          File
        </label>
        <input
          id={ids.file}
          name="file"
          type="file"
          required
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          aria-invalid={errors.file ? true : undefined}
          aria-describedby={errors.file ? `${ids.fileHint} ${ids.file}-error` : ids.fileHint}
          className="mt-1.5 block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-50"
        />
        <p id={ids.fileHint} className="mt-1.5 text-xs text-slate-500">
          PDF, JPEG or PNG, at most 10 MB.
        </p>
        {errors.file && (
          <p id={`${ids.file}-error`} className="mt-1.5 text-xs font-medium text-red-700">
            {errors.file}
          </p>
        )}
      </div>
      <button type="submit" disabled={busy !== null} className={primaryButton}>
        {busy === "uploading" ? `Uploading… ${progress}%` : busy === "checking" ? "Checking the file…" : "Upload document"}
      </button>
      {result && (
        <p role={result.ok ? "status" : "alert"} className={result.ok ? successNotice : errorNotice}>
          {result.message}
        </p>
      )}
    </form>
  );
}

function DocumentRow({ investorId, doc }: { investorId: string; doc: PublicDocument }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!window.confirm(`Delete "${doc.title}"? The investor can no longer download it. This cannot be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteDocumentAction(investorId, doc.id);
      if (!result.ok) setError(result.message);
    });
  }

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="break-words text-sm font-semibold text-slate-900">{doc.title}</p>
        <p className="mt-0.5 text-xs text-slate-600">
          {DOCUMENT_TYPE_LABELS[doc.type]} · {DOCUMENT_KINDS[doc.kind].label}, {formatFileSize(doc.size)} · Uploaded{" "}
          {formatTimestamp(doc.uploadedAt)}
          {doc.uploadedBy && <> by {doc.uploadedBy}</>}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-xs font-medium text-red-700">
            {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <a
          href={`/admin/investors/${encodeURIComponent(investorId)}/documents/${encodeURIComponent(doc.id)}`}
          className={`text-sm ${textLink}`}
        >
          Download<span className="sr-only"> {doc.title}</span>
        </a>
        <button type="button" onClick={handleDelete} disabled={pending} className={dangerButton}>
          {pending ? "Deleting…" : "Delete"}
          <span className="sr-only"> {doc.title}</span>
        </button>
      </div>
    </li>
  );
}
