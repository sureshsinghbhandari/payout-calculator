import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminBreadcrumb, AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { TemplateEditor } from "@/components/admin/email/TemplateEditor";
import { SETUP_LINK_HOURS, toPublicAdmin } from "@/lib/accounts";
import { sampleTemplateValues, TEMPLATE_KEYS, templateFor, type StoredTemplates } from "@/lib/email-templates";
import { requireAdminPage } from "@/lib/server/auth";
import { emailTeamName, isEmailEnabled } from "@/lib/server/email";
import { isTemplateStorageConfigured, readEmailTemplates } from "@/lib/server/email-templates-store";

export const metadata: Metadata = {
  title: "Email templates | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

export default function EmailTemplatesPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <EmailTemplatesContent />
    </Suspense>
  );
}

/** Subject and wording of the automatic emails (Master Admin). */
async function EmailTemplatesContent() {
  await connection();
  const user = await requireAdminPage("email.manage");

  let stored: StoredTemplates | null = null;
  try {
    stored = await readEmailTemplates();
  } catch (error) {
    console.error("Loading email templates failed", error);
  }
  const sample = sampleTemplateValues(emailTeamName(), SETUP_LINK_HOURS);

  return (
    <AdminFrame user={toPublicAdmin(user)}>
      <AdminBreadcrumb
        items={[{ label: "Admin", href: "/admin/inquiries" }, { label: "Settings" }, { label: "Email templates" }]}
      />
      <h1 className="text-2xl font-semibold text-slate-900">Email templates</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        The subject and wording of the emails the app sends by itself. Words in braces, such as{" "}
        <code className="rounded bg-slate-100 px-1">{"{name}"}</code>, are filled in for each email. Staff replies to
        customers are written on each inquiry, not here.
      </p>

      {!isEmailEnabled() && (
        <p className="mt-4 max-w-2xl rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Email is not set up yet, so these emails are not sent. You can still edit the templates now. See{" "}
          <Link href="/admin/settings/email" className="font-semibold underline underline-offset-2">
            Settings &gt; Email
          </Link>
          .
        </p>
      )}

      <div className="mt-6 space-y-6">
        {stored === null ? (
          <AdminCard>
            <p role="alert" className="text-sm font-medium text-red-700">
              The templates could not be loaded. Reload the page to try again.
            </p>
          </AdminCard>
        ) : (
          TEMPLATE_KEYS.map((key) => {
            const saved = stored[key];
            return (
              <TemplateEditor
                key={key}
                templateKey={key}
                current={templateFor(stored, key)}
                saved={saved ? { updatedAt: saved.updatedAt, updatedBy: saved.updatedBy } : null}
                sample={sample}
                storageConfigured={isTemplateStorageConfigured()}
              />
            );
          })
        )}
      </div>
    </AdminFrame>
  );
}
