# Legal review memo: investor documents and privacy notice

Prepared 2026-11-01. Covers the Investment Agreement and Investor Acknowledgment and Consent
(`src/lib/agreement-template.ts`) and the public Privacy Notice (`src/app/privacy/page.tsx`).

**Read this first.** This is a drafting review done in the role of a senior attorney, but it is
written by an AI assistant. It is not legal advice, it creates no attorney-client relationship, and
it does not replace a licensed US attorney. Its job is to bring the documents up to a standard where
a real attorney can review them quickly and cheaply, and to tell you which questions to ask. Nothing
here should be sent to a real investor until the "Before first use" list at the end is done.

## 1. What you must fill in (one file)

`src/lib/company.ts` holds four values that I cannot know. Until all four are replaced, the Signing
panel on each investor's page warns, and the Privacy Notice shows them as bracketed text.

| Value | What to enter |
| --- | --- |
| Legal name | Exactly as registered, including the type, such as "Example Capital LLC" |
| Address | Registered or principal business address, on one line |
| Governing state | The state whose law governs and whose courts hear disputes |
| Privacy email | A mailbox you read; the Privacy Notice and the data-request process depend on it |

## 2. The biggest issue: securities law

Taking money from individuals in return for scheduled payouts is very likely an offer of
**securities** under US law (a note or an investment contract). If so, each offer must either be
registered or fit an exemption, and the anti-fraud rules apply to everything said about it,
including the calculator, webinars and this website. Points to raise with securities counsel:

- **Which exemption.** Common choices are Regulation D Rule 506(b) (no general solicitation, up to
  35 sophisticated non-accredited investors) and Rule 506(c) (general solicitation allowed, but
  every investor must be an accredited investor and you must verify it). A public calculator,
  webinars and a "How did you find us?" funnel look like general solicitation, which points toward
  506(c). Other routes are Rule 504, Regulation Crowdfunding and an intrastate offering.
- **Filings.** A Form D within 15 days after the first sale, and notice filings and fees in each
  investor's state ("blue sky" laws).
- **Referral payments.** The app records who referred an investor. Paying a commission for
  referrals can make the recipient an unregistered broker-dealer, and can expose the company.
- **Investor eligibility.** The documents ask the investor to confirm their status and
  sophistication, but the app does not collect or verify accredited status. If 506(c) is used, that
  verification must be added.
- **Rate not printed.** The agreement lists payout dates and amounts but not the earnings rate, by
  design. Counsel should confirm that is acceptable disclosure, and check the effective rate
  against state usury limits where the investment is treated as a loan.
- **Marketing claims.** Anything that sounds like a guarantee or promise of return is a risk. The
  calculator's disclaimer is good; counsel should review the rest of the public wording.

## 3. What was changed in the Investment Agreement

| Change | Why |
| --- | --- |
| Key terms and a defined "Business Day" | The details table and payout schedule now clearly form part of the contract, and "Business Day" matches how the app counts days. |
| Funding from the investor's own bank account; return of funds within 10 Business Days if declined | Avoids third-party money and sets a clear refund deadline. |
| Payouts start on the date shown, or the next Business Day; bank crediting delay is not lateness | The app never moves a scheduled date for weekends and holidays, but a bank transfer cannot start on a weekend. |
| Payouts only to an account in the investor's name, changed only through the portal | Fraud and account-takeover control. |
| Early withdrawal only with the Company's written consent; death or incapacity clause | Removes ambiguity about locked-in money and estates. |
| Nature of the investment: unsecured, not a deposit, not FDIC or SIPC insured | Required disclosure; counsel must confirm it is true (no collateral). |
| Securities law clause | Unregistered, offered under an exemption, bought for own account, no resale, status and sophistication confirmed. |
| Statements by the Company | Standing, authority and no conflict. Counsel should confirm each is true for the real entity. |
| Identity, sanctions and anti-money-laundering | Lets the company hold or refuse funds when the law requires, without liability for good-faith delay. |
| Taxes: reporting and backup withholding | Matches how W-9 and 1099 reporting will work. |
| Missed payment: 5 Business Days, then written notice and a 10 Business Day cure period | A fair, standard process instead of silence. These numbers are business decisions. |
| No transfer without consent | Protects both sides from unknown third parties. |
| Notices; E-SIGN and UETA | Clear receipt rule and legal basis for electronic signing. |
| Privacy cross-reference; courts in the governing state | Ties the contract to the Privacy Notice and fixes where disputes are heard. |
| General clause: severability, no waiver, survival, headings | Standard boilerplate that was missing. |

Not included, by choice: arbitration, a jury waiver, a class-action waiver, late-payment interest,
and a limit on the Company's liability. Each is a legal and business decision to take with counsel.

## 4. What was changed in the Acknowledgment and Consent

- Risk paragraph now says the investment is unsecured, uninsured and hard to sell or transfer.
- New clauses for the investor's circumstances and status, and for identity checks.
- The electronic-communications clause now carries the E-SIGN consumer disclosures: what equipment
  is needed, the right to paper copies, how to withdraw consent, and keeping the email current.
  Counsel should confirm the consent is collected in a way that shows the investor can open
  electronic documents (the investor must be able to open the PDF they sign).
- The tax clause mentions reporting and withholding. The bank-details clause requires an account in
  the investor's own name.

## 5. What was changed in the Privacy Notice

- Added who the company is, a last-updated date, categories of data and where it comes from,
  sensitive data, why it is used, a list of who sees it by function (hosting, email and signing
  providers, advisers, authorities, a buyer), security, children, processing location, and changes.
- Rights: copy, correct, delete and opt-out wording that fits California and other state laws,
  how to ask, response times (confirm within 10 business days, answer within 45 days), identity
  checks, agents, and the limit that some records must be kept by law.
- Corrected a factual error: the old text said no analytics are used, but the site includes
  cookie-free visitor statistics (Vercel Web Analytics and Speed Insights) that can be switched on.
- Added the electronic signature provider (BoldSign) and the email provider to the list of
  providers, because investor details are sent to them.

Questions for counsel:

- Do state privacy laws apply to the company at its size? The notice is written to be safe either
  way.
- Is the company a "financial institution" under the Gramm-Leach-Bliley Act? If so, a specific
  financial privacy notice is needed.
- What retention period applies to investor records? The notice says "as long as the law requires",
  which counsel should turn into a number.
- The notice commits the company to confirm a request within 10 business days and answer within 45
  days. Make sure the Master Admin can keep that promise.

## 6. Other items for counsel

- **Identity checks (KYC).** Not built. Decide with counsel whether verification is legally needed.
- **Tax forms.** Collect a W-9 before the first payout. The company may need to send Form 1099
  to investors who earn above the reporting threshold.
- **Signed record.** Keep the BoldSign signed PDF and audit trail together (the app stores both).
- **Insurance and structure.** Consider whether the company needs a regulated structure, a
  registered agent in each investor's state, or insurance.

## 7. Before first use

1. Fill in `src/lib/company.ts` with the four real values.
2. Have a securities attorney confirm the exemption and review both documents and the notice.
3. Replace any wording the attorney changes in `src/lib/agreement-template.ts` and
   `src/app/privacy/page.tsx`, then update the last-updated date on the notice.
4. Send one test document through BoldSign to a colleague, end to end.
5. Only then send an agreement to a real investor. Documents already signed keep the wording they
   were signed with.
