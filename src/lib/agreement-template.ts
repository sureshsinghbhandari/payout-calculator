/**
 * The documents an investor signs, as editable text: the wording of the
 * Investment Agreement and of the Investor Acknowledgment and Consent, plus
 * the company details printed on them.
 *
 * To change the wording, edit the CLAUSES below. To change the company
 * details, edit AGREEMENT_SETTINGS. Nothing else needs to change: the PDF is
 * laid out from these blocks (see server/agreement-pdf.ts) and filled in with
 * each investor's stored data (name, contact, amounts, dates and the payout
 * schedule). Changes apply to PDFs downloaded from then on; documents already
 * signed are kept as they were.
 *
 * This wording is a starting point, not legal advice. Have your attorney
 * review it before it is sent to an investor.
 */
import type { Investment, Investor } from "./accounts";
import { formatCents, formatDollars, formatIsoDate, formatPercent, formatYears } from "./format";
import { maturityDate, scheduleOrNull } from "./investments";
import { FREQUENCY_LABELS, PAYOUT_TYPE_LABELS } from "./payout";
import { SIGNING_KIND_TITLES, type SigningItem } from "./signing";

/**
 * Company details printed on the documents. Values in [square brackets] are
 * placeholders: the Signing panel warns until they are replaced.
 */
export const AGREEMENT_SETTINGS = {
  /** Legal name of the company the investor invests with. */
  companyName: "[Company legal name]",
  /** Address printed under the company's name. */
  companyAddress: "[Company address]",
  /** State whose laws govern the agreement. */
  governingState: "[State]",
  /** Title printed under the company's signature line. */
  companySignerTitle: "Authorized Representative",
  /**
   * Print the annual earnings rate in the agreement. Off: the rate is never
   * shown to investors in the app, so the agreement lists the payout dates
   * and amounts only.
   */
  showEarningsRate: false,
} as const;

/** Placeholders still in AGREEMENT_SETTINGS, as names, e.g. ["company name"]. */
export function unresolvedPlaceholders(): string[] {
  const labels: Array<[string, string]> = [
    [AGREEMENT_SETTINGS.companyName, "company name"],
    [AGREEMENT_SETTINGS.companyAddress, "company address"],
    [AGREEMENT_SETTINGS.governingState, "governing state"],
  ];
  return labels.filter(([value]) => /^\[.*\]$/.test(value)).map(([, label]) => label);
}

// ---------- content blocks (what the PDF renderer draws) ----------

export type DocumentBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  /** Label and value rows. A null value is drawn as a blank line to fill in. */
  | { type: "details"; rows: ReadonlyArray<readonly [label: string, value: string | null]> }
  | {
      type: "table";
      columns: ReadonlyArray<{ label: string; width: number; align?: "left" | "right" }>;
      rows: string[][];
      /** Bold last row. */
      totals?: string[];
    }
  | { type: "signature"; party: string; lines: ReadonlyArray<readonly [label: string, value: string | null]> };

export interface DocumentContent {
  title: string;
  /** Line under the title. */
  subtitle: string;
  /** Printed in the footer of every page. */
  reference: string;
  blocks: DocumentBlock[];
}

interface Clause {
  heading: string;
  paragraphs: string[];
}

function numbered(clauses: Clause[]): DocumentBlock[] {
  return clauses.flatMap((clause, index): DocumentBlock[] => [
    { type: "heading", text: `${index + 1}. ${clause.heading}` },
    ...clause.paragraphs.map((text): DocumentBlock => ({ type: "paragraph", text })),
  ]);
}

// ---------- the Investment Agreement ----------

const { companyName, companyAddress, governingState } = AGREEMENT_SETTINGS;

