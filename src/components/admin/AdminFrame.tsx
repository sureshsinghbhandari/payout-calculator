import Link from "next/link";
import { logoutAction } from "@/app/admin/actions";

/** Page chrome shared by the admin pages. */
export function AdminFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <span className="text-base font-semibold text-slate-900">Investment Payout Calculator: Admin</span>
          <Link href="/" className="text-sm font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950">
            View calculator
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}

const TABS = [
  { key: "rates", label: "Interest rates", href: "/admin" },
  { key: "inquiries", label: "Inquiries", href: "/admin/inquiries" },
] as const;

/** Tabs between the admin sections, plus Sign out. Shown only to signed-in admins. */
export function AdminTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
      <nav aria-label="Admin sections" className="-mb-px flex gap-1">
        {TABS.map((tab) => {
          const current = tab.key === active;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={current ? "page" : undefined}
              className={`border-b-2 px-4 py-2.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
                current
                  ? "border-blue-900 text-blue-900"
                  : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <form action={logoutAction} className="pb-2">
        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}

export function AdminCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">{children}</div>;
}
