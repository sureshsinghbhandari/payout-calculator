import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { InvestorCard, InvestorFrame, InvestorLoading } from "@/components/investor/InvestorFrame";
import { TwoStepSettings } from "@/components/two-step/TwoStepSettings";
import { hasTwoStep, type Investor } from "@/lib/accounts";
import { getCurrentInvestor } from "@/lib/server/auth";
import { pendingSetupDetails } from "@/lib/server/two-step";
import {
  cancelInvestorTwoStepSetupAction,
  confirmInvestorTwoStepAction,
  disableInvestorTwoStepAction,
  startInvestorTwoStepSetupAction,
} from "../two-step-actions";

export const metadata: Metadata = {
  title: "Sign-in security | Investor portal | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Investor portal: turn two-step sign-in (authenticator app codes) on or off. */
export default function SecurityPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<InvestorLoading />}>
      <SecurityContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SecurityContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();

  let investor: Investor | null;
  try {
    investor = await getCurrentInvestor();
  } catch (error) {
    console.error("Loading the investor security page failed", error);
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
  // Signed out, or a new password is needed first: the portal page handles both.
  if (!investor || investor.mustChangePassword) redirect("/portal");

  const params = await searchParams;
  const recoveryLeft = typeof params["recovery-left"] === "string" ? Number(params["recovery-left"]) : NaN;
  const enabled = hasTwoStep(investor);

  return (
    <InvestorFrame signedIn>
      <div className="mx-auto max-w-2xl">
        <p className="mb-3 text-sm">
          <Link href="/portal" className="font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950">
            <span aria-hidden="true">← </span>Back to your investments
          </Link>
        </p>
        <InvestorCard>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Sign-in security</h1>
          <p className="mb-6 mt-1 text-sm text-slate-600">
            Two-step sign-in (optional): after your password, you enter a code from an authenticator app on your phone.
          </p>
          <TwoStepSettings
            username={investor.username}
            enabled={enabled}
            enabledAt={investor.totpEnabledAt}
            recoveryCodesLeft={investor.recoveryCodeHashes.length}
            setup={enabled ? null : pendingSetupDetails("investor", investor)}
            required={false}
            actions={{
              start: startInvestorTwoStepSetupAction,
              cancelSetup: cancelInvestorTwoStepSetupAction,
              confirm: confirmInvestorTwoStepAction,
              disable: disableInvestorTwoStepAction,
            }}
            justTurnedOff={params["two-step"] === "off"}
            signedInWithRecovery={Number.isInteger(recoveryLeft) && recoveryLeft >= 0 ? recoveryLeft : null}
          />
        </InvestorCard>
      </div>
    </InvestorFrame>
  );
}
