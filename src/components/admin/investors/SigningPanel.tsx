"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { registerDocumentAction, type DocumentActionResult } from "@/app/admin/investors/document-actions";
import { markSentAction, type SigningActionResult } from "@/app/admin/investors/signing-actions";
import { formatFileSize, kindFromFileName, MAX_DOCUMENT_BYTES, type PublicDocument } from "@/lib/documents";
import { formatIsoDate } from "@/lib/format";
import { SIGNING_STATUS_BADGES, SIGNING_STATUS_LABELS, type SigningKind, type SigningStatus } from "@/lib/signing";
import { DocumentLinks } from "./DocumentVault";
import { formatTimestamp } from "./fields";
import { errorNotice, inputClass, primaryButton, secondaryButton, successNotice } from "./ui";
import { uploadInvestorFile } from "./upload-file";

/** One document the investor signs, ready to show. Built on the server (see the investor page). */
export interface SigningItemView {
  key: string;
  kind: SigningKind;
  title: string;
  summary: string;
  status: SigningStatus;
  /** Step 1: last download (ISO) and who. */
  preparedAt: string | null;
  preparedBy: string;
  /** Step 2: the date marked as sent in BoldSign (YYYY-MM-DD) and who marked it. */
  sentOn: string | null;
  sentBy: string;
  /** Step 4: the signed PDFs and BoldSign audit trails kept for this document, newest first. */
  signed: PublicDocument[];
  auditTrails: PublicDocument[];
}

interface Props {
  investorId: string;
  investorName: string;
  investorEmail: string;
  /** Blob folder this investor's files are uploaded to (from the server). */
  uploadFolder: string;
  /** Today in Eastern Time (YYYY-MM-DD): the default "sent on" date. */
  today: string;
  /** Latest date accepted for "sent on". */
  latestSentDate: string;
  /** Company details in the template that still need replacing. */
  placeholders: string[];
  items: SigningItemView[];
}

/**
 * Guided signing with BoldSign, done by hand outside the app. For each document the investor signs:
 *   1. download the pre-filled PDF   (the app)
 *   2. send it in BoldSign           (BoldSign website; the app only notes the date)
 *   3. download the signed PDF       (BoldSign website)
 *   4. upload it here and keep it    (the app)
 * Steps 2 and 3 are the SendStep and CollectStep components. A BoldSign API integration would replace just those
 * two; PrepareStep, StoredStep and the statuses stay as they are (see lib/signing.ts).
 */
