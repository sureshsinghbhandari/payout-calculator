"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { markContactedAction, type NoteState } from "@/app/admin/note-actions";
import { NoteFields } from "./NoteForm";

/**
 * Mark as contacted: asks how the customer was contacted and what was said.
 * The note is required and is saved on the inquiry's activity.
 */
export function MarkContactedButton({ inquiryId, name }: { inquiryId: string; name: string }) {
  const [state, formAction, pending] = useActionState<NoteState, FormData>(markContactedAction, { status: "idle" });
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Close once saved; the page refreshes with the new status.
  useEffect(() => {
    if (state.status === "added") dialog.current?.close();
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
      >
        Mark as contacted
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-slate-200 bg-white p-0 text-left shadow-xl backdrop:bg-slate-900/40"
      >
        <form action={formAction} className="space-y-4 p-5">
          <input type="hidden" name="id" value={inquiryId} />
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              Mark {name} as contacted
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Add how you contacted them and what was said. It is saved on this inquiry&apos;s activity.
            </p>
          </div>
          <NoteFields
            state={state}
            defaultKind="call"
            label="Notes"
            placeholder="For example: Called, interested in quarterly payouts. Sending the plan details by email."
          />
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
            >
              {pending ? "Saving…" : "Save and mark contacted"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
