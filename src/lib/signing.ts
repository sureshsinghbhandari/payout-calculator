/**
 * Investor signing: which documents an investor must sign, and where each one
 * stands. Pure types and helpers shared by the admin page, the server actions
 * and the document routes.
 *
 * The flow is manual and done outside the app with BoldSign:
 *   1. prepare   the app generates the pre-filled PDF (download)
 *   2. send      the owner uploads it to BoldSign and sends it to the investor
 *   3. collect   the owner downloads the signed PDF from BoldSign
 *   4. store     the owner uploads the signed PDF here (kept in the document vault)
 *
 * Steps 2 and 3 are the only ones that touch BoldSign. A BoldSign API
 * integration would replace just those two: it would send the generated PDF
 * itself, and a webhook would store the signed PDF through the same
 * `addDocument` call (type "signed-agreement", same `signingKey`). The
 * "prepare" and "store" steps, the status rules and the vault stay as they are.
 */
import type { PublicDocument } from "./documents";
import { isValidIsoDate } from "./dates";
import { formatIsoDate } from "./format";

export type SigningKind = "agreement" | "acknowledgment";

/** One document an investor signs. */
export interface SigningItem {
  /** "agreement-<investment id>" or "acknowledgment". Stable, so records and files stay linked to it. */
  key: string;
  kind: SigningKind;
  title: string;
  /** One line saying what the document is. */
  summary: string;
  /** The investment an agreement covers (null for the acknowledgment). */
  investmentId: string | null;
  /** 1-based position of that investment in the investor's list. */
  investmentNumber: number | null;
}

/** The slice of an investor the signing items are built from. */
export interface SigningSubject {
  investments: ReadonlyArray<{ id: string }>;
}

export const ACKNOWLEDGMENT_KEY = "acknowledgment";
const AGREEMENT_PREFIX = "agreement-";
const ID_LIKE = /^[A-Za-z0-9_-]{1,64}$/;

export const SIGNING_KIND_TITLES: Record<SigningKind, string> = {
  agreement: "Investment Agreement",
  acknowledgment: "Investor Acknowledgment and Consent",
};

/** The documents this investor signs: one agreement per investment, then the acknowledgment (once per investor). */
export function signingItemsFor(investor: SigningSubject): SigningItem[] {
  const agreements = investor.investments.map(
    (investment, index): SigningItem => ({
      key: `${AGREEMENT_PREFIX}${investment.id}`,
      kind: "agreement",
      title: `${SIGNING_KIND_TITLES.agreement}, Investment ${index + 1}`,
      summary: "Terms of this investment, its payout schedule and the signatures of the investor and the company.",
      investmentId: investment.id,
      investmentNumber: index + 1,
    }),
  );
  return [
    ...agreements,
    {
      key: ACKNOWLEDGMENT_KEY,
      kind: "acknowledgment",
      title: SIGNING_KIND_TITLES.acknowledgment,
      summary: "Risk, privacy and electronic-communication acknowledgments, signed once for all investments.",
      investmentId: null,
      investmentNumber: null,
    },
  ];
}

/** The signing item for `key`, or null when this investor has no such document. */
export function findSigningItem(investor: SigningSubject, key: unknown): SigningItem | null {
  if (typeof key !== "string" || !ID_LIKE.test(key)) return null;
  return signingItemsFor(investor).find((item) => item.key === key) ?? null;
}

// ---------- records and status ----------

/** What the app knows about the first two steps of one signing item. */
export interface SigningRecord {
  investorId: string;
  key: string;
  /** When the PDF was last downloaded (ISO), and by whom. Null until it is. */
  preparedAt: string | null;
  preparedBy: string;
  /** Date the owner sent it in BoldSign (YYYY-MM-DD), set by hand. Null when not marked as sent. */
  sentOn: string | null;
  /** Who marked it as sent. */
  sentBy: string;
}

export type SigningStatus = "not-started" | "prepared" | "sent" | "signed";

