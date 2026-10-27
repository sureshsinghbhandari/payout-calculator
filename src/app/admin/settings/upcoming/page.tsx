import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminBreadcrumb, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { toPublicAdmin } from "@/lib/accounts";
import {
  ROADMAP,
  ROADMAP_CATEGORY_LABELS,
  ROADMAP_CATEGORY_ORDER,
  ROADMAP_PRIORITY_LABELS,
  ROADMAP_STATUS_LABELS,
  type RoadmapItem,
  type RoadmapPriority,
} from "@/lib/roadmap";
import { requireAdminPage } from "@/lib/server/auth";

export const metadata: Metadata = {
  title: "Upcoming features | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

const PRIORITY_STYLES: Record<RoadmapPriority, string> = {
  now: "bg-blue-900 text-white",
  next: "bg-sky-100 text-sky-900",
  later: "bg-slate-200 text-slate-700",
};

export default function UpcomingPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <UpcomingContent />
    </Suspense>
  );
}

function Item({ item }: { item: RoadmapItem }) {
  const titleOf = (id: string) => ROADMAP.find((r) => r.id === id)?.title ?? id;
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_STYLES[item.priority]}`}>
          {ROADMAP_PRIORITY_LABELS[item.priority]}
        </span>
        {item.status !== "planned" && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
            {ROADMAP_STATUS_LABELS[item.status]}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{item.description}</p>
      {item.outcome && (
        <p className="mt-1.5 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">Once live: </span>
          {item.outcome}
        </p>
      )}
      {item.dependsOn && item.dependsOn.length > 0 && (
        <p className="mt-1.5 text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Depends on: </span>
          {item.dependsOn.map(titleOf).join(", ")}
        </p>
      )}
      {item.needs && item.needs.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-xs font-semibold text-blue-900">What it needs</summary>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">
            {item.needs.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

async function UpcomingContent() {
  await connection();
  const user = await requireAdminPage("roadmap.view");
  const counts = (["now", "next", "later"] as RoadmapPriority[]).map((p) => ({
    priority: p,
    count: ROADMAP.filter((i) => i.priority === p && i.status !== "done").length,
  }));

  return (
    <AdminFrame user={toPublicAdmin(user)}>
      <AdminBreadcrumb
        items={[{ label: "Admin", href: "/admin/inquiries" }, { label: "Settings" }, { label: "Upcoming features" }]}
      />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Upcoming features</h1>
        <p className="mt-1 text-sm text-slate-600">
          Ideas and plans for what comes next, grouped by area. Only Master Admins see this page.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {counts.map(({ priority, count }) => (
            <span key={priority} className={`rounded-full px-2.5 py-1 font-semibold ${PRIORITY_STYLES[priority]}`}>
              {ROADMAP_PRIORITY_LABELS[priority]}: {count}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-8">
        {ROADMAP_CATEGORY_ORDER.map((category) => {
          const items = ROADMAP.filter((i) => i.category === category);
          if (items.length === 0) return null;
          const order: Record<RoadmapPriority, number> = { now: 0, next: 1, later: 2 };
          items.sort((a, b) => order[a.priority] - order[b.priority]);
          return (
            <section key={category} aria-labelledby={`roadmap-${category}`}>
              <h2 id={`roadmap-${category}`} className="mb-3 text-lg font-semibold text-slate-900">
                {ROADMAP_CATEGORY_LABELS[category]}
              </h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {items.map((item) => (
                  <Item key={item.id} item={item} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </AdminFrame>
  );
}
