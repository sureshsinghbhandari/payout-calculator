import Link from "next/link";
import { SettingsMenu } from "./SettingsMenu";

/**
 * Page chrome shared by the admin pages. The settings menu (gear icon) is
 * shown only to signed-in admins, before "View calculator".
 */
export function AdminFrame({ signedIn, children }: { signedIn: boolean; children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href={signedIn ? "/admin/inquiries" : "/admin"}
            className="text-base font-semibold text-slate-900 hover:text-blue-900"
          >
            Investment Payout Calculator: Admin
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            {signedIn && <SettingsMenu />}
            <Link href="/" className="text-sm font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950">
              View calculator
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}

export function AdminLoading() {
  return (
    <AdminFrame signedIn={false}>
      <p className="text-sm text-slate-600">Loading…</p>
    </AdminFrame>
  );
}

export function AdminCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">{children}</div>;
}
