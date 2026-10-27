"use client";

import { useActionState, useId } from "react";
import { addInquiryNoteAction, type NoteState } from "@/app/admin/note-actions";
import { NOTE_KIND_LABELS, NOTE_KINDS, NOTE_MAX_LENGTH } from "@/lib/inquiry-log";

/** Adds a note, call or meeting to an inquiry. */
export function NoteForm({ inquiryId }: { inquiryId: string }) {
  const [state, formAction, pending] = useActionState<NoteState, FormData>(addInquiryNoteAction, { status: "idle" });
  const id = useId();

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={inquiryId} />
      <fieldset>
        <legend className="text-sm font-semibold text-slate-900">Type</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {NOTE_KINDS.map((kind, index) => (
            <label
              key={kind}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 has-[:checked]:border-blue-700 has-[:checked]:bg-blue-50 has-[:checked]:font-semibold"
            >
              <input type="radio" name="kind" value={kind} defaultChecked={index === 0} className="accent-blue-800" />
              {NOTE_KIND_LABELS[kind]}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`${id}-text`} className="text-sm font-semibold text-slate-900">
          Details
        </label>
        <textarea
          // A new, empty box after each saved note; the text is kept after an error.
          key={state.status === "added" ? state.savedAt : "note"}
          id={`${id}-text`}
          name="text"
          rows={3}
          required
          maxLength={NOTE_MAX_LENGTH}
          defaultValue={state.status === "error" ? state.text : ""}
          placeholder="For example: Called, wants to invest after the 15th. Call again next week."
          className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm leading-relaxed text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
        />
      </div>
      {state.status === "error" && state.message && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {state.message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-blue-900 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? "Saving…" : "Add to inquiry"}
        </button>
        {state.status === "added" && (
          <p role="status" className="text-sm font-medium text-emerald-700">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