export function SigningPanel({ items, placeholders, ...rest }: Props) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        Each investor signs the documents below with BoldSign. You send them from BoldSign&rsquo;s website and bring the
        signed PDFs back here, so everything is kept with {rest.investorName}&rsquo;s record. Follow the four steps under
        each document.
      </p>
      {placeholders.length > 0 && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          The document template still has placeholder text for the {placeholders.join(", ")}. Fill it in before you send a
          document to an investor (see Investor documents and BoldSign in the README).
        </p>
      )}
      <ul className="space-y-4">
        {items.map((item) => (
          <li key={item.key}>
            <SigningItemCard item={item} {...rest} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SigningItemCard({ item, ...rest }: { item: SigningItemView } & Omit<Props, "items" | "placeholders">) {
  const headingId = useId();
  return (
    <details open={item.status !== "signed"} className="group rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-xl p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 sm:px-5">
        <span className="min-w-0">
          <span id={headingId} className="block text-sm font-semibold text-slate-900">
            {item.title}
          </span>
          <span className="mt-0.5 block text-xs text-slate-600">{item.summary}</span>
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${SIGNING_STATUS_BADGES[item.status]}`}>
          {SIGNING_STATUS_LABELS[item.status]}
        </span>
      </summary>
      <ol aria-labelledby={headingId} className="space-y-6 border-t border-slate-200 p-4 sm:p-5">
        <PrepareStep item={item} investorId={rest.investorId} investorName={rest.investorName} />
        <SendStep
          item={item}
          investorId={rest.investorId}
          investorName={rest.investorName}
          investorEmail={rest.investorEmail}
          today={rest.today}
          latestSentDate={rest.latestSentDate}
        />
        <CollectStep item={item} investorId={rest.investorId} uploadFolder={rest.uploadFolder} />
        <StoredStep item={item} investorId={rest.investorId} />
      </ol>
    </details>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-900 text-xs font-semibold text-white"
      >
        {number}
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">
          <span className="sr-only">Step {number}: </span>
          {title}
        </h3>
        {children}
      </div>
    </li>
  );
}

// ---------- step 1: prepare (the app) ----------

function PrepareStep({ item, investorId, investorName }: { item: SigningItemView; investorId: string; investorName: string }) {
  const router = useRouter();
  const href = `/admin/investors/${encodeURIComponent(investorId)}/signing/${encodeURIComponent(item.key)}`;
  return (
    <Step number={1} title="Download this document and upload it to BoldSign to get the investor's signature">
      <p className="text-sm text-slate-700">
        The PDF is filled in from {investorName}&rsquo;s details on file today: name, contact details, and
        {item.kind === "agreement" ? " the amount, dates, term and payout schedule of this investment" : " their investments"}.
        If any of that changes, download it again before you send it.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {/* A plain link: the file is a download, so the page stays put. The status is refreshed shortly after. */}
        <a href={href} onClick={() => setTimeout(() => router.refresh(), 2500)} className={primaryButton}>
          Download PDF to sign<span className="sr-only"> ({item.title})</span>
        </a>
        {item.preparedAt && (
          <span className="text-xs text-slate-600">
            Last downloaded {formatTimestamp(item.preparedAt)}
            {item.preparedBy && <> by {item.preparedBy}</>}
          </span>
        )}
      </div>
    </Step>
  );
}

// ---------- step 2: send in BoldSign (replaceable by an API step) ----------

function SendStep({
  item,
  investorId,
  investorName,
  investorEmail,
  today,
  latestSentDate,
}: {
  item: SigningItemView;
  investorId: string;
  investorName: string;
  investorEmail: string;
  today: string;
  latestSentDate: string;
}) {
  const isAgreement = item.kind === "agreement";
  return (
    <Step number={2} title="Send it for signature in BoldSign">
      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700 marker:text-slate-500">
        <li>In BoldSign, start a new request to send a document for signature, and upload the PDF you just downloaded.</li>
        <li>
          Add the investor as the signer, with their name and email exactly as shown here:
          <dl className="mt-2 space-y-1.5 rounded-lg bg-slate-50 p-3">
            <CopyRow label="Signer name" value={investorName} />
            {investorEmail ? (
              <CopyRow label="Signer email" value={investorEmail} />
            ) : (
              <div className="text-sm font-medium text-red-700">
                No email address is on file. Add one under Contact details first, because BoldSign sends the request there.
              </div>
            )}
            <CopyRow label="Document title" value={item.title} />
          </dl>
        </li>
        {isAgreement && (
          <li>
            If the company signs too, add yourself as a second signer and set the signing order so the investor signs
            first.
          </li>
        )}
        <li>
          Place these fields on the PDF, on the matching lines:
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              Investor: a <strong>Signature</strong> and a <strong>Date signed</strong> field on the signature block at the
              end, assigned to the investor.
            </li>
            <li>
              Investor: a required <strong>Text box</strong> labelled Address, on the blank Address line in the Investor
              details at the top, so the investor fills in their address.
            </li>
            {isAgreement && (
              <li>
                Company: a <strong>Signature</strong>, a <strong>Date signed</strong> and a <strong>Text box</strong> for the
                signer&rsquo;s name, assigned to you.
              </li>
            )}
          </ul>
        </li>
        <li>Send the request. BoldSign emails the investor a link to sign.</li>
      </ol>
      <SentControl item={item} investorId={investorId} today={today} latestSentDate={latestSentDate} />
    </Step>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the value is on screen to copy by hand.
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <dt className="w-28 shrink-0 text-xs font-semibold text-slate-600">{label}</dt>
      <dd className="min-w-0 break-all font-mono text-sm text-slate-900">{value}</dd>
      <button type="button" onClick={copy} className="text-xs font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950">
        {copied ? "Copied" : "Copy"}
        <span className="sr-only"> {label.toLowerCase()}</span>
      </button>
    </div>
  );
}

/** "I sent it in BoldSign on <date>": the owner's note, since the app cannot see BoldSign. */
function SentControl({
  item,
  investorId,
  today,
  latestSentDate,
}: {
  item: SigningItemView;
  investorId: string;
  today: string;
  latestSentDate: string;
}) {
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(item.sentOn ?? today);
  const [result, setResult] = useState<SigningActionResult | null>(null);
  const dateId = useId();

  function save(sentOn: string | null) {
    setResult(null);
    startTransition(async () => setResult(await markSentAction(investorId, item.key, sentOn)));
  }

  if (item.sentOn) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-900">
          Marked as sent on {formatIsoDate(item.sentOn)}
          {item.sentBy && <span className="font-normal text-slate-600"> by {item.sentBy}</span>}.
        </p>
        <button type="button" onClick={() => save(null)} disabled={pending} className={secondaryButton}>
          {pending ? "Saving…" : "Remove the sent mark"}
        </button>
        <Result result={result} />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={dateId} className="text-sm font-semibold text-slate-900">
            Date sent in BoldSign
          </label>
          <input
            id={dateId}
            type="date"
            value={date}
            max={latestSentDate}
            min="2000-01-01"
            onChange={(event) => setDate(event.target.value)}
            aria-invalid={result?.fieldError ? true : undefined}
            className={`${inputClass(result?.fieldError)} w-auto`}
          />
        </div>
        <button type="button" onClick={() => save(date)} disabled={pending || date === ""} className={secondaryButton}>
          {pending ? "Saving…" : "Mark as sent"}
        </button>
      </div>
      {result?.fieldError && <p className="text-xs font-medium text-red-700">{result.fieldError}</p>}
      <Result result={result} hideFieldError />
      <p className="text-xs text-slate-500">Optional. It only changes the status to Sent for signature.</p>
    </div>
  );
}

function Result({ result, hideFieldError }: { result: { ok: boolean; message: string; fieldError?: string } | null; hideFieldError?: boolean }) {
  if (!result || (hideFieldError && result.fieldError)) return null;
  return (
    <p role={result.ok ? "status" : "alert"} className={result.ok ? successNotice : errorNotice}>
      {result.message}
    </p>
  );
}

// ---------- step 3: collect and upload (replaceable by an API step) ----------

function CollectStep({ item, investorId, uploadFolder }: { item: SigningItemView; investorId: string; uploadFolder: string }) {
  const [busy, setBusy] = useState<null | "uploading" | "checking">(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<DocumentActionResult | null>(null);
  // Changing the key clears the form after a successful upload.
  const [formKey, setFormKey] = useState(0);
  const baseId = useId();
  const fileId = `${baseId}-file`;
  const fileError = result?.ok === false ? result.fieldErrors?.file : undefined;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get("file");
    const type = data.get("type") === "certificate" ? "certificate" : "signed-agreement";

    let error: string | null = null;
    if (!(file instanceof File) || file.size === 0) error = "Choose the PDF you downloaded from BoldSign.";
    else if (kindFromFileName(file.name) !== "pdf") error = "Choose a PDF file.";
    else if (file.size > MAX_DOCUMENT_BYTES) error = "Choose a file of at most 10 MB.";
    if (error || !(file instanceof File)) {
      setResult({ ok: false, message: "Fix the highlighted field.", fieldErrors: { file: error ?? "Choose a file." } });
      return;
    }

    setResult(null);
    setProgress(0);
    setBusy("uploading");
    try {
      let pathname: string;
      try {
        pathname = await uploadInvestorFile({ investorId, uploadFolder, file, kind: "pdf", onProgress: setProgress });
      } catch (uploadError) {
        console.error("Uploading a signed document failed", uploadError);
        setResult({ ok: false, message: "The file could not be uploaded. Check your connection and try again." });
        return;
      }
      setBusy("checking");
      const registered = await registerDocumentAction({
        investorId,
        pathname,
        title: "",
        type,
        fileName: file.name,
        signingKey: item.key,
      });
      setResult(registered);
      if (registered.ok) setFormKey((k) => k + 1);
    } catch {
      setResult({ ok: false, message: "The document could not be saved. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Step number={3} title="When the investor has signed, download the signed PDF from BoldSign and upload it here">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700 marker:text-slate-500">
        <li>BoldSign emails you when everyone has signed. Open the document there; its status is Completed.</li>
        <li>Download the signed PDF.</li>
        <li>
          Also download the audit trail (BoldSign calls it the certificate of completion). It records who signed, when and
          from where, so keep it with the signed copy.
        </li>
        <li>Choose each file below and upload it.</li>
      </ol>
      <form key={formKey} onSubmit={handleSubmit} noValidate className="space-y-3">
        <fieldset>
          <legend className="text-sm font-semibold text-slate-900">This file is</legend>
          <div className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-slate-800">
            <label className="flex items-center gap-2">
              <input type="radio" name="type" value="signed-agreement" defaultChecked className="h-4 w-4" />
              The signed document
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="type" value="certificate" className="h-4 w-4" />
              The BoldSign audit trail
            </label>
          </div>
        </fieldset>
        <div>
          <label htmlFor={fileId} className="text-sm font-semibold text-slate-900">
            PDF file
          </label>
          <input
            id={fileId}
            name="file"
            type="file"
            required
            accept=".pdf,application/pdf"
            aria-invalid={fileError ? true : undefined}
            aria-describedby={fileError ? `${fileId}-error` : undefined}
            className="mt-1.5 block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-50"
          />
          {fileError && (
            <p id={`${fileId}-error`} className="mt-1.5 text-xs font-medium text-red-700">
              {fileError}
            </p>
          )}
        </div>
        <button type="submit" disabled={busy !== null} className={primaryButton}>
          {busy === "uploading" ? `Uploading… ${progress}%` : busy === "checking" ? "Checking the file…" : "Upload signed PDF"}
        </button>
        {result && (
          <p role={result.ok ? "status" : "alert"} className={result.ok ? successNotice : errorNotice}>
            {result.message}
          </p>
        )}
      </form>
    </Step>
  );
}

// ---------- step 4: what is stored ----------

function StoredStep({ item, investorId }: { item: SigningItemView; investorId: string }) {
  return (
    <Step number={4} title="Kept with the investor's record">
      <p className="text-sm text-slate-700">
        Status: <span className="font-semibold text-slate-900">{SIGNING_STATUS_LABELS[item.status]}</span>.
        {item.status === "signed" && item.signed[0] && (
          <>
            {" "}
            Signed copy stored {formatTimestamp(item.signed[0].uploadedAt)}
            {item.signed[0].uploadedBy && <> by {item.signed[0].uploadedBy}</>}. {" "}
          </>
        )}
        {item.status === "signed" ? "The investor can also download it in their portal." : "Nothing signed is stored yet."}
      </p>
      {item.signed.length + item.auditTrails.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
          {[...item.signed, ...item.auditTrails].map((doc) => (
            <li key={doc.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-slate-900">{doc.title}</p>
                <p className="mt-0.5 text-xs text-slate-600">
                  PDF, {formatFileSize(doc.size)} · Uploaded {formatTimestamp(doc.uploadedAt)}
                  {doc.uploadedBy && <> by {doc.uploadedBy}</>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <DocumentLinks investorId={investorId} doc={doc} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Step>
  );
}
