import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminBreadcrumb, AdminCard, AdminFrame, AdminLoading } from "@/components/admin/AdminFrame";
import { ProductsEditor, ProductsHistory } from "@/components/admin/ProductsEditor";
import { toPublicAdmin } from "@/lib/accounts";
import { requireAdminPage } from "@/lib/server/auth";
import {
  isProductStorageConfigured,
  readStoredProductsForAdmin,
  type StoredProducts,
} from "@/lib/server/products-store";

export const metadata: Metadata = {
  title: "Amounts and terms | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function AmountsAndTermsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AmountsAndTermsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AmountsAndTermsContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  // Master Admins only.
  const user = await requireAdminPage("products.manage");
  const savedNotice = (await searchParams).saved === "1";

  let stored: StoredProducts | null = null;
  let storedInvalid = false;
  try {
    ({ stored, invalid: storedInvalid } = await readStoredProductsForAdmin());
  } catch (error) {
    console.error("Reading amounts and terms failed", error);
  }

  return (
    <AdminFrame user={toPublicAdmin(user)}>
      <AdminBreadcrumb items={[{ label: "Admin", href: "/admin/inquiries" }, { label: "Settings" }, { label: "Amounts and terms" }]} />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Amounts and terms</h1>
        <p className="mt-1 text-sm text-slate-600">
          What the calculator offers, and what admins can choose when converting an inquiry or adding an investment.
          Existing investments and inquiries keep their amounts and terms, even ones no longer offered.
        </p>
      </div>

      {!stored ? (
        <AdminCard>
          <p role="alert" className="text-sm font-medium text-red-700">
            The current amounts and terms could not be loaded. Reload the page to try again.
          </p>
        </AdminCard>
      ) : (
        <div className="space-y-6">
          {storedInvalid && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              The saved amounts and terms could not be read, so visitors cannot get quotes. The starting values are
              shown. Check them and select Save amounts and terms to fix this.
            </p>
          )}
          {savedNotice && (
            <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              Saved. The calculator and the investor forms use these amounts and terms immediately.
            </p>
          )}
          {/* A new key after a save starts the form from the saved values. */}
          <ProductsEditor
            key={stored.savedAt ?? "starting"}
            stored={stored}
            storageConfigured={isProductStorageConfigured()}
          />
          <ProductsHistory stored={stored} />
        </div>
      )}
    </AdminFrame>
  );
}
