import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { InvestmentOverview } from "@/components/investor/InvestmentOverview";
import { InvestorCard, InvestorFrame, InvestorLoading } from "@/components/investor/InvestorFrame";
import { InvestorLoginForm } from "@/components/investor/InvestorLoginForm";
import { InvestorPasswordForm } from "@/components/investor/InvestorPasswordForm";
import type { Investor } from "@/lib/accounts";
import { formatIsoDateLong } from "@/lib/format";
import { todayUtc } from "@/lib/investments";
import { getCurrentInvestor } from "@/lib/server/auth";
import { MIN_USER_PASSWORD_LENGTH } from "@/lib/server/passwords";

export const metadata: Metadata = {
  title: "Investor portal | Investment Payout Calculator",
  robots: { index: false, follow: false },
  // Name and status bar when the portal is added to an iPhone's home screen.
  appleWebApp: { capable: true, title: "Investor Portal", statusBarStyle: "default" },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Investor portal: sign-in, required password change, and the dashboard with
 * each investment's payout schedule. Interest rates are never shown here.
 */
export default function InvestorPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<InvestorLoading />}>
      <InvestorContent searchParams={searchParams} />
    </Suspense>
  );
}

async function InvestorContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();

  let investor: Investor | null;
  try {
    // Null when signed out, or when the session is no longer valid (e.g. the password changed elsewhere).
    investor = await getCurrentInvestor();
  } catch (error) {
    console.error("Loading the investor portal failed", error);
    return (
      <InvestorFrame signedIn={false}>
        <InvestorCard className="mx-auto max-w-md">
          <h1 className="text-xl font-semibold text-slate-900">Something went wrong</h1>
          <p role="alert" className="mt-2 text-sm text-slate-600">
            Your account could not be loaded right now. Reload the page to try again.
          </p>
        </InvestorCard>
      </InvestorFrame>
    );
  }

  if (!investor) return <SignInView />;

  const params = await searchParams;
  if (investor.mustChangePassword) return <PasswordView username={investor.username} required />;
  if (params.view === "password") return <PasswordView username={investor.username} required={false} />;

  return <Dashboard investor={investor} today={todayUtc()} passwordChanged={params.changed === "1"} />;
}

function SignInView() {
  return (
    <InvestorFrame signedIn={false}>
      <div className="mx-auto max-w-md">
        <InvestorCard>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Investor sign in</h1>
          <p className="mt-1 text-sm text-slate-600">See your investments and payout schedule.</p>
          <InvestorLoginForm />
          <p className="mt-6 border-t border-slate-200 pt-5 text-sm text-slate-600">
            Your login details come from our team. Contact us if you need help.
          </p>
        </InvestorCard>
        <p className="mt-6 text-center text-sm">
          <Link href="/inquiries" className="font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950">
            Back to the calculator
          </Link>
        </p>
      </div>
    </InvestorFrame>
  );
}

function PasswordView({ username, required }: { username: string; required: boolean }) {
  return (
    <InvestorFrame signedIn>
      <div className="mx-auto max-w-xl">
        {!required && (
          <p className="mb-3 text-sm">
            <Link href="/portal" className="font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950">
              <span aria-hidden="true">← </span>Back to your investments
            </Link>
          </p>
        )}
        <InvestorCard>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
            {required ? "Choose a new password" : "Change password"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {required
              ? "You signed in with a temporary password from our team. Choose a new password to see your investments."
              : "Enter your current password, then choose a new one. Other devices where you are signed in will be signed out."}
          </p>
          <InvestorPasswordForm
            username={username}
            minLength={MIN_USER_PASSWORD_LENGTH}
            submitLabel={required ? "Save new password" : "Change password"}
          />
        </InvestorCard>
      </div>
    </InvestorFrame>
  );
}

function Dashboard({ investor, today, passwordChanged }: { investor: Investor; today: string; passwordChanged: boolean }) {
  const count = investor.investments.length;

  return (
    <InvestorFrame signedIn>
      {passwordChanged && (
        <p
          role="status"
          className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
        >
          Your password has been changed.
        </p>
      )}

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Hello, {investor.name}
          </h1>
          <p className="mt-2 text-base text-slate-600">
            {count === 0
              ? "Welcome to your investor portal."
              : `Your ${count === 1 ? "investment and its" : `${count} investments and their`} payout schedule${
                  count === 1 ? "" : "s"
                }, as of ${formatIsoDateLong(today)}.`}
          </p>
        </div>
        <Link
          href="/portal?view=password"
          className="inline-flex shrink-0 items-center justify-center self-start rounded-lg border border-blue-900 bg-white px-4 py-2.5 text-sm font-semibold text-blue-900 shadow-sm hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 sm:self-auto"
        >
          Change password
        </Link>
      </div>

      {count === 0 ? (
        <InvestorCard className="text-center">
          <h2 className="text-lg font-semibold text-slate-900">No investments to show yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            Once our team records your investment, its payout schedule will appear here. Contact us if you expected
            to see one.
          </p>
        </InvestorCard>
      ) : (
        <div className="space-y-12">
          {investor.investments.map((investment) => (
            <InvestmentOverview key={investment.id} investment={investment} today={today} />
          ))}
        </div>
      )}
    </InvestorFrame>
  );
}
