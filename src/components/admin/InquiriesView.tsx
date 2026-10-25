import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { adminConfig, isAdmin } from "@/lib/server/admin-auth";
import { INQUIRY_LIST_LIMIT, isInquiryStorageConfigured, listInquiries } from "@/lib/server/inquiry-store";
import { AdminCard, AdminFrame } from "./AdminFrame";
import { InquiryCard } from "./InquiryCard";

/** Inquiries list for admins: active ones, or the soft-deleted ones. */
export async function InquiriesView({ view }: { view: "active" | "deleted" }) {
  await connection();
  // Sign-in only happens on /admin (behind the firewall rate limit).
  if (!adminConfig().ok || !(await isAdmin())) redirect("/admin");

  let data: Awaited<ReturnType<typeof listInquiries>> | null = null;
  try {
    data = await listInquiries();
  } catch (error) {
    console.error("Listing inquiries failed", error);
  }

  const all = data?.inquiries ?? [];
  const active = all.filter((i) => i.status !== "deleted");
  const deleted = all
    .filter((i) => i.status === "deleted")
    .sort((a, b) => ((b.deletedAt ?? "") > (a.deletedAt ?? "") ? 1 : -1));
  const shown = view === "active" ? active : deleted;
  const newCount = active.filter((i) => i.status === "new").length;

  return (
    <AdminFrame signedIn>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {view === "active" ? "Inquiries" : "Deleted inquiries"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {!data
              ? "Inquiries sent from the calculator."
              : view === "active"
                ? `${active.length} ${active.length === 1 ? "inquiry" : "inquiries"}, ${newCount} new. Newest first.`
                : `${deleted.length} deleted ${deleted.length === 1 ? "inquiry" : "inquiries"}, most recently deleted first. Restore one to move it back to Inquiries.`}
            {data && data.total > INQUIRY_LIST_LIMIT && ` Showing the newest ${INQUIRY_LIST_LIMIT} stored.`}
          </p>
        </div>
        {view === "active" ? (
          <Link
            href="/admin/inquiries/deleted"
            className="text-sm font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950"
          >
            Deleted inquiries{data ? ` (${deleted.length})` : ""}
          </Link>
        ) : (
          <Link
            href="/admin/inquiries"
            className="text-sm font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950"
          >
            Back to inquiries
          </Link>
        )}
      </div>

      {!isInquiryStorageConfigured() ? (
        <AdminCard>
          <p className="text-sm text-slate-700">Storage is not connected, so inquiries cannot be received or shown.</p>
        </AdminCard>
      ) : !data ? (
        <AdminCard>
          <p role="alert" className="text-sm font-medium text-red-700">
            Inquiries could not be loaded. Reload the page to try again.
          </p>
        </AdminCard>
      ) : shown.length === 0 ? (
        <AdminCard>
          <p className="text-sm text-slate-600">
            {view === "active"
              ? "No inquiries yet. They appear here when visitors select Send inquiry."
              : "No deleted inquiries."}
          </p>
        </AdminCard>
      ) : (
        <ul className="space-y-4">
          {shown.map((inquiry) => (
            <InquiryCard key={inquiry.id} inquiry={inquiry} />
          ))}
        </ul>
      )}
    </AdminFrame>
  );
}
