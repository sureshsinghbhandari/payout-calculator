import Link from "next/link";
import { after, connection } from "next/server";
import { can, toPublicAdmin } from "@/lib/accounts";
import {
  INQUIRY_FILTERS,
  INQUIRY_SEARCH_MAX,
  matchesInquiryFilter,
  matchesInquirySearch,
  parseInquiryFilter,
  type InquiryFilter,
} from "@/lib/inquiry";
import { requireAdminPage } from "@/lib/server/auth";
import { checkGmailRepliesQuietly, emailStatus } from "@/lib/server/email";
import { INQUIRY_LIST_LIMIT, isInquiryStorageConfigured, listInquiries } from "@/lib/server/inquiry-store";
import { AdminCard, AdminFrame } from "./AdminFrame";
import { InquiryCard } from "./InquiryCard";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Link to the list with this search and filter; the defaults are left out of the URL. */
function listHref(base: string, query: string, filter: InquiryFilter): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (filter !== "open") params.set("status", filter);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Inquiries list for admins: active ones, or the soft-deleted ones. Search by
 * name, email, phone or reference; active ones are filtered by status, and
 * converted ones are hidden unless asked for.
 */
export async function InquiriesView({ view, searchParams }: { view: "active" | "deleted"; searchParams: SearchParams }) {
  await connection();
  const params = await searchParams;
  const query = first(params.q).trim().slice(0, INQUIRY_SEARCH_MAX);
  const filter = parseInquiryFilter(first(params.status));
  const base = view === "active" ? "/admin/inquiries" : "/admin/inquiries/deleted";
  // Sign-in only happens on /admin (behind the firewall rate limit).
  const user = await requireAdminPage(view === "deleted" ? "inquiries.delete" : "inquiries.view");
  const permissions = {
    status: can(user.role, "inquiries.status"),
    remove: can(user.role, "inquiries.delete"),
    convert: can(user.role, "inquiries.convert"),
    investors: can(user.role, "investors.manage"),
    purge: can(user.role, "inquiries.purge"),
  };

  // With Gmail, customer replies are picked up by checking the inbox in the background.
  const email = emailStatus();
  if (email.provider === "gmail" && email.receiving) after(checkGmailRepliesQuietly);

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
  const shown = (view === "active" ? active.filter((i) => matchesInquiryFilter(i, filter)) : deleted).filter((i) =>
    matchesInquirySearch(i, query),
  );
  const filterCounts = new Map(
    INQUIRY_FILTERS.map((f) => [f.value, active.filter((i) => matchesInquiryFilter(i, f.value) && matchesInquirySearch(i, query)).length]),
  );
  const narrowed = query !== "" || (view === "active" && filter !== "all");
  const newCount = active.filter((i) => i.status === "new").length;
  const convertedCount = active.filter((i) => i.status === "converted").length;

  return (
    <AdminFrame user={toPublicAdmin(user)}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {view === "active" ? "Inquiries" : "Deleted inquiries"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {!data
              ? "Inquiries sent from the calculator."
              : view === "active"
                ? `${active.length} ${active.length === 1 ? "inquiry" : "inquiries"}, ${newCount} new, ${convertedCount} converted. Newest first.`
                : `${deleted.length} deleted ${deleted.length === 1 ? "inquiry" : "inquiries"}, most recently deleted first. Restore one to move it back to Inquiries.`}
            {data && data.total > INQUIRY_LIST_LIMIT && ` Showing the newest ${INQUIRY_LIST_LIMIT} stored.`}
          </p>
        </div>
        {view === "active" && !permissions.remove ? null : view === "active" ? (
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

      {data && (
        <div className="mb-5 space-y-3">
          <form role="search" action={base} className="flex flex-wrap items-center gap-2">
            {view === "active" && filter !== "open" && <input type="hidden" name="status" value={filter} />}
            <label htmlFor="inquiry-search" className="sr-only">
              Search by name, email, phone or reference
            </label>
            <input
              id="inquiry-search"
              type="search"
              name="q"
              defaultValue={query}
              maxLength={INQUIRY_SEARCH_MAX}
              placeholder="Search by name, email, phone or reference"
              className="min-w-0 flex-1 basis-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
            />
            <button
              type="submit"
              className="rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
            >
              Search
            </button>
            {query && (
              <Link
                href={listHref(base, "", filter)}
                className="text-sm font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950"
              >
                Clear search
              </Link>
            )}
          </form>
          {view === "active" && (
            <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
              {INQUIRY_FILTERS.map((f) => {
                const selected = f.value === filter;
                return (
                  <Link
                    key={f.value}
                    href={listHref(base, query, f.value)}
                    aria-current={selected ? "page" : undefined}
                    className={`rounded-full border px-3 py-1 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                      selected
                        ? "border-blue-900 bg-blue-900 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {f.label} ({filterCounts.get(f.value) ?? 0})
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      )}

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
            {narrowed && (view === "active" ? active.length : deleted.length) > 0
              ? "No inquiries match. Try another search or filter."
              : view === "active"
              ? "No inquiries yet. They appear here when visitors select Send inquiry."
              : "No deleted inquiries."}
          </p>
        </AdminCard>
      ) : (
        <ul className="space-y-4">
          {shown.map((inquiry) => (
            <InquiryCard key={inquiry.id} inquiry={inquiry} permissions={permissions} />
          ))}
        </ul>
      )}
    </AdminFrame>
  );
}
