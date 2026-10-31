import "server-only";
import * as ExcelJSModule from "exceljs";
import { HOW_FOUND_LABELS, inquiryReference, type InquiryStatus, type StoredInquiry } from "../inquiry";
import { FREQUENCY_LABELS, PAYOUT_TYPE_LABELS } from "../payout";

export { XLSX_MIME_TYPE } from "../excel";

/**
 * Excel (.xlsx) export of the Inquiries list, as filtered on the page. One
 * row per inquiry. The rate column is only included for Master Admins.
 */

// ExcelJS is CommonJS: depending on the bundler the classes live on the
// namespace itself or on its `default` export.
const ExcelJS = (ExcelJSModule as unknown as { default?: typeof ExcelJSModule }).default ?? ExcelJSModule;

const NAVY = "FF1E3A8A";
const BORDER_GRAY = "FFCBD5E1";
const CURRENCY = '"$"#,##0.00';
const WHOLE_CURRENCY = '"$"#,##0';

const STATUS_LABELS: Record<InquiryStatus, string> = {
  new: "New",
  contacted: "Contacted",
  converted: "Converted",
  deleted: "Deleted",
};

/** A YYYY-MM-DD date as an Excel date (midnight UTC, which ExcelJS writes without shifting). */
function excelDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

interface Column {
  header: string;
  width: number;
  value: (inquiry: StoredInquiry) => string | number | Date | null;
  numFmt?: string;
}

export async function buildInquiriesWorkbook(
  inquiries: StoredInquiry[],
  options: { includeRates: boolean },
): Promise<ArrayBuffer> {
  const columns: Column[] = [
    { header: "Reference", width: 12, value: (i) => inquiryReference(i.id) },
    { header: "Received (UTC)", width: 18, value: (i) => new Date(i.createdAt), numFmt: "mmm d, yyyy h:mm" },
    { header: "Name", width: 24, value: (i) => i.name },
    { header: "Email", width: 30, value: (i) => i.email },
    { header: "Phone", width: 18, value: (i) => i.phone || null },
    { header: "Status", width: 12, value: (i) => STATUS_LABELS[i.status] },
    { header: "Source", width: 18, value: (i) => i.source },
    { header: "How found", width: 20, value: (i) => HOW_FOUND_LABELS[i.howFound] },
    {
      header: "Referral details",
      width: 28,
      value: (i) => (i.howFound === "webinar" ? i.webinarDetails : i.howFound === "friend-family" ? i.referrerContact : null) || null,
    },
    { header: "Assigned to", width: 20, value: (i) => i.assignedTo?.name ?? null },
    { header: "Follow-up", width: 14, value: (i) => (i.followUpDate ? excelDate(i.followUpDate) : null), numFmt: "mmm d, yyyy" },
    { header: "Amount", width: 14, value: (i) => i.plan.principal, numFmt: WHOLE_CURRENCY },
    { header: "Term (years)", width: 12, value: (i) => i.plan.lockInYears },
    { header: "Payout term", width: 14, value: (i) => FREQUENCY_LABELS[i.plan.frequency] },
    { header: "Payout type", width: 22, value: (i) => PAYOUT_TYPE_LABELS[i.plan.payoutType] },
    // Sales Admins do not see earnings rates.
    ...(options.includeRates
      ? [{ header: "Rate (%)", width: 10, value: (i: StoredInquiry) => i.plan.annualRatePercent, numFmt: "0.00##" }]
      : []),
    { header: "Total earnings", width: 16, value: (i) => i.plan.totalInterestCents / 100, numFmt: CURRENCY },
    { header: "Total paid", width: 16, value: (i) => i.plan.totalPaidCents / 100, numFmt: CURRENCY },
  ];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Investment Payout Calculator";
  workbook.title = "Inquiries";
  const ws = workbook.addWorksheet("Inquiries", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ width: c.width }));

  const header = ws.addRow(columns.map((c) => c.header));
  header.height = 22;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });

  for (const inquiry of inquiries) {
    const row = ws.addRow(columns.map((c) => c.value(inquiry)));
    columns.forEach((c, index) => {
      const cell = row.getCell(index + 1);
      if (c.numFmt) cell.numFmt = c.numFmt;
      cell.border = { bottom: { style: "hair", color: { argb: BORDER_GRAY } } };
    });
  }
  if (inquiries.length > 0) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}
