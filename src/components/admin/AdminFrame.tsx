import Link from "next/link";
import { Suspense } from "react";
import { ROLE_LABELS, type PublicAdmin } from "@/lib/accounts";
import { NotificationBell } from "./NotificationBell";
import { SettingsMenu } from "./SettingsMenu";

/**
 * Page chrome shared by the admin pages. Pass the signed-in admin (via
 * `toPublicAdmin`) to show their name, role and the settings (gear) menu,
 * which sits before "View calculator". Pass null on sign-in pages.
 */
export function AdminFrame({ user, children }: { user: PublicAdmin | null; children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href={user ? "/admin/inquiries" : "/admin"}
            className="min-w-0 truncate text-base font-semibold text-slate-900 hover:text-blue-900"
          >
            <span className="sm:hidden">Admin</span>
            <span className="hidden sm:inline">Investment Payout Calculator: Admin</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            {user && (
              <span className="hidden text-right text-xs leading-tight text-slate-600 sm:block">
                <span className="block font-semibold text-slate-900">{user.name}</span>
                {ROLE_LABELS[user.role]}
              </span>
            )}
            {user && (
              <Suspense fallback={null}>
                <NotificationBell adminId={user.id} />
              </Suspense>
            )}
            {user && <SettingsMenu user={user} />}
            <Link
              href="/inquiries"
              className="whitespace-nowrap text-sm font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950"
            >
              <span className="sm:hidden">Calculator</span>
              <span className="hidden sm:inline">View calculator</span>
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}

export function AdminLoading() {
  return (
    <AdminFrame user={null}>
      <p className="text-sm text-slate-600">Loading…</p>
    </AdminFrame>
  );
}

export function AdminCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">{children}</div>;
}

/** Small "Admin / Settings" style breadcrumb. */
export function AdminBreadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2 text-sm text-slate-500">
      {items.map((item, i) => (
        <span key={item.label}>
          {i > 0 && <span aria-hidden="true"> / </span>}
          {item.href ? (
            <Link href={item.href} className="hover:text-slate-800 hover:underline">
              {item.label}
            </Link>
          ) : (
            <span>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
