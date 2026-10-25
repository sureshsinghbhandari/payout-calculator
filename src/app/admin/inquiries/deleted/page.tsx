import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminLoading } from "@/components/admin/AdminFrame";
import { InquiriesView } from "@/components/admin/InquiriesView";

export const metadata: Metadata = {
  title: "Deleted inquiries | Admin | Investment Payout Calculator",
  robots: { index: false, follow: false },
};

export default function DeletedInquiriesPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <InquiriesView view="deleted" />
    </Suspense>
  );
}
