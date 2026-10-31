import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PayoutCalculator } from "@/components/PayoutCalculator";
import { defaultProductSettings, type ProductSettings } from "@/lib/products";
import { getCurrentProducts } from "@/lib/server/products-store";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4 sm:px-6">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-900 text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <rect x="4" y="3" width="16" height="18" rx="2" />
              <path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15v2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="min-w-0 truncate text-base font-semibold text-slate-900">Investment Payout Calculator</span>
          <Link
            href="/portal"
            className="ml-auto shrink-0 whitespace-nowrap rounded-lg border border-blue-900 px-3 py-1.5 text-sm font-semibold text-blue-900 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
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
            term and payout term to get a payout-by-payout breakdown of earnings and
            principal, based on simple earnings.
          </p>
        </div>

        <Suspense fallback={<CalculatorLoading />}>
          <Calculator />
        </Suspense>
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

/**
 * The calculator with the amounts and terms on offer. They are cached and
 * built into the page, which is refreshed as soon as an admin saves new ones.
 */
async function Calculator() {
  let products: ProductSettings;
  try {
    products = await getCurrentProducts();
  } catch (error) {
    // Never build the page from the defaults while storage cannot be read:
    // this part is then rendered for each visit, which tries storage again.
    await connection();
    console.error("Reading amounts and terms for the calculator failed", error);
    products = defaultProductSettings();
  }
  return <PayoutCalculator products={products} />;
}

function CalculatorLoading() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <p role="status" className="text-sm text-slate-600">
        Loading the calculator…
      </p>
    </div>
  );
}
