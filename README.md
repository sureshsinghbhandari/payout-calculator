# Investment Payout Calculator

A public web calculator that shows the payout schedule for a fixed-term investment.
Visitors pick an investment amount from a list, a planned investment date, a term, a
payout term and a payout type. They get a payout-by-payout table with totals,
comparisons with other scenarios, an Excel download, and can send an inquiry.

Behind it is an admin area with named users and roles (Master Admin, Sales Admin) for
managing inquiries, investors and the interest rates, and an investor portal where
investors sign in to see their investments.

| Who | Address |
| --- | --- |
| Visitors: calculator and inquiries | https://payout-calculator-steel.vercel.app/inquiries |
| Investors: sign in | https://payout-calculator-steel.vercel.app/portal |
| Staff: admin | https://payout-calculator-steel.vercel.app/admin |

The site root (`/`) intentionally shows a friendly "page not found" (404). The old
`/investor` address redirects to `/portal`.

Interest rates are never shown to visitors or investors.

## Tech stack

- Next.js (App Router, Cache Components) with TypeScript
- Tailwind CSS
- Server Actions for the calculation and the admin page
- Vercel Blob (private store) for the interest rates
- ExcelJS for the Excel download, loaded only when the button is clicked
- Vitest for tests
- Vercel for hosting

## Project layout

| Path | Purpose |
| --- | --- |
| `src/lib/config.ts` | Defaults: starting rates, amounts, terms, form defaults, business-day offset |
| `src/lib/payout.ts` | Calculation engine, investment-date and rate validation |
| `src/lib/dates.ts` | Date helpers and business days (Monday to Friday) |
| `src/lib/scenarios.ts` | Comparison scenarios, and removing rates from results |
| `src/lib/rates.ts` | Rate table validation and the stored rates format |
| `src/lib/quote.ts` | Server-side validation of calculation requests |
| `src/lib/excel.ts` | Excel workbook export |
| `src/lib/disclaimer.ts` | Disclaimer text |
| `src/lib/server/rates-store.ts` | Reads and saves rates in Vercel Blob (server only) |
| `src/lib/server/session.ts`, `admin-auth.ts` | Admin password check and session cookie (server only) |
| `src/app/actions.ts` | Public Server Action that calculates a quote |
| `src/app/admin/` | Admin page and its Server Actions |
| `src/components/` | Calculator form, results, comparisons, admin forms |
| `src/lib/*.test.ts` | Automated tests |

## How it works

- **Labels:** Investment amount (a list), Planned investment date, Term locked (1 or 2 years),
  Payout term (Quarterly, Half-Yearly or Yearly) and Payout type.
- **Defaults:** $100,000, 2 years, Yearly payouts, Interest Only, invested today. Reset
  returns to these.
- **Planned investment date:** interest starts on the next business day after the
  planned investment date. Business days are Monday to Friday; public holidays are not taken into account.
  Payouts then fall every 3, 6 or 12 months, counted from the interest start date, and
  are not moved if they land on a weekend.
- **Rates:** each payout term has its own annual rate. The browser never receives
  the rates. When a visitor clicks Calculate Payout, the server reads the current rates,
  calculates the schedule and the comparison scenarios, and sends back only the results.
- **Scenario comparisons:** the results page and the Excel file compare the selection
  with longer payout terms (same payout type, each at its own rate) and with the other
  payout type (same frequency and rate). Quarterly compares Half-Yearly and Yearly;
  Half-Yearly compares Yearly; Yearly has no longer period.
- **Excel workbook sheets:** `Your Selection`, one `<Frequency> Payout` sheet per longer
  payout term, one sheet for the other payout type, and `Comparison`.

## Calculation rules

- Simple interest only. Interest is never compounded.
- Periods per year: Quarterly 4, Half-Yearly 2, Yearly 1.
- Total payouts = term in years x payouts per year.
- **Interest Only:** every payout is one period of interest on the original principal.
  The final payout adds the full principal. Total interest = principal x rate x years.
- **Interest and Principal:** principal is returned in equal installments. Each payout's
  interest = outstanding principal before that payout x rate / periods per year.
- Money is calculated in whole cents with integer math. Values are rounded half-up to
  the cent, and the final payout absorbs any rounding difference, so totals reconcile and
  the remaining principal ends at exactly $0.00.

## Times