function agreementClauses(): Clause[] {
  return [
    {
      heading: "The Investment",
      paragraphs: [
        `The Investor agrees to invest the Investment Amount with the Company, and the Company agrees to accept it, on the terms of this Agreement. The Investor will transfer the Investment Amount to the Company by the Investment Date, by the method the Company confirms in writing. The Company is not required to begin earnings until it has received the full Investment Amount in cleared funds.`,
      ],
    },
    {
      heading: "Earnings and payouts",
      paragraphs: [
        `Earnings begin on the Earnings Start Date and are simple: they are calculated on the invested amount and are not compounded. The Company will pay earnings, and any principal, on the dates and in the amounts set out in the Payout Schedule, by bank transfer to the account the Investor has given the Company.`,
        `The Investor can see each investment and its payouts in the investor portal. The Company will keep the Investor's bank details and contact details only as the Investor provides or approves them.`,
      ],
    },
    {
      heading: "Term and maturity",
      paragraphs: [
        `The Investment Amount is locked in for the Term, from the Investment Date to the Maturity Date. The Investor may not withdraw it, in whole or in part, before the Maturity Date unless the Company agrees in writing. On the Maturity Date the Company will pay the final payout shown in the Payout Schedule.`,
        `This Agreement ends when the final payout has been paid. Any renewal or new investment needs a new written agreement.`,
      ],
    },
    {
      heading: "Risk; no advice",
      paragraphs: [
        `Investing involves risk, including the risk of delayed payment and of losing some or all of the principal. Amounts and dates in the Payout Schedule are calculated from the terms of this Agreement; they are not a promise of future performance beyond the Company's payment obligations in this Agreement. Nothing in this Agreement is investment, tax or legal advice, and the Investor has had the chance to take their own advice.`,
      ],
    },
    {
      heading: "Taxes",
      paragraphs: [
        `The Investor is responsible for their own taxes on earnings received. The Company may ask for tax information (such as an IRS Form W-9) and may report payments as the law requires.`,
      ],
    },
    {
      heading: "Statements by the Investor",
      paragraphs: [
        `The Investor confirms that they are at least 18 years old, that the information they have given the Company is accurate, and that the Investment Amount is their own money, lawfully obtained. The Investor will tell the Company promptly, through the investor portal or in writing, if their contact or bank details change.`,
      ],
    },
    {
      heading: "Electronic records and signatures",
      paragraphs: [
        `The Company may send statements and notices by email or in the investor portal. The parties agree that this Agreement may be signed electronically and in counterparts, and that an electronic signature has the same effect as a handwritten one.`,
      ],
    },
    {
      heading: "Governing law",
      paragraphs: [`This Agreement is governed by the laws of the State of ${governingState}, without regard to conflict-of-law rules.`],
    },
    {
      heading: "Entire agreement; changes",
      paragraphs: [
        `This Agreement, together with the Investor Acknowledgment and Consent signed by the Investor, is the whole agreement between the parties about this investment. It can be changed only in writing signed by both parties. If a part of it is found unenforceable, the rest stays in effect.`,
      ],
    },
  ];
}

function investmentDetails(investment: Investment, number: number) {
  const schedule = scheduleOrNull(investment);
  const rows: Array<readonly [string, string | null]> = [
    ["Investment", `Investment ${number}`],
    ["Investment Amount", formatDollars(investment.principal)],
    ["Investment Date", formatIsoDate(investment.investmentDate)],
    ["Earnings Start Date", schedule ? formatIsoDate(schedule.startDate) : "See the Company"],
    ["Term (locked in)", formatYears(investment.lockInYears)],
    ["Maturity Date", schedule ? formatIsoDate(maturityDate(schedule)) : "See the Company"],
    ["Payout Frequency", FREQUENCY_LABELS[investment.frequency]],
    ["Payout Type", PAYOUT_TYPE_LABELS[investment.payoutType]],
  ];
  if (AGREEMENT_SETTINGS.showEarningsRate) rows.push(["Annual earnings rate", formatPercent(investment.annualRatePercent)]);
  if (schedule) rows.push(["Total scheduled payouts", formatCents(schedule.totals.payoutCents)]);
  return { rows, schedule };
}

function scheduleTable(investment: Investment): DocumentBlock | null {
  const schedule = scheduleOrNull(investment);
  if (!schedule) return null;
  return {
    type: "table",
    columns: [
      { label: "#", width: 0.07 },
      { label: "Payout date", width: 0.19 },
      { label: "Earnings", width: 0.18, align: "right" },
      { label: "Principal", width: 0.18, align: "right" },
      { label: "Total payout", width: 0.19, align: "right" },
      { label: "Principal left", width: 0.19, align: "right" },
    ],
    rows: schedule.rows.map((row) => [
      String(row.payoutNumber),
      formatIsoDate(row.payoutDate),
      formatCents(row.interestCents),
      formatCents(row.principalRepaymentCents),
      formatCents(row.totalPayoutCents),
      formatCents(row.remainingPrincipalCents),
    ]),
    totals: [
      "",
      "Total",
      formatCents(schedule.totals.interestCents),
      formatCents(schedule.totals.principalCents),
      formatCents(schedule.totals.payoutCents),
      "",
    ],
  };
}

type InvestorForDocuments = Pick<Investor, "id" | "name" | "username" | "email" | "phone" | "investments">;

