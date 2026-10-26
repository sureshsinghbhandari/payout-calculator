"use client";

import { useFormStatus } from "react-dom";
import { deleteInquiryAction, restoreInquiryAction, setInquiryStatusAction } from "@/app/admin/actions";
import type { InquiryStatus } from "@/lib/inquiry";

function SubmitButton({ children, tone }: { children: React.ReactNode; tone: "primary" | "danger" }) {
  const { pending } = useFormStatus();
  const styles =
    tone === "danger"
      ? "border-red-200 text-red-700 hover:bg-red-50"
      : "border-slate-300 text-slate-700 hover:bg-slate-50";
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg border bg-white px-3 py-1.5 text-sm font-semibold shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:cursor-wait disabled:opacity-60 ${styles}`}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

interface Props {
  id: string;
  status: InquiryStatus;
  name: string;
  canChangeStatus: boolean;
  canDelete: boolean;
}

export function InquiryActions({ id, status, name, canChangeStatus, canDelete }: Props) {
  if (status === "converted") return null;
  if (status === "deleted") {
    if (!canDelete) return null;
    return (
      <form action={restoreInquiryAction}>
        <input type="hidden" name="id" value={id} />
        <SubmitButton tone="primary">Restore</SubmitButton>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canChangeStatus && (
      <form action={setInquiryStatusAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="status" value={status === "new" ? "contacted" : "new"} />
        <SubmitButton tone="primary">{status === "new" ? "Mark as contacted" : "Mark as new"}</SubmitButton>
      </form>
      )}
      {canDelete && (
      <form
        action={deleteInquiryAction}
        onSubmit={(e) => {
          if (!window.confirm(`Delete the inquiry from ${name}? It moves to Deleted inquiries, where you can restore it.`)) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={id} />
        <SubmitButton tone="danger">Delete</SubmitButton>
      </form>
      )}
    </div>
  );
}
