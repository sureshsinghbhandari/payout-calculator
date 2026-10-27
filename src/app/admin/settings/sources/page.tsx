import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminBreadcrumb, AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { textLink } from "@/components/admin/investors/ui";
import { LinkBuilder } from "@/components/admin/sources/LinkBuilder";
import { TrackingLink } from "@/components/admin/sources/TrackingLink";
import { toPublicAdmin } from "@/lib/accounts";
import { DEFAULT_LEAD_SOURCE, type StoredInquiry } from "@/lib/inquiry";
import { requireAdminPage } from "@/lib/server/auth";
import { INQUIRY_LIST_LIMIT, isInquiryStorageConfigured, listInquiries } from "@/lib/server/inquiry-store";

export const metadata: Metadata = {
  title: "Lead sources | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

export default function LeadSourcesPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <LeadSourcesContent />
    </Suspense>
  );
}

interface SourceStats {
  source: string;
  inquiries: number;
  converted: number;
}

/** Inquiries and conversions per source, most inquiries first. Deleted inquiries are not counted. */
function sourceStats(inquiries: StoredInquiry[]): SourceStats[] {
  const stats = new Map<string, SourceStats>([[DEFAULT_LEAD_SOURCE, { source: DEFAULT_LEAD_SOURCE, inquiries: 0, converted: 0 }]]);
  for (const inquiry of inquiries) {
    if (inquiry.status === "deleted") continue;
    const entry = stats.get(inquiry.source) ?? { source: inquiry.source, inquiries: 0, converted: 0 };
    entry.inquiries++;
    if (inquiry.status === "converted") entry.converted++;
    stats.set(inquiry.source, entry);
  }
  return [...stats.values()].sort((a, b) => b.inquiries - a.inquiries || a.source.localeCompare(b.source));
}

/**
 * Lead sources (Master Admin): where inquiries come from, with a tracking link
 * and QR code for each, e.g. for a seminar slide or a flyer.
 */
async function LeadSourcesContent() {
  await connection();
  const user = await requireAdminPage("sources.manage");

  let data: Awaited<ReturnType<typeof listInquiries>> | null = null;
  try {
    data = await listInquiries();
  } catch (error) {
    console.error("Listing inquiries failed", error);
  }
  const stats = data ? sourceStats(data.inquiries) : [];

  return (
    <AdminFrame user={toPublicAdmin(user)}>
      <AdminBreadcrumb items={[{ label: "Admin", href: "/admin/inquiries" }, { label: "Settings" }, { label: "Lead sources" }]} />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Lead sources</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Where inquiries come from. Share a calculator link with <span className="font-mono">?source=</span> and a name,
          for example on a seminar slide, a flyer or an email, and every inquiry sent through it is tagged with that
          source. Links with <span className="font-mono">?utm_source=</span> from ad and email tools work too. Inquiries
          without a source come from the website.
        </p>
      </div>

      <section aria-labelledby="new-source-heading">
        <AdminCard>
          <h2 id="new-source-heading" className="mb-4 text-lg font-semibold text-slate-900">
            Create a tracking link
          </h2>
          <LinkBuilder />
          <p className="mt-4 text-xs text-slate-500">
            Nothing needs to be saved: a new source shows in the list below once the first inquiry arrives through its
            link.
          </p>
        </AdminCard>
      </section>

      <section aria-labelledby="sources-heading" className="mt-8">
        <h2 id="sources-heading" className="mb-1 text-lg font-semibold text-slate-900">
          Sources
        </h2>
        <p className="mb-3 text-sm text-slate-600">
          Inquiries and conversions to investors per source, most inquiries first. Deleted inquiries are not counted.
          {data && data.total > INQUIRY_LIST_LIMIT && ` Based on the newest ${INQUIRY_LIST_LIMIT} inquiries.`}
        </p>
        {!isInquiryStorageConfigured() ? (
          <AdminCard>
            <p className="text-sm text-slate-700">Storage is not connected, so inquiries cannot be counted.</p>
          </AdminCard>
        ) : !data ? (
          <AdminCard>
            <p role="alert" className="text-sm font-medium text-red-700">
              Inquiries could not be loaded. Reload the page to try again.
            </p>
          </AdminCard>
        ) : (
          <ul className="space-y-3">
            {stats.map((s) => {
              const rate = s.inquiries > 0 ? Math.round((s.converted / s.inquiries) * 100) : 0;
              return (
                <li key={s.source} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="break-all font-mono text-base font-semibold text-slate-900">{s.source}</h3>
                    <Link href={`/admin/inquiries?status=all&source=${encodeURIComponent(s.source)}`} className={`text-sm ${textLink}`}>
                      View inquiries
                    </Link>
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-3 text-sm sm:max-w-md">
                    <div>
                      <dt className="text-xs text-slate-500">Inquiries</dt>
                      <dd className="font-semibold tabular-nums text-slate-900">{s.inquiries}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Converted</dt>
                      <dd className="font-semibold tabular-nums text-slate-900">{s.converted}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Conversion</dt>
                      <dd className="font-semibold tabular-nums text-slate-900">{s.inquiries > 0 ? `${rate}%` : "–"}</dd>
                    </div>
                  </dl>
                  <details className="mt-3 border-t border-slate-100 pt-3">
                    <summary className="cursor-pointer text-sm font-semibold text-blue-800 hover:text-blue-950">
                      Link and QR code
                    </summary>
                    <div className="mt-3">
                      <TrackingLink source={s.source} />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AdminFrame>
  );
}
