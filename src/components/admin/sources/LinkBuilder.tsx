"use client";

import { useId, useState } from "react";
import { LEAD_SOURCE_MAX } from "@/lib/inquiry";
import { TrackingLink } from "./TrackingLink";

/** "Seminar Nov 2026" becomes "seminar-nov-2026": lowercase letters, digits and hyphens. */
function toSourceName(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, LEAD_SOURCE_MAX)
    .replace(/-+$/, "");
}

/** Builds the tracking link and QR code for a new source. Nothing is saved: the source appears once an inquiry uses it. */
export function LinkBuilder() {
  const [name, setName] = useState("");
  const id = useId();
  const source = toSourceName(name);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${id}-name`} className="text-sm font-semibold text-slate-900">
          Source name
        </label>
        <input
          id={`${id}-name`}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          autoComplete="off"
          placeholder="For example: seminar-2026-11"
          aria-describedby={`${id}-help`}
          className="mt-1.5 block w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
        />
        <p id={`${id}-help`} className="mt-1 text-xs text-slate-500">
          Lowercase letters, digits and hyphens, at most {LEAD_SOURCE_MAX} characters. Other characters become hyphens.
          {source && name !== source && (
            <>
              {" "}
              The source is <span className="font-mono font-semibold text-slate-700">{source}</span>.
            </>
          )}
        </p>
      </div>
      {source && <TrackingLink source={source} />}
    </div>
  );
}
