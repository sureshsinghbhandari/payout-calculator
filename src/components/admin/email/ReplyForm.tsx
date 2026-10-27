"use client";

import { useActionState, useId } from "react";
import { sendInquiryReplyAction, type ReplyState } from "@/app/admin/email-actions";
import { EMAIL_LIMITS } from "@/lib/email";

/** Staff reply to the customer of an inquiry. */
export function ReplyForm({ inquiryId, to, subject, draft }: { inquiryId: string; to: string; subject: string; draft: string }) {
  const [state, formAction, pending] = useActionState<ReplyState, FormData>(sendInquiryReplyAction, { status: "idle" });
  const id = useId();
  // After a successful send the form starts again from the draft (the key resets the textarea).
  const value = state.status === "error" ? (state.text ?? draft) : draft;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={inquiryId} />
      <p className="text-sm text-slate-700">
        <span className="font-semibold text-slate-900">To:</span> <span className="break-all">{to}</span>
        <br />
        <span className="font-semibold text-slate-900">Subject:</span> {subject}
      </p>
      <div>
        <label htmlFor={`${id}-text`} className="text-sm font-semibold text-slate-900">
          Message
        </label>
        <textarea
          key={state.status === "sent" ? `sent-${state.message}` : "draft"}
          id={`${id}-text`}
          name="text"
          rows={9}
          required
          maxLength={EMAIL_LIMITS.reply}
          defaultValue={value}
          aria-describedby={`${id}-help`}
          className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm leading-relaxed text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
        />
        <p id={`${id}-help`} className="mt-1.5 text-xs text-slate-500">
          Sent as plain text from the company address. The customer&apos;s reply will appear on this page.
        </p>
      </div>
      {state.status === "error" && state.message && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {state.message}
        </p>
      )}
      {state.status === "sent" && (
        <p role="status" className="text-sm font-medium text-emerald-700">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-blue-900 px-6 py-2.5 text-base font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Sending…" : "Send email"}
      </button>
    </form>
  );
}
