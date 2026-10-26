"use client";

import { useId, useRef, useState } from "react";
import { SETUP_LINK_HOURS } from "@/lib/accounts";
import { formatTimestamp, primaryButton, secondaryButton } from "./ui";

interface Props {
  /** The one-time token from the server. The full link is built here, in the browser. */
  token: string;
  /** Whose link this is, for the label. */
  name: string;
  expiresAt?: string;
  onDone: () => void;
}

/** Shows a freshly created setup link once, with a Copy button. */
export function SetupLinkPanel({ token, name, expiresAt, onDone }: Props) {
  const inputId = useId();
  const helpId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = `${origin}/setup?token=${encodeURIComponent(token)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopy("copied");
    } catch {
      // Clipboard access can be blocked: select the text so it can be copied by hand.
      inputRef.current?.select();
      setCopy("failed");
    }
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
      <label htmlFor={inputId} className="block text-sm font-semibold text-slate-900">
        Setup link for {name}
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-describedby={helpId}
          className="block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
        />
        <button type="button" onClick={copyLink} className={`${primaryButton} shrink-0`}>
          {copy === "copied" ? "Copied" : "Copy link"}
        </button>
      </div>
      <p id={helpId} className="mt-2 text-sm text-slate-700">
        This link is shown only once. Send it to {name} privately. It works once and expires
        {expiresAt ? ` on ${formatTimestamp(expiresAt)}` : ""} ({SETUP_LINK_HOURS} hours). Any earlier link for this
        account no longer works.
      </p>
      <p role="status" aria-live="polite" className="mt-1 text-sm font-medium text-slate-700">
        {copy === "copied" && "Link copied to the clipboard."}
        {copy === "failed" && "Copying is blocked in this browser. The link is selected: copy it with your keyboard."}
      </p>
      <button type="button" onClick={onDone} className={`${secondaryButton} mt-3`}>
        Done
      </button>
    </div>
  );
}