function agreementContent(item: SigningItem, investor: InvestorForDocuments, preparedOn: string): DocumentContent | null {
  const index = investor.investments.findIndex((i) => i.id === item.investmentId);
  if (index === -1) return null;
  const investment = investor.investments[index];
  const { rows } = investmentDetails(investment, index + 1);
  const table = scheduleTable(investment);

  return {
    title: SIGNING_KIND_TITLES.agreement,
    subtitle: `Investment ${index + 1} · Prepared ${formatIsoDate(preparedOn)}`,
    reference: `${investor.id} / ${item.key}`,
    blocks: [
      {
        type: "paragraph",
        text: `This Investment Agreement (the "Agreement") is made between ${companyName}, ${companyAddress} (the "Company"), and the investor named below (the "Investor"). It takes effect on the date the last party signs it.`,
      },
      { type: "heading", text: "Investor" },
      {
        type: "details",
        rows: [
          ["Name", investor.name],
          ["Email", investor.email || null],
          ["Phone", investor.phone || null],
          ["Address", null],
        ],
      },
      { type: "heading", text: "Investment details" },
      { type: "details", rows },
      ...(table ? [{ type: "heading", text: "Payout Schedule" } as const, table] : []),
      ...numbered(agreementClauses()),
      { type: "heading", text: "Signatures" },
      {
        type: "paragraph",
        text: "By signing below, each party agrees to this Agreement, including the Payout Schedule above.",
      },
      {
        type: "signature",
        party: "Investor",
        lines: [
          ["Signature", null],
          ["Printed name", investor.name],
          ["Date signed", null],
        ],
      },
      {
        type: "signature",
        party: `For ${companyName}`,
        lines: [
          ["Signature", null],
          ["Name", null],
          ["Title", AGREEMENT_SETTINGS.companySignerTitle],
          ["Date signed", null],
        ],
      },
    ],
  };
}

// ---------- the Investor Acknowledgment and Consent ----------

function acknowledgmentClauses(): Clause[] {
  return [
    {
      heading: "Risk",
      paragraphs: [
        `I understand that investing involves risk. Payout amounts and dates shown for my investments are calculated from the agreed terms and are not a guarantee of investment performance. Actual payment timing, taxes, fees and the return of principal may differ, and I may lose some or all of the money I invest. Nothing the Company has told me is a substitute for professional financial, tax or legal advice.`,
      ],
    },
    {
      heading: "Accuracy of my information",
      paragraphs: [
        `The details I have given the Company, including those above, are accurate and complete. I will tell the Company promptly, through the investor portal or in writing, if they change.`,
      ],
    },
    {
      heading: "Privacy",
      paragraphs: [
        `I understand that the Company collects and uses my personal and bank information to manage my investments, pay my earnings, send me statements and notices, and meet its legal duties. I have been given the Company's privacy notice, and I know I can ask the Company for a copy of my data or to delete my account through the investor portal.`,
      ],
    },
    {
      heading: "Electronic communications",
      paragraphs: [
        `I agree that the Company may send me statements, payout notices, agreements and other documents by email and in the investor portal, and that I may sign documents electronically. I can ask for paper copies at any time.`,
      ],
    },
    {
      heading: "Bank details",
      paragraphs: [
        `I will give my bank details to the Company only through the investor portal, and I understand the Company will never ask me to send them by email. Payouts are made only to the account I have given and the Company has approved.`,
      ],
    },
    {
      heading: "Tax information",
      paragraphs: [`I will give the Company any tax form it reasonably asks for, such as an IRS Form W-9, and I am responsible for my own taxes.`],
    },
  ];
}

function acknowledgmentContent(item: SigningItem, investor: InvestorForDocuments, preparedOn: string): DocumentContent {
  const investmentRows = investor.investments.map((investment, index) => {
    const schedule = scheduleOrNull(investment);
    return [
      String(index + 1),
      formatDollars(investment.principal),
      formatIsoDate(investment.investmentDate),
      formatYears(investment.lockInYears),
      schedule ? formatIsoDate(maturityDate(schedule)) : "",
    ];
  });

  return {
    title: SIGNING_KIND_TITLES.acknowledgment,
    subtitle: `Prepared ${formatIsoDate(preparedOn)}`,
    reference: `${investor.id} / ${item.key}`,
    blocks: [
      {
        type: "paragraph",
        text: `I am an investor with ${companyName}, ${companyAddress} (the "Company"). I give the acknowledgments and consents below for every investment I hold with the Company, now and in the future, until I withdraw them in writing.`,
      },
      { type: "heading", text: "My details" },
      {
        type: "details",
        rows: [
          ["Name", investor.name],
          ["Email", investor.email || null],
          ["Phone", investor.phone || null],
          ["Address", null],
          ["Portal username", investor.username],
        ],
      },
      ...(investmentRows.length > 0
        ? ([
            { type: "heading", text: "My investments on file" },
            {
              type: "table",
              columns: [
                { label: "#", width: 0.08 },
                { label: "Amount", width: 0.23, align: "right" },
                { label: "Investment date", width: 0.23 },
                { label: "Term", width: 0.2 },
                { label: "Maturity date", width: 0.26 },
              ],
              rows: investmentRows,
            },
          ] as DocumentBlock[])
        : []),
      ...numbered(acknowledgmentClauses()),
      { type: "heading", text: "Signature" },
      {
        type: "signature",
        party: "Investor",
        lines: [
          ["Signature", null],
          ["Printed name", investor.name],
          ["Date signed", null],
        ],
      },
    ],
  };
}

/** The content of one signing document filled in from the investor's stored data, or null when the item no longer exists. */
export function buildSigningDocument(item: SigningItem, investor: InvestorForDocuments, preparedOn: string): DocumentContent | null {
  return item.kind === "agreement" ? agreementContent(item, investor, preparedOn) : acknowledgmentContent(item, investor, preparedOn);
}
