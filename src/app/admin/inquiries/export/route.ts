import { redirect } from "next/navigation";
import { connection } from "next/server";
import { can } from "@/lib/accounts";
import { adminActor } from "@/lib/audit";
import { matchesInquiryListQuery, parseInquiryListQuery, todayEastern, type StoredInquiry } from "@/lib/inquiry";
import { recordAudit } from "@/lib/server/audit-store";
import { requireAdminPermission } from "@/lib/server/auth";
import { listInquiries } from "@/lib/server/inquiry-store";

/**
 * Excel download of the Inquiries list with the same search and filters as
 * the page (the link carries them in its query string). Deleted inquiries are
 * never included, and rates only for Master Admins.
 */
export async function GET(request: Request): Promise<Response> {
  // Always per request: never prerendered at build time.
  await connection();
  const user = await requireAdminPermission("inquiries.export");
  if (!user) redirect("/admin");

  const url = new URL(request.url);
  const query = parseInquiryListQuery(Object.fromEntries(url.searchParams));
  const today = todayEastern();
  let rows: StoredInquiry[];
  try {
    rows = (await listInquiries()).inquiries.filter(
      (i) => i.status !== "deleted" && matchesInquiryListQuery(i, query, { userId: user.id, today }),
    );
  } catch (error) {
    console.error("Listing inquiries for the export failed", error);
    return new Response("Inquiries could not be loaded. Go back and try again.", { status: 503 });
  }

  // Loaded only when someone exports.
  const { buildInquiriesWorkbook, XLSX_MIME_TYPE } = await import("@/lib/server/inquiry-export");
  const data = await buildInquiriesWorkbook(rows, { includeRates: can(user.role, "investors.manage") });
  recordAudit({
    actor: adminActor(user),
    category: "inquiry",
    action: "inquiry.exported",
    summary: `Exported ${rows.length} ${rows.length === 1 ? "inquiry" : "inquiries"} to Excel`,
  });
  return new Response(data, {
    headers: {
      "Content-Type": XLSX_MIME_TYPE,
      "Content-Disposition": `attachment; filename="inquiries-${today}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