export const SIGNING_STATUS_LABELS: Record<SigningStatus, string> = {
  "not-started": "Not started",
  prepared: "Prepared",
  sent: "Sent for signature",
  signed: "Signed on file",
};

/** Badge classes for each status (same look as the payout status badges). */
export const SIGNING_STATUS_BADGES: Record<SigningStatus, string> = {
  "not-started": "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200",
  prepared: "bg-blue-50 text-blue-900 ring-1 ring-inset ring-blue-200",
  sent: "bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-300",
  signed: "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200",
};

/** The signed PDFs of one item, newest first (the vault list is already newest first). */
export function signedDocumentsFor(documents: readonly PublicDocument[], key: string): PublicDocument[] {
  return documents.filter((d) => d.type === "signed-agreement" && d.signingKey === key);
}

/** BoldSign audit trails (certificates of completion) kept with one item, newest first. */
export function auditTrailsFor(documents: readonly PublicDocument[], key: string): PublicDocument[] {
  return documents.filter((d) => d.type === "certificate" && d.signingKey === key);
}

/**
 * Status rules. A signed PDF on file wins; deleting it from the vault takes
 * the item back to Sent / Prepared. Then "sent" (marked by hand), then
 * "prepared" (the PDF was downloaded).
 */
export function signingStatus(record: SigningRecord | null, signedDocuments: readonly unknown[]): SigningStatus {
  if (signedDocuments.length > 0) return "signed";
  if (record?.sentOn) return "sent";
  if (record?.preparedAt) return "prepared";
  return "not-started";
}

export function emptySigningRecord(investorId: string, key: string): SigningRecord {
  return { investorId, key, preparedAt: null, preparedBy: "", sentOn: null, sentBy: "" };
}

/** Parses the stored signing records; malformed entries are dropped. */
export function parseSigningRecords(list: unknown): SigningRecord[] {
  if (!Array.isArray(list)) return [];
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return list.flatMap((raw): SigningRecord[] => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const investorId = str(r.investorId);
    const key = str(r.key);
    if (!ID_LIKE.test(investorId) || !ID_LIKE.test(key)) return [];
    const sentOn = str(r.sentOn);
    return [
      {
        investorId,
        key,
        preparedAt: str(r.preparedAt) || null,
        preparedBy: str(r.preparedBy),
        sentOn: isValidIsoDate(sentOn) ? sentOn : null,
        sentBy: str(r.sentBy),
      },
    ];
  });
}

/** A date the owner enters for "sent in BoldSign on": a real date, not after `latest`. */
export function parseSentDate(raw: unknown, latest: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!isValidIsoDate(value)) return { ok: false, error: "Enter the date you sent it in BoldSign." };
  if (value < "2000-01-01") return { ok: false, error: "Enter a date after 1999." };
  if (value > latest) return { ok: false, error: "The date cannot be in the future." };
  return { ok: true, value };
}

// ---------- names ----------

/** A file name like "Investment-Agreement-Jane-Doe-Investment-1.pdf" (ASCII only, safe on every system). */
export function signingFileName(item: SigningItem, investorName: string): string {
  const base = SIGNING_KIND_TITLES[item.kind].replace(/\s+/g, "-");
  const person = investorName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const parts = [base, person || "Investor"];
  if (item.investmentNumber !== null) parts.push(`Investment-${item.investmentNumber}`);
  return `${parts.join("-")}.pdf`;
}

/** Title for the stored signed PDF, e.g. "Signed Investment Agreement, Investment 1". */
export function signedDocumentTitle(item: SigningItem): string {
  return `Signed ${item.title}`;
}

/** Title for the stored BoldSign audit trail. */
export function auditTrailTitle(item: SigningItem): string {
  return `BoldSign audit trail, ${item.title}`;
}

/** "Prepared Nov 1, 2026 by Jane" style line for the panel. */
export function describeSent(record: SigningRecord): string {
  return `Sent ${formatIsoDate(record.sentOn ?? "")}${record.sentBy ? ` (marked by ${record.sentBy})` : ""}`;
}
