"use client";

import { useId, useState } from "react";

/**
 * "A meeting was scheduled" with its date and time, for the note form and
 * Mark as contacted. The admin picks the time in their own time zone; the
 * browser turns it into an exact moment (UTC) and sends that with the zone's
 * name, so everyone sees the meeting at the right time.
 */
export function MeetingFields() {
  const id = useId();
  const [scheduled, setScheduled] = useState(false);
  // The picked "YYYY-MM-DDTHH:MM" and the zone it was picked in (set from the browser on change).
  const [pick, setPick] = useState({ value: "", zone: "" });

  const date = pick.value ? new Date(pick.value) : null;
  const instant = date && !Number.isNaN(date.getTime()) ? date.toISOString() : "";

  return (
    <div>
      <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-900">
        <input
          type="checkbox"
          checked={scheduled}
          onChange={(e) => setScheduled(e.target.checked)}
          className="h-4 w-4 accent-blue-800"
        />
        A meeting was scheduled
      </label>
      {scheduled && (
        <div className="mt-2">
          <input type="hidden" name="meetingScheduled" value="1" />
          <input type="hidden" name="meetingAt" value={instant} />
          <input type="hidden" name="meetingZone" value={pick.zone} />
          <label htmlFor={`${id}-when`} className="text-sm font-semibold text-slate-900">
            Meeting date and time
          </label>
          <input
            id={`${id}-when`}
            type="datetime-local"
            required
            value={pick.value}
            onChange={(e) =>
              setPick({ value: e.target.value, zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" })
            }
            aria-describedby={`${id}-help`}
            className="mt-2 block w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
          />
          <p id={`${id}-help`} className="mt-1.5 text-xs text-slate-500">
            Enter it in your own time zone{pick.zone ? ` (${pick.zone})` : ""}. It shows on the inquiry in Eastern
            Time (EST/EDT), so other admins can see that a meeting is booked and when.
          </p>
        </div>
      )}
    </div>
  );
}
