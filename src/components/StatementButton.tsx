"use client";

import { useState } from "react";
import type { StatementResult } from "@/lib/statement";

/**
 * "Download statement" for one recorded investment. `load` is a server action
 * (bound to the investment) that checks the session and returns the statement
 * data; the Excel file is then built in the browser, with the spreadsheet
 * library loaded only on click.
 */
export function StatementButton({ load, label }: { load: () => Promise<StatementResult>; label: string }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      const result = await load();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const { buildStatementFile, XLSX_MIME_TYPE } = await import("@/lib/excel");
      const { data, fileName } = await buildStatementFile(result.data);
      const url = URL.createObjectURL(new Blob([data], { type: XLSX_MIME_TYPE }));
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("The statement could not be created. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        aria-label={label}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-900 bg-white px-4 py-2.5 text-sm font-semibold text-blue-900 shadow-sm transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
          <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
        </svg>
        {downloading ? "Preparing statement…" : "Download statement"}
      </button>
      {error && (
        <p role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
