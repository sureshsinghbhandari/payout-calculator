# Upcoming features

What the Investment Payout Calculator already does, what is being built, and what is planned.
The same list is in the app under **Settings > Upcoming features** (Master Admin).

This file is generated from `src/lib/roadmap.ts`. To change it, edit that file and run
`npm run docs:features`.

**12 done · 4 in progress · 33 pending**

Priority: **Now** is being worked on or needed first, **Next** comes after that, **Later** is for the future.

<a id="summary"></a>

## Summary

| # | Feature | Status | Priority | Area |
| --- | --- | --- | --- | --- |
| 1 | [Send and receive email (Gmail now, Resend later)](#email-setup) | 🔄 In progress | Now | Email and messaging |
| 2 | [Acknowledge inquiries by email](#inquiry-acknowledgement) | 🔄 In progress | Now | Email and messaging |
| 3 | [Customer email replies](#customer-responses) | 🔄 In progress | Now | Email and messaging |
| 4 | [Search, filters and export](#search-export) | 🔄 In progress | Next | Sales and inquiries |
| 5 | [Company domain](#company-domain) | ⏳ Pending | Now | Email and messaging |
| 6 | [Remove permanent delete before go-live](#remove-permanent-delete) | ⏳ Pending | Now | Security and compliance |
| 7 | [Alerts for new inquiries](#new-inquiry-alerts) | ⏳ Pending | Next | Email and messaging |
| 8 | [Email templates](#email-templates) | ⏳ Pending | Next | Email and messaging |
| 9 | [Assign inquiries and follow-up dates](#assign-inquiries) | ⏳ Pending | Next | Sales and inquiries |
| 10 | [Lead source and seminar tracking](#lead-source) | ⏳ Pending | Next | Sales and inquiries |
| 11 | [Forgot password by email](#forgot-password) | ⏳ Pending | Next | Investor portal |
| 12 | [Statements and downloads](#statements) | ⏳ Pending | Next | Investor portal |
| 13 | [Record actual payouts](#record-payments) | ⏳ Pending | Next | Payouts and operations |
| 14 | [Payout calendar](#payout-calendar) | ⏳ Pending | Next | Payouts and operations |
| 15 | [Two-step sign-in](#two-factor) | ⏳ Pending | Next | Security and compliance |
| 16 | [Privacy notice and data requests](#privacy) | ⏳ Pending | Next | Security and compliance |
| 17 | [Automated tests and checks](#automated-tests) | ⏳ Pending | Next | Security and compliance |
| 18 | [Dashboard](#dashboard) | ⏳ Pending | Next | Reports and insights |
| 19 | [Your own web address](#custom-domain) | ⏳ Pending | Next | Platform and experience |
| 20 | [Company branding](#branding) | ⏳ Pending | Next | Platform and experience |
| 21 | [Payout notices to investors](#payout-reminders) | ⏳ Pending | Later | Email and messaging |
| 22 | [SMS and WhatsApp messages](#sms-whatsapp) | ⏳ Pending | Later | Email and messaging |
| 23 | [Pipeline board](#pipeline-board) | ⏳ Pending | Later | Sales and inquiries |
| 24 | [Document vault](#documents) | ⏳ Pending | Later | Investor portal |
| 25 | [More investments and renewals](#multiple-investments) | ⏳ Pending | Later | Investor portal |
| 26 | [Profile and bank detail updates](#profile-requests) | ⏳ Pending | Later | Investor portal |
| 27 | [Monthly payout term](#monthly-payouts) | ⏳ Pending | Later | Payouts and operations |
| 28 | [Bank holiday calendar](#holiday-calendar) | ⏳ Pending | Later | Payouts and operations |
| 29 | [Amounts and terms in settings](#configurable-products) | ⏳ Pending | Later | Payouts and operations |
| 30 | [Identity checks (KYC)](#kyc) | ⏳ Pending | Later | Security and compliance |
| 31 | [E-signature of agreements](#e-signature) | ⏳ Pending | Later | Security and compliance |
| 32 | [Sign-in alerts](#sign-in-alerts) | ⏳ Pending | Later | Security and compliance |
| 33 | [Audit log export](#audit-export) | ⏳ Pending | Later | Reports and insights |
| 34 | [Visitor analytics](#web-analytics) | ⏳ Pending | Later | Reports and insights |
| 35 | [Install on phones](#installable-app) | ⏳ Pending | Later | Platform and experience |
| 36 | [More languages](#languages) | ⏳ Pending | Later | Platform and experience |
| 37 | [Accessibility review](#accessibility-review) | ⏳ Pending | Later | Platform and experience |
| 38 | [Inquiries from the calculator](#visitor-inquiries) | ✅ Done | Now | Sales and inquiries |
| 39 | [Inquiry statuses, delete and restore](#inquiry-statuses) | ✅ Done | Now | Sales and inquiries |
| 40 | [Convert an inquiry into an investor](#convert-to-investor) | ✅ Done | Now | Sales and inquiries |
| 41 | [Investor portal](#investor-portal) | ✅ Done | Now | Investor portal |
| 42 | [Investor logins](#investor-logins) | ✅ Done | Now | Investor portal |
| 43 | [Payout calculator](#payout-calculator) | ✅ Done | Now | Payouts and operations |
| 44 | [Interest rates managed by Master Admins](#rates-management) | ✅ Done | Now | Payouts and operations |
| 45 | [Admin users and roles](#admin-roles) | ✅ Done | Now | Security and compliance |
| 46 | [Audit log](#audit-log) | ✅ Done | Now | Security and compliance |
| 47 | [Seminar presentation](#seminar-deck) | ✅ Done | Now | Platform and experience |
| 48 | [Demo data for testing](#demo-data) | ✅ Done | Now | Platform and experience |
| 49 | [Notes and call log on inquiries](#inquiry-notes) | ✅ Done | Next | Sales and inquiries |

## In progress

<a id="email-setup"></a>

### Send and receive email (Gmail now, Resend later)

**Status:** 🔄 In progress · **Priority:** Now · **Area:** Email and messaging

Email works with Gmail now (no domain needed; replies are picked up by checking the inbox) and can switch to Resend with the EMAIL_PROVIDER setting once there is a company domain (replies arrive instantly, with delivery and bounce tracking). Settings > Email shows the status and a test button.

**Outcome:** Customers get emails from the business, and their replies come back into the app.

**Needs:**

- Now: a Gmail account for the business with 2-Step Verification and an app password, added to Vercel by the owner
- Later: a company domain, a Resend Full access API key and the Resend webhook

[Back to the table](#summary)

<a id="inquiry-acknowledgement"></a>

### Acknowledge inquiries by email

**Status:** 🔄 In progress · **Priority:** Now · **Area:** Email and messaging

As soon as an inquiry arrives, email the customer a thank-you with their reference number and what happens next.

**Outcome:** Every customer gets an immediate confirmation, recorded in the audit log.

**Depends on:** [Send and receive email (Gmail now, Resend later)](#email-setup) (🔄 In progress), [Company domain](#company-domain) (⏳ Pending)

**Needs:**

- Approved wording for the acknowledgement email (a first version is live)

[Back to the table](#summary)

<a id="customer-responses"></a>

### Customer email replies

**Status:** 🔄 In progress · **Priority:** Now · **Area:** Email and messaging

Customers' replies are picked up (from the Gmail inbox now, through the Resend webhook later) and attached to the matching inquiry by its reply address or reference number. Staff can answer from the inquiry page.

**Outcome:** Admins see the conversation on the inquiry; each response is recorded in the audit log under Customer responses.

**Depends on:** [Send and receive email (Gmail now, Resend later)](#email-setup) (🔄 In progress), [Acknowledge inquiries by email](#inquiry-acknowledgement) (🔄 In progress)

[Back to the table](#summary)

<a id="search-export"></a>

### Search, filters and export

**Status:** 🔄 In progress · **Priority:** Next · **Area:** Sales and inquiries

Search inquiries and investors by name, email or reference, filter by status and date, and export to Excel.

**Outcome:** Inquiries can already be searched by name, email, phone or reference and filtered by status; investors, dates and export are next.

[Back to the table](#summary)

## Pending

<a id="company-domain"></a>

### Company domain

**Status:** ⏳ Pending · **Priority:** Now · **Area:** Email and messaging

Buy a domain (about $11 a year) for the website and email, verify it in Resend, and point the site at it.

**Outcome:** Customers see a company web address and get emails from it, which reads as more trustworthy.

**Needs:**

- The domain name to buy
- DNS records from Resend for sending and receiving

[Back to the table](#summary)

<a id="remove-permanent-delete"></a>

### Remove permanent delete before go-live

**Status:** ⏳ Pending · **Priority:** Now · **Area:** Security and compliance

The temporary Delete permanently button for inquiries is removed once the app is ready.

[Back to the table](#summary)

<a id="new-inquiry-alerts"></a>

### Alerts for new inquiries

**Status:** ⏳ Pending · **Priority:** Next · **Area:** Email and messaging

Notify the sales team by email (and optionally Slack or Teams) the moment a new inquiry arrives.

**Depends on:** [Send and receive email (Gmail now, Resend later)](#email-setup) (🔄 In progress)

[Back to the table](#summary)

<a id="email-templates"></a>

### Email templates

**Status:** ⏳ Pending · **Priority:** Next · **Area:** Email and messaging

Editable templates for follow-ups, welcome-to-the-portal emails, password setup links and payout notices, with the customer's name and plan filled in.

**Depends on:** [Send and receive email (Gmail now, Resend later)](#email-setup) (🔄 In progress)

[Back to the table](#summary)

<a id="assign-inquiries"></a>

### Assign inquiries and follow-up dates

**Status:** ⏳ Pending · **Priority:** Next · **Area:** Sales and inquiries

Assign each inquiry to a Sales Admin, set a follow-up date, and show each person their own list of today's follow-ups.

[Back to the table](#summary)

<a id="lead-source"></a>

### Lead source and seminar tracking

**Status:** ⏳ Pending · **Priority:** Next · **Area:** Sales and inquiries

Record where each inquiry came from (seminar, website, referral) using links or QR codes, so you can see which seminars bring investors.

**Outcome:** Each seminar gets its own QR code; the Inquiries page shows the source.

[Back to the table](#summary)

<a id="forgot-password"></a>

### Forgot password by email

**Status:** ⏳ Pending · **Priority:** Next · **Area:** Investor portal

Investors and staff reset their own password with an emailed link instead of asking an admin.

**Depends on:** [Send and receive email (Gmail now, Resend later)](#email-setup) (🔄 In progress)

[Back to the table](#summary)

<a id="statements"></a>

### Statements and downloads

**Status:** ⏳ Pending · **Priority:** Next · **Area:** Investor portal

Investors download a statement for each investment (PDF and Excel) with the schedule and payments made.

[Back to the table](#summary)

<a id="record-payments"></a>

### Record actual payouts

**Status:** ⏳ Pending · **Priority:** Next · **Area:** Payouts and operations

Mark each scheduled payout as paid (date, amount, reference), so the portal shows real payments instead of scheduled dates.

[Back to the table](#summary)

<a id="payout-calendar"></a>

### Payout calendar

**Status:** ⏳ Pending · **Priority:** Next · **Area:** Payouts and operations

One view of all upcoming payouts across investors, with totals per week and month for cash planning.

[Back to the table](#summary)

<a id="two-factor"></a>

### Two-step sign-in

**Status:** ⏳ Pending · **Priority:** Next · **Area:** Security and compliance

Optional authenticator-app codes for staff and investors, required for Master Admins.

[Back to the table](#summary)

<a id="privacy"></a>

### Privacy notice and data requests

**Status:** ⏳ Pending · **Priority:** Next · **Area:** Security and compliance

A privacy notice on the inquiry form, consent checkbox, retention periods, and a way to handle deletion requests.

[Back to the table](#summary)

<a id="automated-tests"></a>

### Automated tests and checks

**Status:** ⏳ Pending · **Priority:** Next · **Area:** Security and compliance

Tests for sign-in, roles, conversion and the portal, run automatically before each deployment.

[Back to the table](#summary)

<a id="dashboard"></a>

### Dashboard

**Status:** ⏳ Pending · **Priority:** Next · **Area:** Reports and insights

Inquiries per week, conversion rate, total invested, and upcoming payouts owed, on the admin home page.

[Back to the table](#summary)

<a id="custom-domain"></a>

### Your own web address

**Status:** ⏳ Pending · **Priority:** Next · **Area:** Platform and experience

Use your company domain (for example invest.yourcompany.com) instead of the vercel.app address.

**Needs:**

- A domain you own
- Adding two DNS records

[Back to the table](#summary)

<a id="branding"></a>

### Company branding

**Status:** ⏳ Pending · **Priority:** Next · **Area:** Platform and experience

Your logo, colours and contact details across the calculator, portal, emails and seminar materials.

[Back to the table](#summary)

<a id="payout-reminders"></a>

### Payout notices to investors

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Email and messaging

Email investors a few days before each payout, and confirm when it has been paid.

**Depends on:** [Send and receive email (Gmail now, Resend later)](#email-setup) (🔄 In progress), [Record actual payouts](#record-payments) (⏳ Pending)

[Back to the table](#summary)

<a id="sms-whatsapp"></a>

### SMS and WhatsApp messages

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Email and messaging

Optional text or WhatsApp messages for acknowledgements and payout notices.

**Needs:**

- A messaging provider account (for example Twilio or WhatsApp Business)
- Customer consent to receive messages

[Back to the table](#summary)

<a id="pipeline-board"></a>

### Pipeline board

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Sales and inquiries

A board view of inquiries by stage (New, Contacted, Meeting booked, Converted) with drag and drop.

[Back to the table](#summary)

<a id="documents"></a>

### Document vault

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Investor portal

Share agreements, certificates and tax documents with each investor securely in the portal.

[Back to the table](#summary)

<a id="multiple-investments"></a>

### More investments and renewals

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Investor portal

Add further investments for an existing investor, and offer renewal at maturity with the current rates.

[Back to the table](#summary)

<a id="profile-requests"></a>

### Profile and bank detail updates

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Investor portal

Investors request changes to their contact or bank details; a Master Admin approves them.

[Back to the table](#summary)

<a id="monthly-payouts"></a>

### Monthly payout term

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Payouts and operations

Add Monthly alongside Quarterly, Half-Yearly and Yearly, with its own rate.

[Back to the table](#summary)

<a id="holiday-calendar"></a>

### Bank holiday calendar

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Payouts and operations

Skip public holidays when counting business days, and optionally move payouts that land on weekends or holidays.

[Back to the table](#summary)

<a id="configurable-products"></a>

### Amounts and terms in settings

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Payouts and operations

Let Master Admins change the investment amounts and terms on a settings page instead of in the code.

[Back to the table](#summary)

<a id="kyc"></a>

### Identity checks (KYC)

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Security and compliance

Collect and verify investor identity documents before an investment is confirmed.

**Needs:**

- Advice on the rules that apply to your business
- An identity verification provider

[Back to the table](#summary)

<a id="e-signature"></a>

### E-signature of agreements

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Security and compliance

Send the investment agreement for electronic signature and store the signed copy in the document vault.

**Depends on:** [Document vault](#documents) (⏳ Pending)

[Back to the table](#summary)

<a id="sign-in-alerts"></a>

### Sign-in alerts

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Security and compliance

Warn Master Admins about repeated failed sign-ins or sign-ins from new places, using the audit log.

[Back to the table](#summary)

<a id="audit-export"></a>

### Audit log export

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Reports and insights

Download the audit log for a date range as Excel.

[Back to the table](#summary)

<a id="web-analytics"></a>

### Visitor analytics

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Reports and insights

Privacy-friendly visit counts for the calculator page (Vercel Web Analytics has a free tier).

[Back to the table](#summary)

<a id="installable-app"></a>

### Install on phones

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Platform and experience

Let investors add the portal to their phone's home screen and open it like an app.

[Back to the table](#summary)

<a id="languages"></a>

### More languages

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Platform and experience

Show the calculator and portal in other languages, with local number and date formats.

[Back to the table](#summary)

<a id="accessibility-review"></a>

### Accessibility review

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Platform and experience

A full check against WCAG 2.2 AA with screen readers and keyboard-only use.

[Back to the table](#summary)

## Done

<a id="visitor-inquiries"></a>

### Inquiries from the calculator

**Status:** ✅ Done · **Priority:** Now · **Area:** Sales and inquiries

Visitors send an inquiry with their plan, name, email, phone and a message. Spam protection: a hidden honeypot field and at most 5 inquiries per client per hour.

**Outcome:** Admins see every inquiry on the Inquiries page (the admin home), newest first.

[Back to the table](#summary)

<a id="inquiry-statuses"></a>

### Inquiry statuses, delete and restore

**Status:** ✅ Done · **Priority:** Now · **Area:** Sales and inquiries

New, Contacted and Converted statuses. Mark as contacted asks for a note (call, meeting or note). Delete moves an inquiry to Deleted inquiries, where a Master Admin can restore it.

[Back to the table](#summary)

<a id="convert-to-investor"></a>

### Convert an inquiry into an investor

**Status:** ✅ Done · **Priority:** Now · **Area:** Sales and inquiries

A contacted inquiry becomes an investor with one click: the form is pre-filled from the inquiry and the interest rate is fixed at that moment.

[Back to the table](#summary)

<a id="investor-portal"></a>

### Investor portal

**Status:** ✅ Done · **Priority:** Now · **Area:** Investor portal

Investors sign in at /portal and see each investment: amounts, dates, totals, the next payout and the full payout schedule. The interest rate is never shown.

[Back to the table](#summary)

<a id="investor-logins"></a>

### Investor logins

**Status:** ✅ Done · **Priority:** Now · **Area:** Investor portal

A Master Admin gives each investor a temporary password or a one-time setup link (valid 72 hours), can reset it, edit contact details and disable or enable the login.

[Back to the table](#summary)

<a id="payout-calculator"></a>

### Payout calculator

**Status:** ✅ Done · **Priority:** Now · **Area:** Payouts and operations

Payout schedule for a fixed-term investment (simple interest, Interest Only or Interest and Principal), comparisons with other payout terms and types, and an Excel download.

[Back to the table](#summary)

<a id="rates-management"></a>

### Interest rates managed by Master Admins

**Status:** ✅ Done · **Priority:** Now · **Area:** Payouts and operations

One rate per payout term, never sent to visitors or investors. Editing needs the admin's own password, locks again after saving or 10 minutes, and keeps the last 20 saves.

[Back to the table](#summary)

<a id="admin-roles"></a>

### Admin users and roles

**Status:** ✅ Done · **Priority:** Now · **Area:** Security and compliance

Named admin users with Master Admin and Sales Admin roles, temporary passwords and setup links, and a sign-in rate limit. Sales Admins never see interest rates.

[Back to the table](#summary)

<a id="audit-log"></a>

### Audit log

**Status:** ✅ Done · **Priority:** Now · **Area:** Security and compliance

Who did what and when: sign-ins, password changes, inquiries, investors, users, rates and emails, by month and category. Events about an inquiry also show on that inquiry.

[Back to the table](#summary)

<a id="seminar-deck"></a>

### Seminar presentation

**Status:** ✅ Done · **Priority:** Now · **Area:** Platform and experience

A PowerPoint and PDF deck for investor seminars, with the calculator address, a QR code and the disclaimer (in docs/).

[Back to the table](#summary)

<a id="demo-data"></a>

### Demo data for testing

**Status:** ✅ Done · **Priority:** Now · **Area:** Platform and experience

npm run seed:demo adds demo inquiries, investors, notes and activity, and removes them again with --remove, before go-live.

[Back to the table](#summary)

<a id="inquiry-notes"></a>

### Notes and call log on inquiries

**Status:** ✅ Done · **Priority:** Next · **Area:** Sales and inquiries

Add notes, calls and meetings to an inquiry, shown as a timeline with who added each entry, together with every audit event about the inquiry. The Inquiries list shows each inquiry's latest note.

[Back to the table](#summary)
