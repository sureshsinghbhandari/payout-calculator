import Link from "next/link";
import { after, connection } from "next/server";
import { can, toPublicAdmin } from "@/lib/accounts";
import {
  DEFAULT_LEAD_SOURCE,
  INQUIRY_FILTERS,
  INQUIRY_SEARCH_MAX,
  inquiryListSearch,
  isFollowUpDue,
  isInquiryListNarrowed,
  matchesInquiryFilter,
  matchesInquiryListQuery,
  matchesInquirySearch,
  parseInquiryListQuery,
  todayUtc,
  type InquiryListQuery,
} from "@/lib/inquiry";
import { markAllReadAction } from "@/app/admin/notification-actions";
import { requireAdminPage } from "@/lib/server/auth";
import { checkGmailRepliesQuietly, emailStatus } from "@/lib/server/email";
import { INQUIRY_LIST_LIMIT, isInquiryStorageConfigured, listInquiries } from "@/lib/server/inquiry-store";
import { unreadInquiryIds } from "@/lib/server/notifications-store";
import { AdminCard, AdminFrame } from "./AdminFrame";
import { InquiryCard } from "./InquiryCard";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Link to the list with this search and these filters; the defaults are left out of the URL. */
function listHref(base: string, query: InquiryListQuery): string {
  return `${base}${inquiryListSearch(query)}`;
}

const chipClass = (selected: boolean) =>
  `rounded-full border px-3 py-1 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
    selected ? "border-blue-900 bg-blue-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
  }`;

const fieldClass =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/30";

const headerLink = "text-sm font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950";

/**
 * Inquiries list for admins: active ones, or the soft-deleted ones. Search by
 * name, email, phone or reference. Active ones are also filtered by status
 * (converted ones are hidden unless asked for), assignee, follow-ups due, lead
 * source and the date received, and can be exported to Excel as filtered.
 */
