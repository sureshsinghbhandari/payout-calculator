import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminBreadcrumb, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { toPublicAdmin } from "@/lib/accounts";
import { ROADMAP, ROADMAP_STATUS_LABELS, type RoadmapStatus } from "@/lib/roadmap";
import { requireAdminPage } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Upcoming features | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

const STATUS_STYLES: Record<RoadmapStatus, string> = {
  planned: "bg-slate-200 text-slate-700",
  "in-progress": "bg-amber-100 text-amber-900",
  done: "bg-emerald-100 text-emerald-800",
};

export default function UpcomingPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <UpcomingContent />
    </Suspense>
  );
}

async function UpcomingContent() {
  await connection();
  const user = await requireAdminPage("roadmap.view");
  const titleOf = (id: string) => ROADMAP.find((r) => r.id === id)?.title ?? id;

  return (
    <AdminFrame user={toPublicAdmin(user)}>
      <AdminBreadcrumb
        items={[{ label: "Admin", href: "/admin/inquiries" }, { label: "Settings" }, { label: "Upcoming features" }]}
      />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Upcoming features</h1>
        <p className="mt-1 text-sm text-slate-600">What is planned next, in order. Only Master Admins see this page.</p>
      </div>

      <ol className="space-y-4">
        {ROADMAP.map((item, index) => (
          <li key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-900 text-sm font-semibold text-white"
              >
                {index + 1}
              </span>
              <h2 className="text-base font-semibold text-slate-900">{item.title}</h2>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATUS_STYLES[item.status]}`}>
                {ROADMAP_STATUS_LABELS[item.status]}
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">{item.description}</p>
            <p className="mt-2 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">Once live: </span>
              {item.outcome}
            </p>
            {item.dependsOn && item.dependsOn.length > 0 && (
              <p className="mt-2 text-sm text-slate-600">
                <span className="font-semibold text-slate-900">Depends on: </span>
                {item.dependsOn.map(titleOf).join(", ")}
              </p>
            )}
            <div className="mt-3">
              <p className="text-sm font-semibold text-slate-900">What it needs</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {item.needs.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </AdminFrame>
  );
}