Every time the app shows is **US Eastern Time**: EST in winter, EDT in summer, with the
label switching by itself (`src/lib/time.ts`). Stored timestamps stay in UTC. "Today"
(follow-ups, Due payouts, the payout calendar, the dashboard weeks) and the day an
inquiry was received (the received-date filter) also use Eastern Time. The Excel exports
of inquiries and of the audit log, and the audit export's date range, stay in UTC, and
their column headings say so. The audit log is stored in one file per UTC month.

## Admin users and roles

Admins sign in at `/admin` with a **username and password**.

| Role | Can do |
| --- | --- |
| **Master Admin** | Everything: inquiries (view, add notes, email the customer, mark contacted, delete and restore, convert to investor), Deleted inquiries, Investors, Interest rates, Employees, Email settings. |
| **Sales Admin** | Inquiries only: view them, add notes, email the customer, and mark them contacted or new. They do not see interest rates. |

Starting users (created automatically the first time the admin area is used):

| Name | Username | Role |
| --- | --- | --- |
| Ashwin Patel | `apatel` | Master Admin |
| Suresh Bhandari | `sbhandari` | Sales Admin |

### Passwords

Nobody's password is stored in the code or the README. People set their own:

- **First Master Admin (apatel):** the first time, sign in as `apatel` with the
  `ADMIN_PASSWORD` value from Vercel. You are asked to choose your own password straight
  away; after that, `ADMIN_PASSWORD` no longer works for sign-in.
- **Everyone else:** a Master Admin opens **Settings (gear) > Employees** and either
  - selects **Set temporary password** and types one (at least 12 characters). The
    person must choose their own password the first time they sign in, or
  - selects **Create setup link** and sends the one-time link (valid for 72 hours) to
    the person, who opens it and chooses a password.
- Anyone can change their own password under **Settings > My account**.
- Passwords are at least 12 characters and stored only as scrypt hashes. Changing a
  password signs out that person's other sessions.

### Two-step sign-in

