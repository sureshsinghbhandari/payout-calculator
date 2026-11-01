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
 * The company's name, address, governing state and privacy contact come from
 * lib/company.ts. This wording was drafted and reviewed as a careful draft,
 * not as legal advice: docs/legal-review.md lists what a licensed attorney
 * must confirm (especially securities-law compliance) before it is sent to an
 * investor.
 */
import type { Investment, Investor } from "./accounts";
import { COMPANY, isPlaceholder } from "./company";
import { formatCents, formatDollars, formatIsoDate, formatPercent, formatYears } from "./format";
import { maturityDate, scheduleOrNull } from "./investments";
import { FREQUENCY_LABELS, PAYOUT_TYPE_LABELS } from "./payout";
import { SIGNING_KIND_TITLES, type SigningItem } from "./signing";

/**
 * Company details printed on the documents. Values in [square brackets] are
 * placeholders: the Signing panel warns until they are replaced.
 */
export const AGREEMENT_SETTINGS = {
  /** Legal name of the company the investor invests with (set in lib/company.ts). */
  companyName: COMPANY.legalName,
  /** Address printed under the company's name (set in lib/company.ts). */
  companyAddress: COMPANY.address,
  /** State whose laws govern the agreement (set in lib/company.ts). */
  governingState: COMPANY.governingState,
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
    [COMPANY.privacyEmail, "privacy contact email"],
  ];
  return labels.filter(([value]) => isPlaceholder(value)).map(([, label]) => label);
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
      heading: "The Investment and key terms",
      paragraphs: [
        `The Investor agrees to invest the Investment Amount with the Company, and the Company agrees to accept it, on the terms of this Agreement. The Investment Amount, Investment Date, Earnings Start Date, Term, Maturity Date, payout frequency and payout type are the ones shown under "Investment details" above, and the Payout Schedule above forms part of this Agreement. A "Business Day" is a Monday to Friday that is not a US federal holiday.`,
        `The Investor will transfer the Investment Amount to the Company by the Investment Date, by the method the Company confirms in writing, from a bank account in the Investor's own name. The Company is not required to start earnings until it has received the full Investment Amount in cleared funds. If the Company declines the investment or cannot accept it, it will return any funds it received, without deduction, within ten (10) Business Days.`,
      ],
    },
    {
      heading: "Earnings and payouts",
      paragraphs: [
        `Earnings begin on the Earnings Start Date. They are simple: they are calculated on the invested amount and are not compounded. The Company will pay earnings, and any principal, on the dates and in the amounts set out in the Payout Schedule, by bank transfer to the account the Investor has given the Company through the investor portal.`,
        `The Company will start each transfer on the payout date shown or, if that day is not a Business Day, on the next Business Day. The amount of the payout does not change when the transfer starts on a later day. Banks may take additional days to credit a transfer, and that delay is not a late payment by the Company. The Company may change the account a payout is sent to only after the Investor has requested the change through the investor portal and the Company has checked and approved it.`,
        `The Investor can see each investment and its payouts in the investor portal. The Company will keep the Investor's bank details and contact details only as the Investor provides or approves them.`,
      ],
    },
    {
      heading: "Term, maturity and early withdrawal",
      paragraphs: [
        `The Investment Amount is locked in for the Term, from the Investment Date to the Maturity Date. The Investor may not withdraw it, in whole or in part, before the Maturity Date unless the Company agrees in writing, and the Company is not required to agree. On the Maturity Date the Company will pay the final payout shown in the Payout Schedule.`,
        `If the Investor dies or becomes legally unable to manage their affairs, the Company will deal with the Investor's executor, personal representative or legal guardian once they provide the documents the Company reasonably asks for, and will pay amounts due under this Agreement to them or as the law directs.`,
        `This Agreement ends when the final payout has been paid. Any renewal or new investment needs a new written agreement.`,
      ],
    },
    {
      heading: "Nature of the investment and risk",
      paragraphs: [
        `The Company's payment obligations are contractual obligations of the Company alone. Unless the Company agrees otherwise in writing, they are not secured by collateral, they are not a bank deposit, and they are not insured or guaranteed by the FDIC, the SIPC or any government agency.`,
        `Investing involves risk, including the risk of delayed payment and of losing some or all of the principal. The investment cannot easily be sold or transferred. Amounts and dates in the Payout Schedule are calculated from the terms of this Agreement; they are not a promise of future performance beyond the Company's payment obligations in this Agreement. Nothing in this Agreement or in anything the Company has said is investment, tax or legal advice, and the Investor has had the chance to take their own advice before signing.`,
      ],
    },
    {
      heading: "Securities law",
      paragraphs: [
        `The investment has not been registered under the US Securities Act of 1933 or under any state securities law, and is offered in reliance on exemptions from registration. The Investor is investing for their own account and not on behalf of anyone else, is not investing with a view to resell or distribute it, and understands that it may not be resold or transferred except as this Agreement and the law allow.`,
        `The Investor confirms that the information they have given the Company about their finances and investor status is true and complete, that they have enough knowledge and experience (or have taken advice) to judge the risks, and that they can afford to lose the Investment Amount and to leave it invested for the whole Term.`,
      ],
    },
    {
      heading: "Statements by the Company",
      paragraphs: [
        `The Company confirms that it is validly organized and in existence under the laws of its home state, that it has the authority to enter into this Agreement, that the person signing for it is authorized to do so, and that signing and performing this Agreement does not break any law or any other agreement that binds the Company.`,
      ],
    },
    {
      heading: "Statements by the Investor; identity and compliance",
      paragraphs: [
        `The Investor confirms that they are at least 18 years old, that the information they have given the Company is accurate, and that the Investment Amount is their own money, lawfully obtained. The Investor will tell the Company promptly, through the investor portal or in writing, if their contact or bank details change.`,
        `To meet anti-money-laundering, sanctions and similar laws, the Company may ask the Investor for identity documents and other information, and may delay, hold or refuse a transaction, or return funds, where the law requires or the Company reasonably suspects a breach of the law. The Company will not be liable for a delay caused in good faith by doing so.`,
      ],
    },
    {
      heading: "Taxes",
      paragraphs: [
        `The Investor is responsible for their own taxes on earnings received. The Company may ask for tax information (such as an IRS Form W-9), may report payments to tax authorities as the law requires, and may withhold tax from a payout where the law requires it (for example, backup withholding if tax information is not provided). Amounts withheld in this way count as paid to the Investor.`,
      ],
    },
    {
      heading: "If a payment is missed",
      paragraphs: [
        `If an amount due under this Agreement has not been received within five (5) Business Days after its payout date, the Investor may give the Company written notice of the missed payment. The Company will then have ten (10) Business Days after it receives the notice to pay the amount (the "cure period"). If the amount is still unpaid when the cure period ends, the Investor may take the steps the law allows to recover it.`,
      ],
    },
    {
      heading: "No transfer without consent",
      paragraphs: [
        `The Investor may not sell, assign, pledge or otherwise transfer this Agreement or any right under it without the Company's written consent. The Company may transfer this Agreement only to a successor that takes over its business and its obligations under this Agreement, and will tell the Investor in writing if it does.`,
      ],
    },
    {
      heading: "Notices and electronic records",
      paragraphs: [
        `The Company may send statements and notices by email or in the investor portal, and the Investor may send notices to the Company at the address shown at the start of this Agreement or through the investor portal. A notice sent by email or posted in the portal is treated as received on the next Business Day.`,
        `The parties agree that this Agreement may be signed electronically and in counterparts, that an electronic signature has the same effect as a handwritten one, and that a signed copy kept electronically is as good as the original, as the US federal E-SIGN Act and the Uniform Electronic Transactions Act allow.`,
      ],
    },
    {
      heading: "Privacy",
      paragraphs: [
        `The Company will use and protect the Investor's personal information as described in its Privacy Notice, which the Investor can read at any time on the Company's website.`,
      ],
    },
    {
      heading: "Governing law and courts",
      paragraphs: [
        `This Agreement is governed by the laws of the State of ${governingState}, without regard to conflict-of-law rules. The parties agree that the state and federal courts located in that State are the proper courts for any dispute under this Agreement, and each consents to those courts' jurisdiction. Nothing in this clause limits any right the Investor has under securities, consumer or other laws that cannot be waived.`,
      ],
    },
    {
      heading: "General",
      paragraphs: [
        `This Agreement, together with the Investor Acknowledgment and Consent signed by the Investor, is the whole agreement between the parties about this investment. It can be changed only in writing signed by both parties. If a part of it is found unenforceable, the rest stays in effect. A party that delays in using a right under this Agreement has not given it up. Headings are for convenience only. Clauses that by their nature are meant to continue (including those on taxes, privacy, governing law and general terms) continue after this Agreement ends.`,
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
        `I understand that investing involves risk. Payout amounts and dates shown for my investments are calculated from the agreed terms and are not a guarantee of investment performance. Actual payment timing, taxes, fees and the return of principal may differ, and I may lose some or all of the money I invest. My investments are obligations of the Company alone. Unless the Company has agreed otherwise in writing, they are not secured by collateral and are not insured or guaranteed by the FDIC, the SIPC or any government agency. They cannot easily be sold or transferred, and my money is locked in for the term of each investment. Nothing the Company has told me is a substitute for professional financial, tax or legal advice.`,
      ],
    },
    {
      heading: "My circumstances and investor status",
      paragraphs: [
        `The information I have given the Company about my finances and investor status is true and complete. I am investing my own money for my own account, I can afford to lose it and to leave it invested for the whole term, and I have enough knowledge and experience, or have taken advice, to judge the risks. I understand that the investments are not registered with any securities regulator and are offered in reliance on exemptions from registration.`,
      ],
    },
    {
      heading: "Accuracy of my information",
      paragraphs: [
        `The details I have given the Company, including those above, are accurate and complete. I will tell the Company promptly, through the investor portal or in writing, if they change.`,
      ],
    },
    {
      heading: "Identity checks",
      paragraphs: [
        `I understand that the Company may ask me for identity documents and other information to meet anti-money-laundering, sanctions and similar laws, and may delay or refuse a transaction where the law requires. I will answer such requests promptly and truthfully.`,
      ],
    },
    {
      heading: "Privacy",
      paragraphs: [
        `I understand that the Company collects and uses my personal and bank information to manage my investments, pay my earnings, send me statements and notices, and meet its legal duties. I have been given the Company's Privacy Notice, which explains what is collected, who sees it, how long it is kept and my rights, including to ask for a copy of my data or for my account to be deleted through the investor portal.`,
      ],
    },
    {
      heading: "Consent to electronic communications and signatures",
      paragraphs: [
        `I agree that the Company may send me statements, payout notices, agreements, tax forms and other documents electronically, by email and in the investor portal, instead of on paper, and that I may sign documents electronically. To receive them I need a device with internet access, a current web browser, a program that opens PDF files, and a working email address. I will keep my email address up to date in the investor portal.`,
        `I can ask the Company for a paper copy of any document at any time, and I can withdraw this consent at any time by telling the Company in writing; withdrawing it does not affect anything already done. The Company may tell me about any fee for paper copies before it applies one.`,
      ],
    },
    {
      heading: "Bank details",
      paragraphs: [
        `I will give my bank details to the Company only through the investor portal, and I understand the Company will never ask me to send them by email. Payouts are made only to a bank account in my own name that I have given and the Company has approved.`,
      ],
    },
    {
      heading: "Tax information",
      paragraphs: [
        `I will give the Company any tax form it reasonably asks for, such as an IRS Form W-9. I understand that the Company may report my earnings to tax authorities and may withhold tax where the law requires, and that I am responsible for my own taxes.`,
      ],
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
