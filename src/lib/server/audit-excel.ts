import "server-only";
import * as ExcelJSModule from "exceljs";
import { ROLE_LABELS } from "../accounts";
import { AUDIT_CATEGORY_LABELS, type AuditEvent } from "../audit";
import { XLSX_MIME_TYPE } from "../excel";
import { formatIsoDate } from "../format";

/**
 * Excel (.xlsx) export of the audit log for a date range: one row per event,
 * oldest first, with a frozen header row and filters.
 */

// ExcelJS is CommonJS: depending on the bundler the classes live on the
// namespace itself or on its `default` export.
const ExcelJS =
  (ExcelJSModule as unknown as { default?: typeof ExcelJSModule }).default ?? ExcelJSModule;

const NAVY = "FF1E3A8A";

function roleLabel(event: AuditEvent): string {
  const { actor } = event;
  if (actor.kind === "admin") return actor.role ? ROLE_LABELS[actor.role] : "Admin";
  if (actor.kind === "investor") return "Investor";
  if (actor.kind === "visitor") return "Visitor";
  return "System";
}

export interface AuditWorkbookFile {
  data: ArrayBuffer;
  fileName: string;
  contentType: string;
}

/** `from` and `to` are YYYY-MM-DD (both included). */
export async function buildAuditWorkbook(
  events: AuditEvent[],
  from: string,
  to: string,
): Promise<AuditWorkbookFile> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Investment Payout Calculator";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Audit log", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "Time (UTC)", key: "at", width: 21, style: { numFmt: "yyyy-mm-dd hh:mm:ss" } },
    { header: "Who", key: "who", width: 26 },
    { header: "Role", key: "role", width: 15 },
    { header: "Category", key: "category", width: 22 },
    { header: "Action", key: "action", width: 26 },
    { header: "Summary", key: "summary", width: 70 },
    { header: "Target", key: "target", width: 30 },
  ];

  for (const event of events) {
    const { actor } = event;
    sheet.addRow({
      // ExcelJS stores dates as UTC, so the cell shows the UTC time.
      at: new Date(event.at),
      who: actor.username && actor.username !== actor.name ? `${actor.name} (${actor.username})` : actor.name,
      role: roleLabel(event),
      category: AUDIT_CATEGORY_LABELS[event.category] ?? event.category,
      action: event.action,
      summary: event.summary,
      target: event.target?.label ?? "",
    });
  }

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
  sheet.getColumn("summary").alignment = { wrapText: true, vertical: "top" };

  if (events.length === 0) {
    sheet.addRow({ who: `No activity recorded from ${formatIsoDate(from)} to ${formatIsoDate(to)}.` });
  }

  const data = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
  return { data, fileName: `audit-log-${from}-to-${to}.xlsx`, contentType: XLSX_MIME_TYPE };
}
