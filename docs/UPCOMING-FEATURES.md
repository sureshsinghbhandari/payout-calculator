# Upcoming features

What the Investment Payout Calculator already does, what is being built, and what is planned.
The same list is in the app under **Settings > Upcoming features** (Master Admin).

This file is generated from `src/lib/roadmap.ts`. To change it, edit that file and run
`npm run docs:features`.

**29 done · 7 in progress · 14 pending** · 21 [waiting on you](#waiting-on-you)

Priority: **Now** is being worked on or needed first, **Next** comes after that, **Later** is for the future.

<a id="summary"></a>

## Summary

| # | Feature | Status | Priority | Area | Needs from you |
| --- | --- | --- | --- | --- | --- |
| 1 | [Send and receive email (Gmail now, Resend later)](#email-setup) | 🔄 In progress | Now | Email and messaging | A Gmail account with an app password, added in Vercel as GMAIL_USER and GMAIL_APP_PASSWORD. |
| 2 | [Acknowledge inquiries by email](#inquiry-acknowledgement) | 🔄 In progress | Now | Email and messaging | Email set up (Gmail settings in Vercel), and approval of the acknowledgement wording. |
| 3 | [Customer email replies](#customer-responses) | 🔄 In progress | Now | Email and messaging | Email set up (Gmail settings in Vercel). |
| 4 | [Alerts for new inquiries](#new-inquiry-alerts) | 🔄 In progress | Next | Email and messaging | Email set up (Gmail settings in Vercel) before alerts can be sent. |
| 5 | [Email templates](#email-templates) | 🔄 In progress | Next | Email and messaging | Email set up (Gmail settings in Vercel), and approval of the wording. |
| 6 | [Forgot password by email](#forgot-password) | 🔄 In progress | Next | Investor portal | Email set up (Gmail settings in Vercel) before reset links can be sent. |
| 7 | [Payout notices to investors](#payout-reminders) | 🔄 In progress | Later | Email and messaging | Email set up (Gmail settings in Vercel), and a CRON_SECRET added in Vercel for the daily job. |
| 8 | [Company domain](#company-domain) | ⏳ Pending | Now | Email and messaging | Buy the domain (about $11 a year) and add the DNS records it needs. |
| 9 | [Remove permanent delete before go-live](#remove-permanent-delete) | ⏳ Pending | Now | Security and compliance | Your go-ahead at go-live, after the test data is cleaned up. |
| 10 | [Privacy notice and data requests](#privacy) | ⏳ Pending | Next | Security and compliance | The privacy notice wording, ideally checked by a lawyer. |
| 11 | [Automated tests and checks](#automated-tests) | ⏳ Pending | Next | Security and compliance | Your go-ahead to add and run tests. |
| 12 | [Your own web address](#custom-domain) | ⏳ Pending | Next | Platform and experience | The domain (see Company domain) and access to its DNS settings. |
| 13 | [Company branding](#branding) | ⏳ Pending | Next | Platform and experience | Your logo, colours and contact details. |
| 14 | [SMS and WhatsApp messages](#sms-whatsapp) | ⏳ Pending | Later | Email and messaging | A messaging provider account (for example Twilio) and its keys, and customer consent. |
| 15 | [Monthly payout term](#monthly-payouts) | ⏳ Pending | Later | Payouts and operations | Confirm Monthly should be offered, and the monthly rate. |
| 16 | [Bank holiday calendar](#holiday-calendar) | ⏳ Pending | Later | Payouts and operations | Which country's public holidays to skip (for example US federal holidays). |
| 17 | [Identity checks (KYC)](#kyc) | ⏳ Pending | Later | Security and compliance | An identity verification provider account, and advice on the rules that apply. |
| 18 | [E-signature of agreements](#e-signature) | ⏳ Pending | Later | Security and compliance | An e-signature provider account (for example DocuSign or Dropbox Sign) and its keys. |
| 19 | [Visitor analytics](#web-analytics) | ⏳ Pending | Later | Reports and insights | Turn on Web Analytics in the Vercel project. |
| 20 | [More languages](#languages) | ⏳ Pending | Later | Platform and experience | Which languages, and someone to check the translations. |
| 21 | [Accessibility review](#accessibility-review) | ⏳ Pending | Later | Platform and experience | Your go-ahead for browser checks. |
| 22 | [New inquiry notifications](#inquiry-notifications) | ✅ Done | Now | Sales and inquiries | — |
| 23 | [Inquiries from the calculator](#visitor-inquiries) | ✅ Done | Now | Sales and inquiries | — |
| 24 | [Inquiry statuses, delete and restore](#inquiry-statuses) | ✅ Done | Now | Sales and inquiries | — |
| 25 | [Convert an inquiry into an investor](#convert-to-investor) | ✅ Done | Now | Sales and inquiries | — |
| 26 | [Investor portal](#investor-portal) | ✅ Done | Now | Investor portal | — |
| 27 | [Investor logins](#investor-logins) | ✅ Done | Now | Investor portal | — |
| 28 | [Payout calculator](#payout-calculator) | ✅ Done | Now | Payouts and operations | — |
| 29 | [Interest rates managed by Master Admins](#rates-management) | ✅ Done | Now | Payouts and operations | — |
| 30 | [Employees and roles](#admin-roles) | ✅ Done | Now | Security and compliance | — |
| 31 | [Audit log](#audit-log) | ✅ Done | Now | Security and compliance | — |
| 32 | [Seminar presentation](#seminar-deck) | ✅ Done | Now | Platform and experience | — |
| 33 | [Demo data for testing](#demo-data) | ✅ Done | Now | Platform and experience | — |
| 34 | [Assign inquiries and follow-up dates](#assign-inquiries) | ✅ Done | Next | Sales and inquiries | — |
| 35 | [Notes and call log on inquiries](#inquiry-notes) | ✅ Done | Next | Sales and inquiries | — |
| 36 | [Lead source and seminar tracking](#lead-source) | ✅ Done | Next | Sales and inquiries | — |
| 37 | [Search, filters and export](#search-export) | ✅ Done | Next | Sales and inquiries | — |
| 38 | [Statements and downloads](#statements) | ✅ Done | Next | Investor portal | — |
| 39 | [Record actual payouts](#record-payments) | ✅ Done | Next | Payouts and operations | — |
| 40 | [Payout calendar](#payout-calendar) | ✅ Done | Next | Payouts and operations | — |
| 41 | [Two-step sign-in](#two-factor) | ✅ Done | Next | Security and compliance | — |
| 42 | [Dashboard](#dashboard) | ✅ Done | Next | Reports and insights | — |
| 43 | [Pipeline board](#pipeline-board) | ✅ Done | Later | Sales and inquiries | — |
| 44 | [Document vault](#documents) | ✅ Done | Later | Investor portal | — |
| 45 | [More investments and renewals](#multiple-investments) | ✅ Done | Later | Investor portal | — |
| 46 | [Profile and bank detail updates](#profile-requests) | ✅ Done | Later | Investor portal | — |
| 47 | [Amounts and terms in settings](#configurable-products) | ✅ Done | Later | Payouts and operations | — |
| 48 | [Sign-in alerts](#sign-in-alerts) | ✅ Done | Later | Security and compliance | — |
| 49 | [Audit log export](#audit-export) | ✅ Done | Later | Reports and insights | — |
| 50 | [Install on phones](#installable-app) | ✅ Done | Later | Platform and experience | — |

<a id="waiting-on-you"></a>

## Waiting on you

These cannot be finished without access, an account, a key, wording or a decision from you.
Everything else in the list can be built without your help.

| # | Feature | Status | What is needed from you |
| --- | --- | --- | --- |
| 1 | [Send and receive email (Gmail now, Resend later)](#email-setup) | 🔄 In progress | A Gmail account with an app password, added in Vercel as GMAIL_USER and GMAIL_APP_PASSWORD. |
| 2 | [Acknowledge inquiries by email](#inquiry-acknowledgement) | 🔄 In progress | Email set up (Gmail settings in Vercel), and approval of the acknowledgement wording. |
| 3 | [Customer email replies](#customer-responses) | 🔄 In progress | Email set up (Gmail settings in Vercel). |
| 4 | [Alerts for new inquiries](#new-inquiry-alerts) | 🔄 In progress | Email set up (Gmail settings in Vercel) before alerts can be sent. |
| 5 | [Email templates](#email-templates) | 🔄 In progress | Email set up (Gmail settings in Vercel), and approval of the wording. |
| 6 | [Forgot password by email](#forgot-password) | 🔄 In progress | Email set up (Gmail settings in Vercel) before reset links can be sent. |
| 7 | [Payout notices to investors](#payout-reminders) | 🔄 In progress | Email set up (Gmail settings in Vercel), and a CRON_SECRET added in Vercel for the daily job. |
| 8 | [Company domain](#company-domain) | ⏳ Pending | Buy the domain (about $11 a year) and add the DNS records it needs. |
| 9 | [Remove permanent delete before go-live](#remove-permanent-delete) | ⏳ Pending | Your go-ahead at go-live, after the test data is cleaned up. |
| 10 | [Privacy notice and data requests](#privacy) | ⏳ Pending | The privacy notice wording, ideally checked by a lawyer. |
| 11 | [Automated tests and checks](#automated-tests) | ⏳ Pending | Your go-ahead to add and run tests. |
| 12 | [Your own web address](#custom-domain) | ⏳ Pending | The domain (see Company domain) and access to its DNS settings. |
| 13 | [Company branding](#branding) | ⏳ Pending | Your logo, colours and contact details. |
| 14 | [SMS and WhatsApp messages](#sms-whatsapp) | ⏳ Pending | A messaging provider account (for example Twilio) and its keys, and customer consent. |
| 15 | [Monthly payout term](#monthly-payouts) | ⏳ Pending | Confirm Monthly should be offered, and the monthly rate. |
| 16 | [Bank holiday calendar](#holiday-calendar) | ⏳ Pending | Which country's public holidays to skip (for example US federal holidays). |
| 17 | [Identity checks (KYC)](#kyc) | ⏳ Pending | An identity verification provider account, and advice on the rules that apply. |
| 18 | [E-signature of agreements](#e-signature) | ⏳ Pending | An e-signature provider account (for example DocuSign or Dropbox Sign) and its keys. |
| 19 | [Visitor analytics](#web-analytics) | ⏳ Pending | Turn on Web Analytics in the Vercel project. |
| 20 | [More languages](#languages) | ⏳ Pending | Which languages, and someone to check the translations. |
| 21 | [Accessibility review](#accessibility-review) | ⏳ Pending | Your go-ahead for browser checks. |

<a id="app-map"></a>

## Where things are

Every screen of the app and its address. Under **Details** below, each feature that has a
screen also has a layout sketch. The sketches show what is on the page and where; the
exact wording, colours and spacing differ. Features that are still pending have no sketch yet.

```text
Visitors
  /inquiries ................ Calculator, then "Send inquiry"

Investors
  /portal ................... Sign in, then investments and schedules
  /portal/details ........... Your details (change requests)
  /portal/security .......... Sign-in security (two-step)
  /portal/forgot-password ... Forgot password

Staff, all under /admin (gear menu at the top right)
  Inquiries ................. /admin/inquiries  (the home page)
    Inquiry page ............ /admin/inquiries/<id>
    Pipeline board .......... /admin/inquiries/board
    Deleted inquiries ....... /admin/inquiries/deleted
  Dashboard ................. /admin/dashboard
  Investors ................. /admin/investors
    Investor page ........... /admin/investors/<id>
    Change requests ......... /admin/investors/requests
  Payout calendar ........... /admin/payouts
  Settings (gear menu)
    Interest rates           Amounts and terms     Lead sources
    Employees                Email                 Email templates
    Audit log                Upcoming features     My account
```

## In progress

<a id="email-setup"></a>

### Send and receive email (Gmail now, Resend later)

**Status:** 🔄 In progress · **Priority:** Now · **Area:** Email and messaging

Email works with Gmail now (no domain needed; replies are picked up by checking the inbox) and can switch to Resend with the EMAIL_PROVIDER setting once there is a company domain (replies arrive instantly, with delivery and bounce tracking). Settings > Email shows the status and a test button.

**Needs from you:** A Gmail account with an app password, added in Vercel as GMAIL_USER and GMAIL_APP_PASSWORD.

**Outcome:** Customers get emails from the business, and their replies come back into the app.

**Needs:**

- Now: a Gmail account for the business with 2-Step Verification and an app password, added to Vercel by the owner
- Later: a company domain, a Resend Full access API key and the Resend webhook

**Layout** (a sketch, not a screenshot):

```text
Settings > Email
------------------------------------------------------------------
 Status
   Provider                   Gmail
   Sending emails             [ On ]
   Receiving customer replies [ On ]
   Sent from                  Acme Investments <team@gmail.com>
   Replies go to              team+<code>@gmail.com
 (amber box with anything still to set up)

 Gmail replies     Last checked Oct 27, 13:30 UTC   [ Check for replies ]
 Test              Send a test email to [ you@example.com ] [ Send ]
 Payout emails to investors   (see Payout notices)
```

[Back to the table](#summary)

<a id="inquiry-acknowledgement"></a>

### Acknowledge inquiries by email

**Status:** 🔄 In progress · **Priority:** Now · **Area:** Email and messaging

As soon as an inquiry arrives, email the customer a thank-you with their reference number and what happens next.

**Needs from you:** Email set up (Gmail settings in Vercel), and approval of the acknowledgement wording.

**Outcome:** Every customer gets an immediate confirmation, recorded in the audit log.

**Depends on:** [Send and receive email (Gmail now, Resend later)](#email-setup) (🔄 In progress), [Company domain](#company-domain) (⏳ Pending)

**Needs:**

- Approved wording for the acknowledgement email (a first version is live)

[Back to the table](#summary)

<a id="customer-responses"></a>

### Customer email replies

**Status:** 🔄 In progress · **Priority:** Now · **Area:** Email and messaging

Customers' replies are picked up (from the Gmail inbox now, through the Resend webhook later) and attached to the matching inquiry by its reply address or reference number. Staff can answer from the inquiry page.

**Needs from you:** Email set up (Gmail settings in Vercel).

**Outcome:** Admins see the conversation on the inquiry; each response is recorded in the audit log under Customer responses.

**Depends on:** [Send and receive email (Gmail now, Resend later)](#email-setup) (🔄 In progress), [Acknowledge inquiries by email](#inquiry-acknowledgement) (🔄 In progress)

[Back to the table](#summary)

<a id="new-inquiry-alerts"></a>

### Alerts for new inquiries

**Status:** 🔄 In progress · **Priority:** Next · **Area:** Email and messaging

Notify the sales team by email (and optionally Slack or Teams) the moment a new inquiry arrives.

**Needs from you:** Email set up (Gmail settings in Vercel) before alerts can be sent.

**Outcome:** Built: admins add their email on My account and switch on alerts. Emails start once email is set up.

**Depends on:** [Send and receive email (Gmail now, Resend later)](#email-setup) (🔄 In progress)

**Layout** (a sketch, not a screenshot):

```text
My account
------------------------------------------------------------------
 Email and alerts
   Email address [ suresh@example.com ]   Current password [ ....... ]
   [x] Email me when a new inquiry arrives
   [ Save ]
 Change password  ·  Two-step sign-in
```

[Back to the table](#summary)

<a id="email-templates"></a>

### Email templates

**Status:** 🔄 In progress · **Priority:** Next · **Area:** Email and messaging

Editable templates for follow-ups, welcome-to-the-portal emails, password setup links and payout notices, with the customer's name and plan filled in.

**Needs from you:** Email set up (Gmail settings in Vercel), and approval of the wording.

**Outcome:** Built: Settings > Email templates edits the acknowledgement, alert and reset emails with a preview.

**Depends on:** [Send and receive email (Gmail now, Resend later)](#email-setup) (🔄 In progress)

**Layout** (a sketch, not a screenshot):

```text
Settings > Email templates
------------------------------------------------------------------
 Template [ Inquiry acknowledgement v ]
   Subject [ We received your inquiry (Ref {reference}) ]
   Body    [ Hello {name}, thank you for your inquiry ...  ]
   Placeholders: {name} {reference} {amount} {link} ...
   [ Save ]  [ Reset to default ]
 Preview (with example details)
   Subject: We received your inquiry (Ref A1B2C3D4)
   Hello Jane, ...
```

[Back to the table](#summary)

<a id="forgot-password"></a>

### Forgot password by email

**Status:** 🔄 In progress · **Priority:** Next · **Area:** Investor portal

Investors and staff reset their own password with an emailed link instead of asking an admin.

**Needs from you:** Email set up (Gmail settings in Vercel) before reset links can be sent.

**Outcome:** Built: Forgot password? on the admin and portal sign-in pages. Emails start once email is set up.

**Depends on:** [Send and receive email (Gmail now, Resend later)](#email-setup) (🔄 In progress)

**Layout** (a sketch, not a screenshot):

```text
Forgot password?                       (admin and investor versions)
------------------------------------------------------------------
 Username or email [ ................ ]   [ Send link ]
 "If an account matches, we have emailed a link."   (always the same
  message, so nobody can find out which accounts exist)
```

[Back to the table](#summary)

<a id="payout-reminders"></a>

### Payout notices to investors

**Status:** 🔄 In progress · **Priority:** Later · **Area:** Email and messaging

Email investors a few days before each payout, and confirm when it has been paid.

**Needs from you:** Email set up (Gmail settings in Vercel), and a CRON_SECRET added in Vercel for the daily job.

**Outcome:** Built: a daily reminder before each payout and a confirmation when a payout is recorded, with templates and an opt-out in the portal.

**Depends on:** [Send and receive email (Gmail now, Resend later)](#email-setup) (🔄 In progress), [Record actual payouts](#record-payments) (✅ Done)

**Layout** (a sketch, not a screenshot):

```text
Settings > Email > Payout emails to investors
------------------------------------------------------------------
 Remind investors [ 3 ] days before a payout   (0 = off)   [ Save ]
 Daily job        13:00 UTC · CRON_SECRET: Set
 Last run         Oct 27, 13:00 · daily · 4 reminders sent, 0 failed
 [ Run now ]

 Portal:  Payout emails [ On / Off ]   (investor can opt out)
 Record payout dialog:  [x] Email the investor a payment confirmation
```

[Back to the table](#summary)

## Pending

<a id="company-domain"></a>

### Company domain

**Status:** ⏳ Pending · **Priority:** Now · **Area:** Email and messaging

Buy a domain (about $11 a year) for the website and email, verify it in Resend, and point the site at it.

**Needs from you:** Buy the domain (about $11 a year) and add the DNS records it needs.

**Outcome:** Customers see a company web address and get emails from it, which reads as more trustworthy.

**Needs:**

- The domain name to buy
- DNS records from Resend for sending and receiving

[Back to the table](#summary)

<a id="remove-permanent-delete"></a>

### Remove permanent delete before go-live

**Status:** ⏳ Pending · **Priority:** Now · **Area:** Security and compliance

The temporary Delete permanently button for inquiries is removed once the app is ready.

**Needs from you:** Your go-ahead at go-live, after the test data is cleaned up.

[Back to the table](#summary)

<a id="privacy"></a>

### Privacy notice and data requests

**Status:** ⏳ Pending · **Priority:** Next · **Area:** Security and compliance

A privacy notice on the inquiry form, consent checkbox, retention periods, and a way to handle deletion requests.

**Needs from you:** The privacy notice wording, ideally checked by a lawyer.

[Back to the table](#summary)

<a id="automated-tests"></a>

### Automated tests and checks

**Status:** ⏳ Pending · **Priority:** Next · **Area:** Security and compliance

Tests for sign-in, roles, conversion and the portal, run automatically before each deployment.

**Needs from you:** Your go-ahead to add and run tests.

[Back to the table](#summary)

<a id="custom-domain"></a>

### Your own web address

**Status:** ⏳ Pending · **Priority:** Next · **Area:** Platform and experience

Use your company domain (for example invest.yourcompany.com) instead of the vercel.app address.

**Needs from you:** The domain (see Company domain) and access to its DNS settings.

**Needs:**

- A domain you own
- Adding two DNS records

[Back to the table](#summary)

<a id="branding"></a>

### Company branding

**Status:** ⏳ Pending · **Priority:** Next · **Area:** Platform and experience

Your logo, colours and contact details across the calculator, portal, emails and seminar materials.

**Needs from you:** Your logo, colours and contact details.

[Back to the table](#summary)

<a id="sms-whatsapp"></a>

### SMS and WhatsApp messages

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Email and messaging

Optional text or WhatsApp messages for acknowledgements and payout notices.

**Needs from you:** A messaging provider account (for example Twilio) and its keys, and customer consent.

**Needs:**

- A messaging provider account (for example Twilio or WhatsApp Business)
- Customer consent to receive messages

[Back to the table](#summary)

<a id="monthly-payouts"></a>

### Monthly payout term

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Payouts and operations

Add Monthly alongside Quarterly, Half-Yearly and Yearly, with its own rate.

**Needs from you:** Confirm Monthly should be offered, and the monthly rate.

[Back to the table](#summary)

<a id="holiday-calendar"></a>

### Bank holiday calendar

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Payouts and operations

Skip public holidays when counting business days, and optionally move payouts that land on weekends or holidays.

**Needs from you:** Which country's public holidays to skip (for example US federal holidays).

[Back to the table](#summary)

<a id="kyc"></a>

### Identity checks (KYC)

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Security and compliance

Collect and verify investor identity documents before an investment is confirmed.

**Needs from you:** An identity verification provider account, and advice on the rules that apply.

**Needs:**

- Advice on the rules that apply to your business
- An identity verification provider

[Back to the table](#summary)

<a id="e-signature"></a>

### E-signature of agreements

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Security and compliance

Send the investment agreement for electronic signature and store the signed copy in the document vault.

**Needs from you:** An e-signature provider account (for example DocuSign or Dropbox Sign) and its keys.

**Depends on:** [Document vault](#documents) (✅ Done)

[Back to the table](#summary)

<a id="web-analytics"></a>

### Visitor analytics

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Reports and insights

Privacy-friendly visit counts for the calculator page (Vercel Web Analytics has a free tier).

**Needs from you:** Turn on Web Analytics in the Vercel project.

[Back to the table](#summary)

<a id="languages"></a>

### More languages

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Platform and experience

Show the calculator and portal in other languages, with local number and date formats.

**Needs from you:** Which languages, and someone to check the translations.

[Back to the table](#summary)

<a id="accessibility-review"></a>

### Accessibility review

**Status:** ⏳ Pending · **Priority:** Later · **Area:** Platform and experience

A full check against WCAG 2.2 AA with screen readers and keyboard-only use.

**Needs from you:** Your go-ahead for browser checks.

[Back to the table](#summary)

## Done

<a id="inquiry-notifications"></a>

### New inquiry notifications

**Status:** ✅ Done · **Priority:** Now · **Area:** Sales and inquiries

A bell in the admin header counts the new inquiries an admin has not opened yet. Master and Sales Admins each have their own counter: opening an inquiry (or Mark all as read) lowers only that admin's count. The Inquiries list marks unread ones and has an Unread filter.

**Outcome:** Every admin sees at a glance how many new inquiries are waiting for them, without needing email.

**Layout** (a sketch, not a screenshot):

```text
Investment Payout Calculator: Admin        (bell) 3   (gear)  View calculator
------------------------------------------------------------------
 The bell shows how many new inquiries YOU have not opened yet.
 Each admin has their own number: Ashwin 3, Suresh 2, and so on.
 Select it to see them:  Inquiries > Unread

 [ Unread (3) ] [ Assigned to me ] [ Follow-ups due ]  [ Mark all as read (3) ]

 Priya Sharma  [UNREAD] [NEW]          <- opening the inquiry marks it read
 Received Oct 27, 2026 · Ref A1B2C3D4        for you only: the bell drops to 2
 Daniel Brooks  [UNREAD] [NEW]
 Robert Chen  [CONTACTED]               <- already read, no badge
```

[Back to the table](#summary)

<a id="visitor-inquiries"></a>

### Inquiries from the calculator

**Status:** ✅ Done · **Priority:** Now · **Area:** Sales and inquiries

Visitors send an inquiry with their plan, name, email, phone and a message. Spam protection: a hidden honeypot field and at most 5 inquiries per client per hour.

**Outcome:** Admins see every inquiry on the Inquiries page (the admin home), newest first.

**Layout** (a sketch, not a screenshot):

```text
Send inquiry                                                  [x]
------------------------------------------------------------------
 Your plan: $100,000 · 2 years · Yearly · Interest Only
 Name     [                          ]
 Email    [                          ]
 Phone    [                          ]   (optional)
 Message  [                          ]   (optional)
 [ Send inquiry ]

 After sending:  "Thank you. Your reference is A1B2C3D4.
                  We have also emailed you a confirmation."
```

[Back to the table](#summary)

<a id="inquiry-statuses"></a>

### Inquiry statuses, delete and restore

**Status:** ✅ Done · **Priority:** Now · **Area:** Sales and inquiries

New, Contacted and Converted statuses. Mark as contacted asks for a note (call, meeting or note). Delete moves an inquiry to Deleted inquiries, where a Master Admin can restore it.

**Layout** (a sketch, not a screenshot):

```text
Inquiries                       Pipeline board   Deleted inquiries (2)
------------------------------------------------------------------
 Priya Sharma  [NEW] [Customer replied]
 Received Oct 27, 2026 · Ref A1B2C3D4
 [ Notes and activity (1) · Emails (2) ] [ Mark as contacted ] [ Delete ]
 priya@example.com   +1 (555) 010-1001
 "Is the rate fixed for the whole term?"
 Investment amount | Planned date | Term locked | Payout term | ...

 Mark as contacted opens:
   +--------------------------------------------------+
   | Mark Priya Sharma as contacted                   |
   | Type  (o) Call  ( ) Meeting  ( ) Note            |
   | Notes [ Called, interested in quarterly...    ]  |
   |                   [ Cancel ] [ Save and mark contacted ]
   +--------------------------------------------------+
 A contacted inquiry shows [ Convert to investor ] and [ Mark as new ].
```

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

**Layout** (a sketch, not a screenshot):

```text
Hello, James Wilson                [ Your details ] [ Change password ]
                                   [ Sign-in security ]
------------------------------------------------------------------
 Investment 1                                  [ Download statement ]
   Amount $120,000 · Term locked 5 years · Yearly · Interest Only
   Planned date | Interest starts | Total interest | Total payout
   Next payout: Nov 3, 2027 · $12,000.00

   #   Payout date    Payout        Status
   1   2027-11-03     $12,000.00    Upcoming
   2   2028-11-03     $12,000.00    Upcoming

 Your documents
   Agreement 2026-10-10 (PDF)                       [ Download ]
 Payout emails      [ On ]
 (the interest rate is never shown)
```

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

**Layout** (a sketch, not a screenshot):

```text
Investment Payout Calculator                    [ Investor login ]
------------------------------------------------------------------
 Investment amount        [ $100,000          v ]
 Planned investment date  [ 2026-11-02          ]
 Term locked              [ 2 years           v ]
 Payout term              [ Yearly            v ]
 Payout type              (o) Interest Only  ( ) Interest and Principal

 [ Calculate Payout ]  [ Reset ]
------------------------------------------------------------------
 Your payout schedule                         [ Download Excel ]
  #   Payout date    Interest     Principal    Payout      Left
  1   2027-11-03     $10,000.00   $0.00        $10,000.00  $100,000
  2   2028-11-03     $10,000.00   $100,000.00  $110,000.00 $0
  Totals             $20,000.00   $100,000.00  $120,000.00
------------------------------------------------------------------
 Compare: longer payout terms, and the other payout type
 [ Send inquiry ]                       Disclaimer text
 (No interest rate is shown anywhere on this page.)
```

[Back to the table](#summary)

<a id="rates-management"></a>

### Interest rates managed by Master Admins

**Status:** ✅ Done · **Priority:** Now · **Area:** Payouts and operations

One rate per payout term, never sent to visitors or investors. Editing needs the admin's own password, locks again after saving or 10 minutes, and keeps the last 20 saves.

**Layout** (a sketch, not a screenshot):

```text
Settings > Interest rates
------------------------------------------------------------------
 Quarterly     ****        Rates are locked.
 Half-Yearly   ****        [ Unlock to edit ]  (needs your own password)
 Yearly        ****
 After unlocking:  [ 8.0 ] [ 9.0 ] [ 10.0 ]  [ Save rates ]  [ Lock ]
 Locks again after saving or 10 minutes.
 History (last 20 saves)
```

[Back to the table](#summary)

<a id="admin-roles"></a>

### Employees and roles

**Status:** ✅ Done · **Priority:** Now · **Area:** Security and compliance

Named employees with Master Admin and Sales Admin roles, temporary passwords and setup links, and a sign-in rate limit. Sales Admins never see interest rates.

**Layout** (a sketch, not a screenshot):

```text
Settings > Employees
------------------------------------------------------------------
 Ashwin Patel · apatel · [MASTER ADMIN] · email on · two-step on
   [ Change role ] [ Disable ] [ Temporary password ] [ Setup link ]
   [ Set email ] [ Reset two-step ]
 Suresh Bhandari · sbhandari · [SALES ADMIN] · alerts on
 Add user:  Name [ ] Username [ ] Role [ Sales Admin v ]  [ Add ]
```

[Back to the table](#summary)

<a id="audit-log"></a>

### Audit log

**Status:** ✅ Done · **Priority:** Now · **Area:** Security and compliance

Who did what and when: sign-ins, password changes, inquiries, investors, employees, rates and emails, by month and category. Events about an inquiry also show on that inquiry.

**Layout** (a sketch, not a screenshot):

```text
Settings > Audit log
------------------------------------------------------------------
 Month [ 2026-10 v ]  Category [ All v ]
 Export  From [ 2026-10-01 ] To [ 2026-10-31 ]  [ Export to Excel ]
 Sign-in alerts (last 30 days)
   5 failed sign-ins for apatel within 15 minutes
 Oct 27, 13:30  Suresh Bhandari [Sales Admin]  Inquiries
   Marked inquiry DE300004 (Robert Chen) as contacted     -> inquiry page
```

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

<a id="assign-inquiries"></a>

### Assign inquiries and follow-up dates

**Status:** ✅ Done · **Priority:** Next · **Area:** Sales and inquiries

Assign each inquiry to a Sales Admin, set a follow-up date, and show each person their own list of today's follow-ups.

**Outcome:** Each inquiry can be assigned to a team member with a follow-up date; the list highlights overdue and today's follow-ups and filters on Assigned to me and Follow-ups due.

**Layout** (a sketch, not a screenshot):

```text
Inquiries
------------------------------------------------------------------
 [ Assigned to me ] [ Follow-ups due ]      (combine with the filters)

 Robert Chen  [CONTACTED]
 Assigned to Suresh Bhandari · Follow-up Nov 6 [blue: upcoming]
                                              [red: overdue]
                                              [amber: today]
 Latest call · Suresh Bhandari · Oct 23
 "Spoke for 15 minutes. Wants half-yearly payouts..."
```

[Back to the table](#summary)

<a id="inquiry-notes"></a>

### Notes and call log on inquiries

**Status:** ✅ Done · **Priority:** Next · **Area:** Sales and inquiries

Add notes, calls and meetings to an inquiry, shown as a timeline with who added each entry, together with every audit event about the inquiry. The Inquiries list shows each inquiry's latest note.

**Layout** (a sketch, not a screenshot):

```text
Admin > Inquiries > Ref DE300004
Inquiry from Robert Chen
------------------------------------------------------------------
 (inquiry card, as on the list)

 Assignment and follow-up
   Assigned to [ Suresh Bhandari (you) v ]  Follow-up [ 2026-11-06 ]
   [ Save ]

 Notes and activity
   Type  (o) Note  ( ) Call  ( ) Meeting
   Details [ ........................................ ]
   [ Add to inquiry ]

   NOTE   Suresh Bhandari (Sales Admin)              Oct 26, 09:05
          Follow up on Friday.
   MEETING Ashwin Patel (Master Admin)               Oct 25, 16:05
          Met at the office with his wife. ...
   INQUIRIES · Suresh Bhandari                       Oct 23, 13:30
          Marked inquiry DE300004 (Robert Chen) as contacted
   INQUIRIES · Robert Chen (visitor)                 Oct 22, 10:07
          Inquiry DE300004 received from Robert Chen ($75,000)

 Emails
   [ Check for replies ]   thread, then the "Email the customer" form
```

[Back to the table](#summary)

<a id="lead-source"></a>

### Lead source and seminar tracking

**Status:** ✅ Done · **Priority:** Next · **Area:** Sales and inquiries

Record where each inquiry came from (seminar, website, referral) using links or QR codes, so you can see which seminars bring investors.

**Outcome:** Calculator links with ?source= tag inquiries; Settings > Lead sources shows inquiries and conversions per source and builds tracking links with QR codes.

**Layout** (a sketch, not a screenshot):

```text
Settings > Lead sources
------------------------------------------------------------------
 New source
   Name [ Seminar Nov 2026 ]  ->  link:
   https://<site>/inquiries?source=seminar-nov-2026    [ Copy ]
   [QR code]  [ Download QR code (SVG) ]

 Sources
   Source               Inquiries  Converted  Conversion
   website                  12         3         25%
   seminar-2026-10           4         1         25%     [ View inquiries ]
     link  https://<site>/inquiries?source=seminar-2026-10  [ Copy ] [QR]
```

[Back to the table](#summary)

<a id="search-export"></a>

### Search, filters and export

**Status:** ✅ Done · **Priority:** Next · **Area:** Sales and inquiries

Search inquiries and investors by name, email or reference, filter by status and date, and export to Excel.

**Outcome:** Inquiries: search, status, source and date filters and Excel export. Investors: search by name, email, phone or username.

**Layout** (a sketch, not a screenshot):

```text
Inquiries
------------------------------------------------------------------
 [ Search by name, email, phone or reference        ] [ Search ]
 Received from [ 2026-10-01 ] to [ 2026-10-31 ]  Source [ All v ]
 [ Open (5) ] [ New (3) ] [ Contacted (2) ] [ Converted (2) ] [ All (7) ]
    ^ default: converted inquiries are hidden
                                         [ Export to Excel (5) ]
 (cards...)

Investors
 [ Search by name, email, phone or username ] [ Search ]
```

[Back to the table](#summary)

<a id="statements"></a>

### Statements and downloads

**Status:** ✅ Done · **Priority:** Next · **Area:** Investor portal

Investors download a statement for each investment (PDF and Excel) with the schedule and payments made.

**Outcome:** Investors and admins download an Excel statement per investment (no rate for investors). PDF is not included yet.

[Back to the table](#summary)

<a id="record-payments"></a>

### Record actual payouts

**Status:** ✅ Done · **Priority:** Next · **Area:** Payouts and operations

Mark each scheduled payout as paid (date, amount, reference), so the portal shows real payments instead of scheduled dates.

**Outcome:** Master Admins mark each scheduled payout as paid (date, amount, reference); the portal shows Paid, Due or Upcoming.

**Layout** (a sketch, not a screenshot):

```text
Admin > Investors > James Wilson
------------------------------------------------------------------
 Investment 1 · $120,000 · 5 years · Yearly · Interest Only
   #   Scheduled      Amount        Status
   1   2027-11-03     $12,000.00    Paid Nov 3 · TRX-1234  [ Edit payment ]
   2   2028-11-03     $12,000.00    Due                    [ Mark as paid ]
   3   2029-11-03     $12,000.00    Upcoming               [ Mark as paid ]
   [ Download statement ]  [ Add investment ]  [ Renew ]*   *when matured

 Mark as paid opens:
   Date paid [ 2028-11-03 ]  Amount [ $12,000.00 ]  Reference [ ......... ]
   [x] Email the investor a payment confirmation
   [ Cancel ] [ Remove payment ] [ Save ]
```

[Back to the table](#summary)

<a id="payout-calendar"></a>

### Payout calendar

**Status:** ✅ Done · **Priority:** Next · **Area:** Payouts and operations

One view of all upcoming payouts across investors, with totals per week and month for cash planning.

**Outcome:** /admin/payouts lists due payouts first, then any range by week or month with totals.

**Layout** (a sketch, not a screenshot):

```text
Payout calendar
------------------------------------------------------------------
 From [ 2026-10-27 ]  To [ 2027-01-25 ]  Group by [ Week v ]  [ Show ]

 DUE, NOT YET RECORDED   UPCOMING IN THIS RANGE   PAID IN THIS RANGE
     2 · $24,000               5 · $61,000              1 · $12,000

 Due, not yet recorded                       (oldest first, any date)
   Date        Investor        Investment             Amount    Status
   2026-10-20  Kavita Rao      #1: $60,000, 3 of 12   $1,200    Due

 Week of Nov 2, 2026                  3 payouts · $18,000 scheduled
   Date        Investor        Investment             Amount    Status
```

[Back to the table](#summary)

<a id="two-factor"></a>

### Two-step sign-in

**Status:** ✅ Done · **Priority:** Next · **Area:** Security and compliance

Optional authenticator-app codes for staff and investors, required for Master Admins.

**Outcome:** Admins and investors can add authenticator-app codes with 10 recovery codes; Master Admins must set it up at their next sign-in. A Master Admin can reset it for someone who lost their phone.

**Layout** (a sketch, not a screenshot):

```text
Sign-in, second step                     Setting it up (My account)
-----------------------------------   --------------------------------
 Enter the 6-digit code from your     Two-step sign-in is off
 authenticator app                    [ Set up ]
   Code [ 123456 ]  [ Verify ]
   Lost your phone? Use a            1. Scan the QR code  [QR]
   recovery code                        or type the key  ABCD EFGH ...
                                     2. Enter a code [ ...... ] [ Turn on ]
 Master Admins who have not set       3. Save your 10 recovery codes
 it up are sent to the setup          [ Copy ] [ Download ]  (shown once)
 screen after signing in.
```

[Back to the table](#summary)

<a id="dashboard"></a>

### Dashboard

**Status:** ✅ Done · **Priority:** Next · **Area:** Reports and insights

Inquiries per week, conversion rate, total invested, and upcoming payouts owed, on the admin home page.

**Outcome:** /admin/dashboard: inquiries per week, statuses and conversion rate; Master Admins also see money totals, payouts due and sign-in alerts.

**Layout** (a sketch, not a screenshot):

```text
Dashboard
------------------------------------------------------------------
 Inquiries per week (last 8 weeks)
   ##
   ## ##    ##
   ## ## ## ## ## ##  ## ##        (bar chart, with a table for
   W1 W2 W3 W4 W5 W6  W7 W8         screen readers)

 INQUIRIES  NEW  CONTACTED  CONVERTED  DELETED*  CONVERSION RATE
    7        3      2          2          2          29%

 Master Admins also see:
 TOTAL INVESTED   INVESTORS   PAYOUTS, NEXT 30 DAYS   NEXT 90 DAYS
 Sign-in alerts   (failed sign-ins, sign-ins from a new device)

 Sales Admins see the inquiry figures only (no money, no alerts).
```

[Back to the table](#summary)

<a id="pipeline-board"></a>

### Pipeline board

**Status:** ✅ Done · **Priority:** Later · **Area:** Sales and inquiries

A board view of inquiries by stage (New, Contacted, Meeting booked, Converted) with drag and drop.

**Outcome:** Inquiries > Pipeline board shows New, Contacted and Converted columns with the usual actions (buttons, no drag and drop).

**Layout** (a sketch, not a screenshot):

```text
Pipeline board                                  Back to inquiries
------------------------------------------------------------------
 NEW (3)            CONTACTED (2)        CONVERTED (2)
 +--------------+   +--------------+     +--------------+
 | Priya Sharma |   | Robert Chen  |     | James Wilson |
 | $50,000      |   | $75,000      |     | $120,000     |
 | [Mark as     |   | [Convert]    |     | [View        |
 |  contacted]  |   | [Mark as new]|     |  investor]   |
 +--------------+   +--------------+     +--------------+
 (same search and filters as the list; buttons, no drag and drop)
```

[Back to the table](#summary)

<a id="documents"></a>

### Document vault

**Status:** ✅ Done · **Priority:** Later · **Area:** Investor portal

Share agreements, certificates and tax documents with each investor securely in the portal.

**Outcome:** Master Admins upload PDF, JPEG or PNG files (up to 10 MB) on the investor's page; investors download their own under Your documents in the portal.

**Layout** (a sketch, not a screenshot):

```text
Admin > Investors > James Wilson > Documents      Portal > Your documents
-----------------------------------------   ---------------------------
 Title [ Agreement        ]                  Agreement (PDF)
 Type  [ Agreement v ]                         Oct 10, 2026 [ Download ]
 File  [ Choose file... ] PDF, JPEG, PNG,     Tax document (PDF)
       up to 10 MB       [ Upload ]            Oct 12, 2026 [ Download ]
 Agreement  Oct 10  PDF  [Download][Delete]
 Tax doc    Oct 12  PDF  [Download][Delete]
```

[Back to the table](#summary)

<a id="multiple-investments"></a>

### More investments and renewals

**Status:** ✅ Done · **Priority:** Later · **Area:** Investor portal

Add further investments for an existing investor, and offer renewal at maturity with the current rates.

**Outcome:** Add another investment to an investor, or renew a matured one from its maturity date at the current rate.

[Back to the table](#summary)

<a id="profile-requests"></a>

### Profile and bank detail updates

**Status:** ✅ Done · **Priority:** Later · **Area:** Investor portal

Investors request changes to their contact or bank details; a Master Admin approves them.

**Outcome:** Investors ask for contact or bank detail changes at /portal/details; a Master Admin approves or rejects them. Bank details are encrypted and shown masked.

**Layout** (a sketch, not a screenshot):

```text
Portal > Your details                  Admin > Investor page
-----------------------------------   --------------------------------
 Contact                                Bank details and change requests
   Email  jwilson@example.com             Account ****1234  [ Show ]
   Phone  +1 (555) 010-1006               Waiting for your review
   [ Request a change ]                     Bank change: new account ****9876
 Bank details                               [ Approve and apply ] [ Reject ]
   Account holder · Bank · ****1234         Reason (optional) [ ........ ]
   [ Request a change ]
 Your requests                           Investors > Change requests
   Bank · Pending · [ Withdraw ]          (all pending + recent decisions)
   Phone · Approved Oct 12
```

[Back to the table](#summary)

<a id="configurable-products"></a>

### Amounts and terms in settings

**Status:** ✅ Done · **Priority:** Later · **Area:** Payouts and operations

Let Master Admins change the investment amounts and terms on a settings page instead of in the code.

**Outcome:** Settings > Amounts and terms sets the amounts, terms and payout terms on offer and the calculator defaults, with a change history.

**Layout** (a sketch, not a screenshot):

```text
Settings > Amounts and terms
------------------------------------------------------------------
 Investment amounts (one per line)      Terms offered
   [ 25000        ]                       [x] 1 year  [x] 2 years  [ ] 3 ...
   [ 50000        ]                     Payout terms offered
   [ 100000       ]                       [x] Quarterly [x] Half-Yearly [x] Yearly
 Will be offered: $25,000, $50,000, $100,000
 Defaults   Amount [ $100,000 v ]  Term [ 2 years v ]  Payout [ Yearly v ]
 [ Save ]       Last saved Oct 27, 2026 by Ashwin Patel
 Change history (last 20 saves)
```

[Back to the table](#summary)

<a id="sign-in-alerts"></a>

### Sign-in alerts

**Status:** ✅ Done · **Priority:** Later · **Area:** Security and compliance

Warn Master Admins about repeated failed sign-ins or sign-ins from new places, using the audit log.

**Outcome:** Repeated failed sign-ins and admin sign-ins from a new device or network show on the dashboard and audit log. Emailing them can follow once email is set up.

[Back to the table](#summary)

<a id="audit-export"></a>

### Audit log export

**Status:** ✅ Done · **Priority:** Later · **Area:** Reports and insights

Download the audit log for a date range as Excel.

**Outcome:** Settings > Audit log exports any date range (up to a year) to Excel.

[Back to the table](#summary)

<a id="installable-app"></a>

### Install on phones

**Status:** ✅ Done · **Priority:** Later · **Area:** Platform and experience

Let investors add the portal to their phone's home screen and open it like an app.

**Outcome:** The investor portal can be added to a phone's home screen and opens like an app.

[Back to the table](#summary)
