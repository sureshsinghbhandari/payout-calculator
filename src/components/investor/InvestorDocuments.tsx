import { DOCUMENT_KINDS, DOCUMENT_TYPE_LABELS, formatFileSize, type PublicDocument } from "@/lib/documents";
import { formatIsoDate } from "@/lib/format";
import { InvestorCard } from "./InvestorFrame";

/**
 * The signed-in investor's documents, each with a Download link. Downloads go
 * through /portal/documents/<id>, which checks the session again.
 * `documents` is null when they could not be loaded.
 */
export function InvestorDocuments({ documents }: { documents: PublicDocument[] | null }) {
  return (
    <section aria-labelledby="documents-heading">
      <h2 id="documents-heading" className="mb-3 text-xl font-semibold text-slate-900">
        Your documents
      </h2>
      <InvestorCard>
        {documents === null ? (
          <p role="alert" className="text-sm text-slate-700">
            Your documents could not be loaded right now. Reload the page to try again.
          </p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-slate-600">
            No documents yet. When our team adds your agreement, certificates or other documents, you can download them
            here.
          </p>
        ) : (
          <ul className="-my-3 divide-y divide-slate-200">
            {documents.map((doc) => (
              <li key={doc.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words font-semibold text-slate-900">{doc.title}</p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {DOCUMENT_TYPE_LABELS[doc.type]} · {DOCUMENT_KINDS[doc.kind].label}, {formatFileSize(doc.size)} · Added{" "}
                    {formatIsoDate(doc.uploadedAt.slice(0, 10))}
                  </p>
                </div>
                <a
                  href={`/portal/documents/${encodeURIComponent(doc.id)}`}
                  className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-blue-900 bg-white px-4 py-2 text-sm font-semibold text-blue-900 shadow-sm hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 sm:self-auto"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                    <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
                  </svg>
                  Download<span className="sr-only"> {doc.title}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </InvestorCard>
    </section>
  );
}
