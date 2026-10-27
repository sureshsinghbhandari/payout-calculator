"use client";

import { useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DEFAULT_LEAD_SOURCE } from "@/lib/inquiry";
import { encodeQr, QR_QUIET_ZONE, qrPath, qrSvg } from "@/lib/qr";
import { primaryButton, secondaryButton } from "../investors/ui";

const noopSubscribe = () => () => {};

/** The calculator link for a lead source; the website's own link has no ?source=. */
export function trackingPath(source: string): string {
  return source === DEFAULT_LEAD_SOURCE ? "/inquiries" : `/inquiries?source=${encodeURIComponent(source)}`;
}

/** A QR code as inline SVG (dark modules on a white square with the standard light border). */
function QrCode({ text, label }: { text: string; label: string }) {
  const modules = useMemo(() => encodeQr(text), [text]);
  const size = modules.length + QR_QUIET_ZONE * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="h-40 w-40 shrink-0 rounded-lg border border-slate-200 bg-white"
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={qrPath(modules)} fill="#0f172a" />
    </svg>
  );
}

/** Full tracking link for a source with a Copy button, its QR code and a download of the QR code. */
export function TrackingLink({ source }: { source: string }) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [copy, setCopy] = useState<{ url: string; result: "copied" | "failed" } | null>(null);
  // The full link is built in the browser, from the address this admin page is open on.
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
  const url = `${origin}${trackingPath(source)}`;
  const copied = copy?.url === url ? copy.result : null;
  const download = useMemo(
    () => (origin ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(url))}` : ""),
    [origin, url],
  );

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopy({ url, result: "copied" });
    } catch {
      // Clipboard access can be blocked: select the text so it can be copied by hand.
      inputRef.current?.select();
      setCopy({ url, result: "failed" });
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <label htmlFor={inputId} className="block text-sm font-semibold text-slate-900">
          Link for {source}
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
          />
          <button type="button" onClick={copyLink} className={`${primaryButton} shrink-0`}>
            {copied === "copied" ? "Copied" : "Copy link"}
          </button>
        </div>
        <p role="status" aria-live="polite" className="mt-1 text-sm font-medium text-slate-700">
          {copied === "copied" && "Link copied to the clipboard."}
          {copied === "failed" && "Copying is blocked in this browser. The link is selected: copy it with your keyboard."}
        </p>
        {download && (
          <a href={download} download={`qr-${source}.svg`} className={`${secondaryButton} mt-2`}>
            Download QR code (SVG)
          </a>
        )}
      </div>
      {origin && <QrCode text={url} label={`QR code for ${url}`} />}
    </div>
  );
}
