import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminLoading } from "@/components/admin/AdminFrame";
import { InquiriesView, type SearchParams } from "@/components/admin/InquiriesView";

export const metadata: Metadata = {
  title: "Inquiries | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

export default function InquiriesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <InquiriesView view="active" searchParams={searchParams} />
    </Suspense>
  );
}
