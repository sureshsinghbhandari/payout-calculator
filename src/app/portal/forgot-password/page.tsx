import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";
import { InvestorCard, InvestorFrame, InvestorLoading } from "@/components/investor/InvestorFrame";
import { isAccountStorageConfigured } from "@/lib/server/accounts-store";
import { authConfig } from "@/lib/server/auth";
import { isEmailEnabled } from "@/lib/server/email";

export const metadata: Metadata = {
  title: "Forgot password | Investor portal | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

/** Investor Forgot password: emails a link to set a new password. */
export default function InvestorForgotPasswordPage() {
  return (
    <Suspense fallback={<InvestorLoading />}>
      <ForgotContent />
    </Suspense>
  );
}

async function ForgotContent() {
  await connection();
  const available = authConfig().ok && isAccountStorageConfigured() && isEmailEnabled();

  return (
    <InvestorFrame signedIn={false}>
      <div className="mx-auto max-w-md">
        <InvestorCard>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Forgot your password?</h1>
          {available ? (
            <>
              <p className="mt-1 text-sm text-slate-600">
                Enter your username or the email address our team has for you. We will email you a link to choose a new
                password.
              </p>
              <ForgotPasswordForm kind="investor" />
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate-700">
                Password reset by email is not available yet, because email is not set up. Contact our team, who can send
                you a link to set a new password.
              </p>
              <p className="mt-6 text-sm">
                <Link href="/portal" className="font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950">
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </InvestorCard>
      </div>
    </InvestorFrame>
  );
}
