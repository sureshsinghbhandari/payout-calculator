import Link from "next/link";
import { investorLogoutAction } from "@/app/portal/actions";

/**
 * Page chrome for the investor portal, in the same style as the public
 * calculator. `signedIn` adds the Sign out button. Safe to render in a
 * Suspense fallback: it reads no request data.
 */
export function InvestorFrame({ signedIn, children }: { signedIn: boolean; children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <Link href="/portal" className="flex min-w-0 items-center gap-3 text-slate-900 hover:text-blue-900">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-900 text-white"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <rect x="4" y="3" width="16" height="18" rx="2" />
                <path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15v2" strokeLinecap="round" />
              </svg>
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-base font-semibold">Investment Payout Calculator</span>
              <span className="block text-xs font-medium text-slate-500">Investor portal</span>
            </span>
          </Link>
          {signedIn && (
            <form action={investorLogoutAction} className="shrink-0">
              <button
                type="submit"
                className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 sm:px-4"
              >
                Sign out
              </button>
            </form>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">{children}</main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-6 text-xs leading-relaxed text-slate-500 sm:px-6">
          Payout schedules are calculated from the investment details our team recorded for you, using simple
          interest. Questions about an investment or a payment? Contact our team.
        </div>
      </footer>
    </div>
  );
}

export function InvestorLoading() {
  return (
    <InvestorFrame signedIn={false}>
      <p role="status" className="text-sm text-slate-600">
        Loading…
      </p>
    </InvestorFrame>
  );
}

/** White rounded card used across the portal. */
export function InvestorCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 ${className}`}>{children}</div>
  );
}
