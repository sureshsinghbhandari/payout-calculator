import { redirect } from "next/navigation";
import { connection, type NextRequest } from "next/server";
import { addDays } from "@/lib/dates";
import { parseAuditExportRange } from "@/lib/audit";
import type { AuditWorkbookFile } from "@/lib/server/audit-excel";
import { listAuditEventsBetween } from "@/lib/server/audit-store";
import { requireAdminPermission } from "@/lib/server/auth";

/**
 * Downloads the audit log for a date range as an Excel file (Master Admin):
 * GET /admin/settings/audit/export?from=YYYY-MM-DD&to=YYYY-MM-DD, both days
 * included, in UTC.
 */
export async function GET(request: NextRequest) {
  // Always runs at request time (never prerendered at build time).
  await connection();
  const user = await requireAdminPermission("audit.view");
  if (!user) redirect("/admin");

  const params = request.nextUrl.searchParams;
  const range = parseAuditExportRange(params.get("from"), params.get("to"));
  if (!range.ok) redirect(`/admin/settings/audit?export=invalid`);

  let file: AuditWorkbookFile;
  try {
    const events = await listAuditEventsBetween(`${range.from}T00:00:00.000Z`, `${addDays(range.to, 1)}T00:00:00.000Z`);
    // Loaded on demand so the spreadsheet library only loads for an export.
    const { buildAuditWorkbook } = await import("@/lib/server/audit-excel");
    file = await buildAuditWorkbook(events, range.from, range.to);
  } catch (error) {
    console.error("Exporting the audit log failed", error);
    redirect(`/admin/settings/audit?export=failed`);
  }

  return new Response(file.data, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
