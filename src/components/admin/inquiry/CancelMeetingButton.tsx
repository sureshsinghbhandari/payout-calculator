"use client";

import { useFormStatus } from "react-dom";
import { cancelMeetingAction } from "@/app/admin/note-actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 shadow-sm hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Cancelling…" : "Cancel meeting"}
    </button>
  );
}

/** Cancels the scheduled meeting; the cancellation is added to the inquiry's notes. */
export function CancelMeetingButton({ inquiryId }: { inquiryId: string }) {
  return (
    <form
      action={cancelMeetingAction}
      onSubmit={(e) => {
        if (!window.confirm("Cancel this meeting? A note about the cancellation is added to the inquiry.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={inquiryId} />
      <Submit />
    </form>
  );
}
