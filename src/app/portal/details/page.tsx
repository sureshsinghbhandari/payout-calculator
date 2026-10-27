import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BankDetailsSummary } from "@/components/BankDetailsSummary";
import { ChangeRequestHistory } from "@/components/ChangeRequestHistory";
import { BankChangeForm, ContactChangeForm, WithdrawRequestButton } from "@/components/investor/DetailsForms";
import { InvestorCard, InvestorFrame, InvestorLoading } from "@/components/investor/InvestorFrame";
import type { Investor } from "@/lib/accounts";
import { maskedAccountNumber, type ChangeRequestView } from "@/lib/profile-requests";
import { getCurrentInvestor } from "@/lib/server/auth";
import { bankDetailsView, changeRequestViews } from "@/lib/server/change-requests";

export const metadata: Metadata = {
  title: "Your details | Investor portal | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Investor portal: the investor's contact and bank details (account number
 * masked), and requests to change them, which our team reviews first.
 */
export default function DetailsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<InvestorLoading />}>
      <DetailsContent searchParams={searchParams} />
    </Suspense>
  );
}

const linkClass = "font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950";
const notice = "mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800";

async function DetailsContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();

  let investor: Investor | null;
  try {
    investor = await getCurrentInvestor();
  } catch (error) {
    console.error("Loading the investor details page failed", error);
    return (
      <InvestorFrame signedIn={false}>
        <InvestorCard className="mx-auto max-w-md">
          <h1 className="text-xl font-semibold text-slate-900">Something went wrong</h1>
          <p role="alert" className="mt-2 text-sm text-slate-600">
            Your details could not be loaded right now. Reload the page to try again.
          </p>
        </InvestorCard>
      </InvestorFrame>
    );
  }
  // Signed out, or a new password is needed first: the portal page handles both.
  if (!investor || investor.mustChangePassword) redirect("/portal");

  const params = await searchParams;
  const bank = bankDetailsView(investor);
  const requests = changeRequestViews(investor);
  const pendingContact = requests.find((r) => r.kind === "contact" && r.status === "pending");
  const pendingBank = requests.find((r) => r.kind === "bank" && r.status === "pending");
  const past = requests.filter((r) => r.status !== "pending");

  return (
    <InvestorFrame signedIn>
      <div className="mx-auto max-w-3xl">
        <p className="mb-3 text-sm">
          <Link href="/portal" className={linkClass}>
            <span aria-hidden="true">← </span>Back to your investments
          </Link>
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Your details</h1>
        <p className="mb-6 mt-2 text-base text-slate-600">
          Ask us to change your contact or bank details. Our team checks every change before it is used.
        </p>

        {params.sent === "contact" && (
          <p role="status" className={notice}>
            Thank you. We will review the change to your contact details soon.
          </p>
        )}
        {params.sent === "bank" && (
          <p role="status" className={notice}>
            Thank you. We will review your new bank details before any payout is made to them.
          </p>
        )}
        {params.withdrawn === "1" && (
          <p role="status" className={notice}>
            Your request has been withdrawn.
          </p>
        )}

        <div className="space-y-6">
          <section aria-labelledby="contact-heading">
            <InvestorCard>
              <h2 id="contact-heading" className="text-lg font-semibold text-slate-900">
                Contact details
              </h2>
              <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Detail label="Email" value={investor.email || "None"} />
                <Detail label="Phone" value={investor.phone || "None"} />
              </dl>
              {pendingContact ? (
                <PendingNotice request={pendingContact} withdrawLabel="Withdraw request to change your contact details">
                  New email {pendingContact.contact?.email}, phone {pendingContact.contact?.phone || "(none)"}
                </PendingNotice>
              ) : (
                <details className="mt-5 border-t border-slate-200 pt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-blue-900">
                    Change your email or phone
                  </summary>
                  <ContactChangeForm current={{ email: investor.email, phone: investor.phone }} />
                </details>
              )}
            </InvestorCard>
          </section>

          <section aria-labelledby="bank-heading">
            <InvestorCard>
              <h2 id="bank-heading" className="text-lg font-semibold text-slate-900">
                Bank details for payouts
              </h2>
              <p className="mb-4 mt-1 text-sm text-slate-600">
                For your security we only show the last 4 digits of your account number.
              </p>
              {bank.state === "ok" ? (
                <BankDetailsSummary details={bank.details} />
              ) : bank.state === "unreadable" ? (
                <p className="text-sm text-slate-700">
                  We have bank details on file for account {maskedAccountNumber(bank.accountLast4)}, but they need to be
                  sent again. Please send them below.
                </p>
              ) : (
                <p className="text-sm text-slate-700">No bank details on file yet.</p>
              )}
              {pendingBank ? (
                <PendingNotice request={pendingBank} withdrawLabel="Withdraw request to change your bank details">
                  {pendingBank.bank ? `${pendingBank.bank.bankName}, ` : ""}account{" "}
                  {maskedAccountNumber(pendingBank.bankLast4 ?? "????")}
                </PendingNotice>
              ) : (
                <details className="mt-5 border-t border-slate-200 pt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-blue-900">
                    {bank.state === "none" ? "Add your bank details" : "Change your bank details"}
                  </summary>
                  <BankChangeForm accountHolder={bank.state === "ok" ? bank.details.accountHolder : investor.name} />
                </details>
              )}
            </InvestorCard>
          </section>

          {past.length > 0 && (
            <section aria-labelledby="requests-heading">
              <InvestorCard>
                <h2 id="requests-heading" className="text-lg font-semibold text-slate-900">
                  Earlier requests
                </h2>
                <ChangeRequestHistory requests={past} audience="investor" />
              </InvestorCard>
            </section>
          )}
        </div>
      </div>
    </InvestorFrame>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-slate-900">{value}</dd>
    </div>
  );
}

function PendingNotice({
  request,
  withdrawLabel,
  children,
}: {
  request: ChangeRequestView;
  withdrawLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-amber-900">
        <p className="font-semibold">Change waiting for review</p>
        <p className="mt-0.5 break-words">{children}</p>
      </div>
      <WithdrawRequestButton requestId={request.id} label={withdrawLabel} />
    </div>
  );
}