export async function InquiriesView({ view, searchParams }: { view: "active" | "deleted"; searchParams: SearchParams }) {
  await connection();
  const listQuery = parseInquiryListQuery(await searchParams);
  const query = listQuery.q;
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
  const canExport = can(user.role, "inquiries.export");
  const today = todayUtc();
  // The inquiries this admin has not opened yet (each admin has their own list).
  const unreadIds: ReadonlySet<string> = await unreadInquiryIds(user.id).then(
    (ids) => new Set(ids),
    (error) => (console.error("Reading the unread inquiries failed", error), new Set<string>()),
  );
  const context = { userId: user.id, today, unreadIds };

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
  const shown =
    view === "active"
      ? active.filter((i) => matchesInquiryListQuery(i, listQuery, context))
      : deleted.filter((i) => matchesInquirySearch(i, query));
  const filterCounts = new Map(
    INQUIRY_FILTERS.map((f) => [
      f.value,
      active.filter((i) => matchesInquiryListQuery(i, { ...listQuery, status: f.value }, context)).length,
    ]),
  );
  const narrowed = view === "active" ? isInquiryListNarrowed(listQuery) || listQuery.status !== "all" : query !== "";
  const newCount = active.filter((i) => i.status === "new").length;
  const convertedCount = active.filter((i) => i.status === "converted").length;
  const dueCount = active.filter((i) => isFollowUpDue(i, today)).length;
  const unreadCount = active.filter((i) => unreadIds.has(i.id)).length;
  const mineCount = active.filter((i) => i.assignedTo?.id === user.id && matchesInquiryFilter(i, "open")).length;
  // Every source seen so far, the website first; a source in the URL stays selectable.
  const sources = [
    ...new Set([DEFAULT_LEAD_SOURCE, ...active.map((i) => i.source).sort(), ...(listQuery.source ? [listQuery.source] : [])]),
  ];
  const exportHref = `/admin/inquiries/export${inquiryListSearch(listQuery)}`;
  const boardHref = `/admin/inquiries/board${inquiryListSearch({ ...listQuery, status: "open" })}`;

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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {view === "active" && (
            <Link href={boardHref} className={headerLink}>
              Pipeline board
            </Link>
          )}
          {view === "active" && permissions.remove && (
            <Link href="/admin/inquiries/deleted" className={headerLink}>
              Deleted inquiries{data ? ` (${deleted.length})` : ""}
            </Link>
          )}
          {view === "deleted" && (
            <Link href="/admin/inquiries" className={headerLink}>
              Back to inquiries
            </Link>
          )}
        </div>
      </div>

      {data && (
        <div className="mb-5 space-y-3">
          <form role="search" action={base} className="space-y-3">
            {view === "active" && listQuery.status !== "open" && <input type="hidden" name="status" value={listQuery.status} />}
            {view === "active" && listQuery.mine && <input type="hidden" name="mine" value="1" />}
            {view === "active" && listQuery.due && <input type="hidden" name="due" value="1" />}
            {view === "active" && listQuery.unread && <input type="hidden" name="unread" value="1" />}
            <div className="flex flex-wrap items-center gap-2">
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
              {view === "deleted" && query && (
                <Link href={base} className={headerLink}>
                  Clear search
                </Link>
              )}
            </div>
            {view === "active" && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,10rem)_minmax(0,10rem)_auto] sm:items-end">
                <div className="col-span-2 sm:col-span-1">
                  <label htmlFor="inquiry-source" className="text-xs font-semibold text-slate-700">
                    Source
                  </label>
                  <select id="inquiry-source" name="source" defaultValue={listQuery.source} className={fieldClass}>
                    <option value="">All sources</option>
                    {sources.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="inquiry-from" className="text-xs font-semibold text-slate-700">
                    Received from
                  </label>
                  <input id="inquiry-from" type="date" name="from" defaultValue={listQuery.from} className={fieldClass} />
                </div>
                <div>
                  <label htmlFor="inquiry-to" className="text-xs font-semibold text-slate-700">
                    Received to
                  </label>
                  <input id="inquiry-to" type="date" name="to" defaultValue={listQuery.to} className={fieldClass} />
                </div>
                <div className="col-span-2 flex flex-wrap items-center gap-3 sm:col-span-1">
                  <button
                    type="submit"
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                  >
                    Apply filters
                  </button>
                  {(isInquiryListNarrowed(listQuery) || listQuery.status !== "open") && (
                    <Link href={base} className={headerLink}>
                      Clear all
                    </Link>
                  )}
                </div>
              </div>
            )}
          </form>
          {view === "active" && (
            <>
              <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
                {INQUIRY_FILTERS.map((f) => {
                  const selected = f.value === listQuery.status;
                  return (
                    <Link
                      key={f.value}
                      href={listHref(base, { ...listQuery, status: f.value })}
                      aria-current={selected ? "page" : undefined}
                      className={chipClass(selected)}
                    >
                      {f.label} ({filterCounts.get(f.value) ?? 0})
                    </Link>
                  );
                })}
              </nav>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <nav aria-label="Show only" className="flex flex-wrap gap-2">
                  <Link
                    href={listHref(base, { ...listQuery, unread: !listQuery.unread })}
                    aria-current={listQuery.unread ? "true" : undefined}
                    className={chipClass(listQuery.unread)}
                  >
                    {listQuery.unread && <span aria-hidden="true">✓ </span>}
                    Unread ({unreadCount})
                  </Link>
                  <Link
                    href={listHref(base, { ...listQuery, mine: !listQuery.mine })}
                    aria-current={listQuery.mine ? "true" : undefined}
                    className={chipClass(listQuery.mine)}
                  >
                    {listQuery.mine && <span aria-hidden="true">✓ </span>}
                    Assigned to me ({mineCount} open)
                  </Link>
                  <Link
                    href={listHref(base, { ...listQuery, due: !listQuery.due })}
                    aria-current={listQuery.due ? "true" : undefined}
                    className={chipClass(listQuery.due)}
                  >
                    {listQuery.due && <span aria-hidden="true">✓ </span>}
                    Follow-ups due ({dueCount})
                  </Link>
                </nav>
                {unreadCount > 0 && (
                  <form action={markAllReadAction}>
                    <button
                      type="submit"
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                    >
                      Mark all as read ({unreadCount})
                    </button>
                  </form>
                )}
                {canExport && shown.length > 0 && (
                  // A plain link: the file comes from a route handler, not a page.
                  <a
                    href={exportHref}
                    download
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                  >
                    Export to Excel ({shown.length})
                  </a>
                )}
              </div>
            </>
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
            {narrowed && (view === "active" ? active.length : deleted.length) > 0 ? (
              <>
                No inquiries match. Try another search or filter, or{" "}
                <Link href={base} className={headerLink}>
                  clear all filters
                </Link>
                .
              </>
            ) : view === "active" ? (
              "No inquiries yet. They appear here when visitors select Send inquiry."
            ) : (
              "No deleted inquiries."
            )}
          </p>
        </AdminCard>
      ) : (
        <ul className="space-y-4">
          {shown.map((inquiry) => (
            <InquiryCard
              key={inquiry.id}
              inquiry={inquiry}
              permissions={permissions}
              today={today}
              unread={view === "active" && unreadIds.has(inquiry.id)}
            />
          ))}
        </ul>
      )}
    </AdminFrame>
  );
}
