"use client";

import { useActionState, useId } from "react";
import { saveFollowUpAction, type FollowUpState } from "@/app/admin/follow-up-actions";
import type { InquiryAssignee } from "@/lib/inquiry";

const fieldClass =
  "mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/30";

/** Who follows the inquiry up and when. Saving records each change on the inquiry's activity. */
export function FollowUpForm({
  inquiryId,
  users,
  currentUserId,
  assignedTo,
  followUpDate,
}: {
  inquiryId: string;
  /** Active admin users who can be assigned. */
  users: InquiryAssignee[];
  currentUserId: string;
  assignedTo?: InquiryAssignee;
  followUpDate?: string;
}) {
  const [state, formAction, pending] = useActionState<FollowUpState, FormData>(saveFollowUpAction, { status: "idle" });
  const id = useId();
  // Someone assigned before they were deactivated stays selectable, so saving the date does not unassign them.
  const options = assignedTo && !users.some((u) => u.id === assignedTo.id) ? [...users, assignedTo] : users;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={inquiryId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-assignee`} className="text-sm font-semibold text-slate-900">
            Assigned to
          </label>
          <select id={`${id}-assignee`} name="assignedTo" defaultValue={assignedTo?.id ?? ""} className={fieldClass}>
            <option value="">Not assigned</option>
            {options.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.id === currentUserId ? " (you)" : ""}
                {users.some((a) => a.id === u.id) ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-date`} className="text-sm font-semibold text-slate-900">
            Follow-up date <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            id={`${id}-date`}
            type="date"
            name="followUpDate"
            min="2000-01-01"
            max="2100-12-31"
            defaultValue={followUpDate ?? ""}
            className={fieldClass}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-blue-900 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state.status === "saved" && (
          <p role="status" className="text-sm font-medium text-emerald-700">
            {state.message}
          </p>
        )}
        {state.status === "error" && (
          <p role="alert" className="text-sm font-medium text-red-700">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
