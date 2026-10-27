import Link from "next/link";
import { PayoutCalculator } from "@/components/PayoutCalculator";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4 sm:px-6">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-900 text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <rect x="4" y="3" width="16" height="18" rx="2" />
              <path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15v2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-base font-semibold text-slate-900">Investment Payout Calculator</span>
          <Link
            href="/portal"
            className="ml-auto rounded-lg border border-blue-900 px-3 py-1.5 text-sm font-semibold text-blue-900 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
          >
            Investor login
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Investment Payout Calculator
          </h1>
          <p className="mt-3 text-base leading-relaxed text-slate-600">
            See how a fixed-term investment pays out over time. Pick an amount, planned investment date,
            term and payout term to get a payout-by-payout breakdown of interest and
            principal, based on simple interest.
          </p>
        </div>

        <PayoutCalculator />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-6 text-xs leading-relaxed text-slate-500 sm:px-6">
          Illustrative calculator only. This is not an offer to invest. Your selections are sent
          to our server only to calculate the schedule and are not stored. If you send an inquiry,
          the details you enter are stored so our team can respond.
        </div>
      </footer>
    </div>
  );
}
