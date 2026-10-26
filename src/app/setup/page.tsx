import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { InvalidSetupLink, SetupPasswordForm } from "@/components/admin/users/SetupPasswordForm";
import { SETUP_LINK_HOURS } from "@/lib/accounts";
import { findAccountBySetupToken, getAdminUser, getInvestor, type SetupAccount } from "@/lib/server/accounts-store";
import { MIN_USER_PASSWORD_LENGTH } from "@/lib/server/passwords";

export const metadata: Metadata = {
  title: "Set your password | Investment Payout Calculator",
  robots: { index: false, follow: false },
  // The address holds a one-time token: never send it to other sites.
  referrer: "no-referrer",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Public page for setup links: /setup?token=… lets an admin user or investor set their password. */
export default function SetupPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-5 block text-center text-base font-semibold text-slate-900 hover:text-blue-900"
        >
          Investment Payout Calculator
        </Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <Suspense fallback={<p className="text-sm text-slate-600">Checking your link…</p>}>
            <SetupContent searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

/** The account a setup token belongs to (if valid and unexpired now), and whether it may sign in. */
async function checkSetupLink(token: string): Promise<{ account: SetupAccount | null; active: boolean }> {
  const account = await findAccountBySetupToken(token, Date.now());
  if (!account) return { account: null, active: false };
  const record = account.kind === "admin" ? await getAdminUser(account.id) : await getInvestor(account.id);
  return { account, active: Boolean(record?.active) };
}

async function SetupContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";
  if (!token) {
    return (
      <InvalidSetupLink
        message={`Open the setup link you were sent, or ask an administrator for a new one. Links expire after ${SETUP_LINK_HOURS} hours.`}
      />
    );
  }

  let link: Awaited<ReturnType<typeof checkSetupLink>>;
  try {
    link = await checkSetupLink(token);
  } catch (error) {
    console.error("Checking a setup link failed", error);
    return (
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Something went wrong</h1>
        <p role="alert" className="mt-2 text-sm text-slate-600">
          We could not check your link right now. Reload the page to try again.
        </p>
      </div>
    );
  }

  const { account, active } = link;
  if (!account) {
    return (
      <InvalidSetupLink
        message={`This setup link has expired, has already been used or was replaced by a newer one. Links work once and expire after ${SETUP_LINK_HOURS} hours. Ask an administrator to send you a new link.`}
      />
    );
  }
  if (!active) {
    return <InvalidSetupLink message="This account is disabled. Ask an administrator for help." />;
  }

  return (
    <SetupPasswordForm
      token={token}
      name={account.name}
      username={account.username}
      minPasswordLength={MIN_USER_PASSWORD_LENGTH}
    />
  );
}
