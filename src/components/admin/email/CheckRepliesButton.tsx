"use client";

import { useActionState } from "react";
import { checkRepliesAction, type CheckRepliesState } from "@/app/admin/email-actions";

/** Checks the Gmail inbox for customer replies now. */
export function CheckRepliesButton() {
  const [state, formAction, pending] = useActionState<CheckRepliesState, FormData>(checkRepliesAction, { status: "idle" });
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Checking…" : "Check for replies"}
      </button>
      {state.message && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`text-sm font-medium ${state.status === "error" ? "text-red-700" : "text-slate-700"}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