Admins (**My account**) and investors (Investor portal > **Sign-in security**) can add a
code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password
and similar) as a second step after their password. It is currently **optional for every
role, including Master Admins** (`needsTwoStepSetup` in `src/lib/server/auth.ts` is the
one place that decides this, so making it required again later is a one-line change).
Setting it up shows a QR code and 10 one-time recovery codes; save them, because they are
shown only once. Lost your phone? Sign in with a recovery code, or ask a Master Admin to
reset two-step sign-in (Settings > Employees, or the investor's page). Password resets
never skip the second step for anyone who has it turned on.

### Managing users (Master Admin)

**Settings > Employees** (`/admin/settings/users`): add employees (name, username, role),
change roles, disable or enable users, set temporary passwords and create setup links.
There must always be at least one active Master Admin.

## Investors

1. When an inquiry is **Contacted**, a Master Admin selects **Convert to investor**.
2. The form is pre-filled from the inquiry (name, email, phone and the plan) and can be
   adjusted. The interest rate for the chosen payout term is fixed at that moment.
3. The investor is created with a username, and the inquiry is marked **Converted**.
4. On the investor's page (**Settings > Investors**), the Master Admin gives the investor
   a **temporary password** (the investor must change it at first sign-in) or a
   **setup link**. The Master Admin can reset an investor's password the same way at any
   time, edit contact details and username, and disable or enable their login.

### Investor portal

Investors sign in at `/portal` (the calculator page also has an **Investor login** button) with their username and password and see each
investment: amount, planned investment date, interest start date, term locked, payout
term and type, totals, the next payout, and the full payout schedule with each payout
marked Paid or Upcoming by its scheduled date. The interest rate is not shown.

## Amounts and terms (Master Admin)

**Settings > Amounts and terms** sets the investment amounts (whole dollars, up to
$10,000,000, at most 30), the terms (1 to 30 years) and the payout terms on offer, plus the
calculator's default amount, term and payout term. Until it is first saved, the values in
`src/lib/config.ts` are used. Changes apply straight away to the calculator, quotes,
inquiries, the convert and add-investment forms and the comparisons; existing investments
and inquiries keep their original values. The last 20 saves are kept, and every save is in
the audit log. Rates stay one per payout term, whatever the length of the term.

## Managing interest rates (Master Admin)

1. Sign in at `/admin`, open **Settings (gear) > Interest rates**
   (`/admin/settings/rates`).
2. The rates are shown locked. Select **Unlock to edit** and enter **your own password**.
3. Change the Quarterly, Half-Yearly and Yearly rates (0% to 100%, up to 4 decimal
   places) and select **Save rates**. Saving locks the rates again; editing also locks by
   itself after 10 minutes, or when you select **Lock**.
4. New calculations use the saved rates immediately. Existing investors keep the rate
   fixed when they were converted. The page keeps a history of the last 20 saves.

Until the first save, the starting rates in `src/lib/config.ts`
(`DEFAULT_RATE_BY_FREQUENCY`: Quarterly 8%, Half-Yearly 9%, Yearly 10%) are used.

## Inquiries

- After calculating, visitors can select **Send inquiry**. The form shows their plan and
  asks for name, email, an optional phone number and an optional message.
- Admins see them at `/admin/inquiries` (the admin home page), newest first. Statuses:
  New, Contacted, Converted, Deleted.
- **Search** by name, email, phone number (any part of the digits) or reference, and
  **filter** by status: Open (new and contacted, the default, so converted ones are
  hidden), New, Contacted, Converted or All.
- **Mark as contacted** asks for a note first: the type (call, meeting or note) and what
  was said. The note is required and is saved on the inquiry's activity, next to the status
  change. (Emailing the customer from the inquiry's page also marks it contacted; the email
  is the record there.)
- Delete (Master Admin) is a soft delete: the inquiry keeps its data, gets the status
  "deleted" and moves to **Deleted inquiries** (`/admin/inquiries/deleted`), where it
  can be restored.
- **Meetings booked in a call:** in a note, or in **Mark as contacted**, tick **A meeting was
  scheduled** and pick the date and time in your own time zone. The inquiry then shows the
  meeting with its date and time in Eastern Time (and in the time zone it was entered in, if
  that is different), in green while it
  is still to come and grey afterwards, and the note shows it in the activity. The
  Inquiries list has a **Meeting scheduled** filter. **Cancel meeting** (on the inquiry's
  page) removes it and adds a note about the cancellation. A newly booked meeting replaces
  the earlier one.
- **New inquiry notifications:** a bell in the admin header shows how many new inquiries
  you have not opened yet. Master and Sales Admins each have their own counter, so one
  person opening an inquiry never changes another person's count. Opening an inquiry
  (or **Mark all as read**) lowers your count; deleting an inquiry removes it from
  everyone's. Unread inquiries carry an **Unread** badge on the Inquiries list, and the
  **Unread** filter shows only those.
- Spam protection: a hidden honeypot field, and at most 5 inquiries per client per hour.
- Each inquiry has its own page (**Notes and activity** button) with:
  - **Notes and activity:** Master and Sales Admins add notes, calls and meetings, each
    with who added it and when. Every audit event about the inquiry (received, status
    changes, delete and restore, conversion, emails) appears there too, one row each,
    newest first. Notes stay on their inquiry only; they are not in the audit log. The
    Inquiries list shows each inquiry's latest note.
  - The email conversation. See [Email](#email).

### Assign, follow up, sources and export

- **Assign and follow up:** on an inquiry's page, assign it to a team member and set a
  follow-up date. The Inquiries list shows who has it and highlights follow-ups that are
  overdue or due today; **Assigned to me** and **Follow-ups due** narrow the list.
- **Lead sources:** add `?source=seminar-2026-11` (or `utm_source`) to the calculator link
  and inquiries sent through it are tagged with that source. **Settings > Lead sources**
  (Master Admin) shows inquiries and conversions per source and builds tracking links with
  a QR code to copy or download.
- **Filters and export:** filter inquiries by source and date received, then select
  **Export to Excel** to download what is shown (rates only for Master Admins).
- **Pipeline board:** Inquiries > **Pipeline board** shows New, Contacted and Converted
  columns. Investors can be searched by name, email, phone or username.

## Payouts and investments

- **Record payouts:** on an investor's page, Master Admins mark each scheduled payout as
  paid with the date, amount and a reference (such as a bank transfer id), and can change
  or remove it. Investors see a payout as Paid once it is recorded, Due once its date
  arrives, and Upcoming before that.
- **Payout calendar:** `/admin/payouts` lists due payouts first, then the next 90 days
  (or any range) by week or month with totals.
- **More investments and renewals:** add another investment to an investor, or renew a
  matured one from its maturity date. The current rate is fixed on the new investment.
- **Statements:** investors (in the portal) and admins download an Excel statement per
  investment with the schedule and payments. The investor's copy never shows the rate.
- **Install on phones:** investors can add the Investor Portal to their home screen
  ("Add to Home Screen" on iPhone, "Install app" on Android).

- **Documents:** Master Admins upload PDF, JPEG or PNG files (up to 10 MB) on the
  investor's page; the browser sends them straight to private Blob storage and the app
  checks each file's real type. Investors download their own under **Your documents** in
  the portal. Uploads, deletions and downloads are in the audit log.
- **Your details:** at `/portal/details` investors ask for changes to their email, phone or
  bank details. Nothing changes until a Master Admin approves it, on the investor's page or
  under Investors > **Change requests** (`/admin/investors/requests`). Bank details are
  encrypted at rest and shown with only the last 4 digits; each **Show** is audited.
- **Payout emails:** investors with an email address get a reminder before each payout
  (Settings > Email: days before, default 3, 0 = off) and, when a payout is recorded with
  "Email the investor a payment confirmation" ticked, a confirmation. A daily Vercel Cron
  job (`vercel.json`, 13:00 UTC) calls `/api/cron/payout-notices`, which needs
  `CRON_SECRET`; a sent-log makes sure nothing is sent twice. Investors can switch these
  emails off in the portal; they never include the rate. Settings > Email shows the last
  run and has **Run now**.

## Dashboard

`/admin/dashboard`: inquiries per week for the last 8 weeks, counts by status and the
conversion rate. Master Admins also see total invested, the number of investors, payouts
due in the next 30 and 90 days, and sign-in alerts. Sales Admins see inquiry figures only.

## Audit log

Every action is recorded with who did it, what they did, the item it affected and the
time (Eastern Time): admin and investor sign-ins (including failed attempts), password changes,
inquiries received, status changes, deletes and restores, conversions, investor and user
changes, and interest rate unlocks and changes (with the old and new rates). Master
Admins see it under **Settings > Audit log** (`/admin/settings/audit`), by month and by
category. Emails sent and customer replies are recorded too. Events are
stored as one private file per month in Vercel Blob. Events about an inquiry are also
copied to that inquiry's own log (`inquiry-log/<env>/`), which holds its notes too and
is shown on the inquiry's page. Events from before inquiry logs existed are copied in
the first time an inquiry's page is opened.

- **Export:** on Settings > Audit log, choose a date range and select **Export to Excel**.
- **Sign-in alerts:** the dashboard and audit log flag 5 or more failed sign-ins for one
  username within 15 minutes, and admin sign-ins from a device or network not used in the
  previous 30 days. Only a short coded fingerprint is kept, never the IP address.

## Upcoming features

**Settings > Upcoming features** (`/admin/settings/upcoming`, Master Admin) lists planned
work by area with Now / Next / Later priorities, starting with email (Gmail now, Resend
later), a company domain, inquiry acknowledgements and customer replies, and what is
already done. The list lives in `src/lib/roadmap.ts`. The same list, as a table of done,
in-progress and pending features with linked details, is in
[docs/UPCOMING-FEATURES.md](docs/UPCOMING-FEATURES.md); after changing the list, rewrite it
with `npm run docs:features`.

## Email

The app sends and receives inquiry emails through one of two providers, chosen with the
`EMAIL_PROVIDER` setting:

| `EMAIL_PROVIDER` | When | Sends from | Customer replies |
| --- | --- | --- | --- |
| `gmail` | Now (no domain needed) | The Gmail address (`GMAIL_USER`) | Checked in the Gmail inbox when admins open inquiries, or with **Check for replies** |
| `resend` | Later, with a company domain (about $11 a year) | `EMAIL_FROM` on the company domain | Pushed instantly by a Resend webhook |

Switching is only a settings change and a redeploy; inquiry emails already stored stay where
they are.

- **Acknowledgement:** when an inquiry arrives, the visitor gets a thank-you email with
  their reference number and the plan they asked about (no interest rate). It is sent
  after the response, so the visitor never waits.
- **Staff replies:** on an inquiry's page (`/admin/inquiries/<id>`, the **Emails** button),
  Master and Sales Admins can email the customer. Sending marks a new inquiry as contacted.
- **Customer replies:** every email has a signed Reply-To that names the inquiry:
  `<gmail name>+<inquiry id>.<signature>@gmail.com` with Gmail (Gmail delivers it to the same
  inbox), or `reply+<inquiry id>.<signature>@<EMAIL_REPLY_DOMAIN>` with Resend. A reply is
  matched by that address, or by "Ref XXXXXXXX" in the subject, and shown on the inquiry
  with a **Customer replied** badge on the list.
- **Gmail privacy:** only messages sent to a reply address, or with an inquiry reference in
  the subject from that inquiry's customer, are downloaded. The rest of the inbox is never
  read or stored. A **new Gmail account just for the business** is still better than a
  personal one, because the app password gives full access to the mailbox.
- **Resend extras:** delivery, bounces and failures are shown on each email, and emails that
  match no inquiry are listed under **Settings > Email**.
- Emails are stored as one private file per inquiry in Vercel Blob (`emails/<env>/`), and
  bodies are always shown as plain text.

### Alerts, password resets and templates

These need email to be set up (Settings > Email); until then the pages say so.

- **New inquiry alerts:** admins add an email address (Settings > Employees, or My account for
  yourself) and switch on "Email me when a new inquiry arrives". The interest rate is never
  included.
- **Forgot password:** "Forgot password?" on the admin and investor sign-in pages emails a
  one-time link (valid 72 hours) to an active account with an email address. The page
  never reveals whether an account exists.
- **Email templates:** Master Admins change the wording of the inquiry acknowledgement,
  the new inquiry alert and the password reset email on **Settings > Email templates**,
  with placeholders, a preview and Reset to default.

### Setting up Gmail (now)

1. Use a Gmail account for the business. Turn on **2-Step Verification** for it
   (myaccount.google.com > Security).
2. Create an **app password**: myaccount.google.com/apppasswords, name it "Payout
   Calculator". Google shows 16 letters once.
3. In Vercel add `EMAIL_PROVIDER` = `gmail`, `GMAIL_USER` = the Gmail address, and
   `GMAIL_APP_PASSWORD` = the app password (`--sensitive`). Optionally add
   `EMAIL_SENDER_NAME`, the name customers see (for example your company name).
4. Redeploy, then open **Settings > Email**: Provider shows Gmail and both lines show On.
   Send yourself a test.

Gmail allows about 500 emails a day from a normal account.

### Switching to Resend (later)

1. Buy a domain, add it in Resend (resend.com/domains) and add the DNS records it shows.
2. In Vercel set `RESEND_API_KEY` (Full access), `EMAIL_FROM` (for example
   `inquiries@mail.<domain>`) and `EMAIL_REPLY_DOMAIN` (a receiving subdomain such as
   `reply.<domain>`).
3. In Resend add a webhook to `https://payout-calculator-steel.vercel.app/api/email/inbound`
   with the events `email.received`, `email.delivered`, `email.bounced`, `email.failed`
   and `email.complained`, and set its signing secret as `RESEND_WEBHOOK_SECRET`.
4. Change `EMAIL_PROVIDER` to `resend` and redeploy.

## Temporary: permanent delete

For now, Master Admins can **Delete permanently** an inquiry that is already in Deleted
inquiries (recorded in the audit log). This is marked TEMPORARY in the code
(`inquiries.purge` permission, `purgeInquiry`, `purgeInquiryAction`) and should be
removed before go-live.

## Seminar deck

`docs/Investment-Plans-Seminar.pptx` and `.pdf`: a 6-slide deck for investor
seminars. It covers how it works, one slide each for Quarterly, Half-Yearly and Yearly
payouts (what $25,000, $50,000 and $100,000 pay over 1 and 2 years, Interest Only), and a
closing slide with the inquiry address, a QR code and the disclaimer. Speaker notes are
included. Figures use the production rates at the time it was made (8%, 9%, 10%); the
rates themselves are not shown.

To rebuild after a rate change: edit `RATES` in `docs/build-deck.cjs`, run it with
Node (it needs the `pptxgenjs` and `qrcode` packages), then make the PDF with
PowerPoint: `powershell -File docs/export-pdf.ps1 -Pptx <pptx> -Pdf <pdf> -ImageDir <folder>`.

## Data storage

Everything is stored as private JSON files in the Vercel Blob store
`payout-calculator-rates`: interest rates, inquiries (one file each), admin users,
investors, emails, inquiry notes and activity, unread-inquiry notifications, and the audit log. Production, preview deployments and local
development use separate folders, so testing never touches live data.

## Demo data

`scripts/seed-demo.ts` adds demo data: 7 inquiries (3 new, 2 contacted, 2 converted), 2
deleted inquiries and 3 investors, with notes, calls, meetings and their activity. It needs
`BLOB_READ_WRITE_TOKEN` in `.env.local` (`npx vercel env pull .env.local`).

```bash
npm run seed:demo -- production
```

Use `local` or `preview` instead of `production` for those folders. Running it again
replaces the demo data; add `--remove` to remove it. It only touches its own records
(references `DE30000x`, investor ids `inv_demo…`, audit ids `demo-…`). Demo investors
have no password, so they cannot sign in to the portal.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `ADMIN_SESSION_SECRET` | Random value, at least 32 characters, that signs all sign-in sessions. Required. It also encrypts two-step sign-in secrets and investors' bank details: changing it means everyone sets up two-step sign-in again and investors send their bank details again. |
| `ADMIN_PASSWORD` | One-time bootstrap password for the first Master Admin (`apatel`), at least 12 characters. Not used once apatel has set a personal password. |
| `BLOB_READ_WRITE_TOKEN` | Access to the private Blob store. Added automatically when the store was connected. |
| `CRON_SECRET` | Random value, at least 16 characters, that Vercel Cron sends to the daily payout email job. Without it the job is refused. Secret. |
| `EMAIL_PROVIDER` | `gmail` or `resend`. Without it, Resend is used when set up, otherwise Gmail. Without either, no email is sent. |
| `EMAIL_SENDER_NAME` | Optional name customers see on emails and in the sign-off, e.g. `Acme Investments`. |
| `GMAIL_USER` | Gmail: the account address. |
| `GMAIL_APP_PASSWORD` | Gmail: an app password (needs 2-Step Verification). Secret. |
| `RESEND_API_KEY` | Resend: a "Full access" API key. Secret. |
| `EMAIL_FROM` | Resend: sender, e.g. `Acme Investments <inquiries@mail.acme.com>`. |
| `EMAIL_REPLY_DOMAIN` | Resend: domain that receives replies, e.g. `reply.acme.com`. |
| `RESEND_WEBHOOK_SECRET` | Resend: signing secret (`whsec_...`) of the webhook. Secret. |

Set a value with `npx vercel env add NAME production --sensitive` (you type the value),
then redeploy with `npx vercel deploy --prod`.

### Sign-in protection

- Sign-in, password changes and unlocking rates lock a client out for 15 minutes after
  5 wrong passwords (per server instance), with a 1-second wait after each wrong one.
- A Vercel Firewall rule, **Sign-in rate limit**, allows at most 20 POST requests per IP
  address per 5 minutes to `/admin` (admin sign-in), `/portal` (investor sign-in and
  password change) and `/setup` (setup links), counted together. An address that goes
  over is blocked from those requests for 15 minutes. Admin work on other pages (for
  example inquiries) does not count. The free (Hobby) plan allows one rate-limit rule,
  which is why the three pages share it. View or change it with
  `npx vercel firewall rules inspect "Sign-in rate limit"`, or in the Vercel dashboard
  under Firewall.
- Sessions are HTTP-only, SameSite=Strict, Secure cookies: `/admin` for admins and
  `/portal` for investors, valid for 8 hours.

For local development, put `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` in
`.env.development.local`, and run `npx vercel env pull .env.local` for the Blob token.
Both files are git-ignored.

## Local development

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Then open http://localhost:3000 (and http://localhost:3000/admin).

### Checks

```bash
npm run lint        # ESLint
npm run typecheck   # TypeScript
npm test            # Vitest tests
npm run build       # Production build
```

## Changing defaults

`src/lib/config.ts` holds the starting rates, the investment amount options, the default
amount, term, payout term and payout type, the accepted planned-investment-date
range, and `INTEREST_START_BUSINESS_DAYS` (how many business days after the investment
date interest starts). After a change, run the checks above and redeploy.

## Deploying updates

The site is hosted on Vercel as the `payout-calculator` project.

```bash
npx vercel login          # first time only
npx vercel deploy --prod
```

**Automatic deploys from GitHub:** connect the repository once in the Vercel dashboard
(Project Settings, then Git) or with `npx vercel git connect`. After that, every push to
`main` deploys to production.
