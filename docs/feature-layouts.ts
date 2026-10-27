/**
 * Text sketches of the screens, used by build-features.ts for
 * docs/UPCOMING-FEATURES.md. They show the layout (what is on the page and
 * where), not the exact wording, colours or spacing. Keys are roadmap ids.
 * Keep lines under about 72 characters so they read well in any viewer.
 */

export const APP_MAP = `Visitors
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
    Audit log                Upcoming features     My account`;

export const LAYOUTS: Record<string, string> = {
  "payout-calculator": `Investment Payout Calculator                    [ Investor login ]
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
 (No interest rate is shown anywhere on this page.)`,

  "visitor-inquiries": `Send inquiry                                                  [x]
------------------------------------------------------------------
 Your plan: $100,000 · 2 years · Yearly · Interest Only
 Name     [                          ]
 Email    [                          ]
 Phone    [                          ]   (optional)
 Message  [                          ]   (optional)
 [ Send inquiry ]

 After sending:  "Thank you. Your reference is A1B2C3D4.
                  We have also emailed you a confirmation."`,

  "inquiry-notifications": `Investment Payout Calculator: Admin        (bell) 3   (gear)  View calculator
------------------------------------------------------------------
 The bell shows how many new inquiries YOU have not opened yet.
 Each admin has their own number: Ashwin 3, Suresh 2, and so on.
 Select it to see them:  Inquiries > Unread

 [ Unread (3) ] [ Assigned to me ] [ Follow-ups due ]  [ Mark all as read (3) ]

 Priya Sharma  [UNREAD] [NEW]          <- opening the inquiry marks it read
 Received Oct 27, 2026 · Ref A1B2C3D4        for you only: the bell drops to 2
 Daniel Brooks  [UNREAD] [NEW]
 Robert Chen  [CONTACTED]               <- already read, no badge`,

  "inquiry-statuses": `Inquiries                       Pipeline board   Deleted inquiries (2)
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
 A contacted inquiry shows [ Convert to investor ] and [ Mark as new ].`,

  "inquiry-notes": `Admin > Inquiries > Ref DE300004
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
   [ Check for replies ]   thread, then the "Email the customer" form`,

  "assign-inquiries": `Inquiries
------------------------------------------------------------------
 [ Assigned to me ] [ Follow-ups due ]      (combine with the filters)

 Robert Chen  [CONTACTED]
 Assigned to Suresh Bhandari · Follow-up Nov 6 [blue: upcoming]
                                              [red: overdue]
                                              [amber: today]
 Latest call · Suresh Bhandari · Oct 23
 "Spoke for 15 minutes. Wants half-yearly payouts..."`,

  "search-export": `Inquiries
------------------------------------------------------------------
 [ Search by name, email, phone or reference        ] [ Search ]
 Received from [ 2026-10-01 ] to [ 2026-10-31 ]  Source [ All v ]
 [ Open (5) ] [ New (3) ] [ Contacted (2) ] [ Converted (2) ] [ All (7) ]
    ^ default: converted inquiries are hidden
                                         [ Export to Excel (5) ]
 (cards...)

Investors
 [ Search by name, email, phone or username ] [ Search ]`,

  "pipeline-board": `Pipeline board                                  Back to inquiries
------------------------------------------------------------------
 NEW (3)            CONTACTED (2)        CONVERTED (2)
 +--------------+   +--------------+     +--------------+
 | Priya Sharma |   | Robert Chen  |     | James Wilson |
 | $50,000      |   | $75,000      |     | $120,000     |
 | [Mark as     |   | [Convert]    |     | [View        |
 |  contacted]  |   | [Mark as new]|     |  investor]   |
 +--------------+   +--------------+     +--------------+
 (same search and filters as the list; buttons, no drag and drop)`,

  "lead-source": `Settings > Lead sources
------------------------------------------------------------------
 New source
   Name [ Seminar Nov 2026 ]  ->  link:
   https://<site>/inquiries?source=seminar-nov-2026    [ Copy ]
   [QR code]  [ Download QR code (SVG) ]

 Sources
   Source               Inquiries  Converted  Conversion
   website                  12         3         25%
   seminar-2026-10           4         1         25%     [ View inquiries ]
     link  https://<site>/inquiries?source=seminar-2026-10  [ Copy ] [QR]`,

  "dashboard": `Dashboard
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

 Sales Admins see the inquiry figures only (no money, no alerts).`,

  "investor-portal": `Hello, James Wilson                [ Your details ] [ Change password ]
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
 (the interest rate is never shown)`,

  "record-payments": `Admin > Investors > James Wilson
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
   [ Cancel ] [ Remove payment ] [ Save ]`,

  "payout-calendar": `Payout calendar
------------------------------------------------------------------
 From [ 2026-10-27 ]  To [ 2027-01-25 ]  Group by [ Week v ]  [ Show ]

 DUE, NOT YET RECORDED   UPCOMING IN THIS RANGE   PAID IN THIS RANGE
     2 · $24,000               5 · $61,000              1 · $12,000

 Due, not yet recorded                       (oldest first, any date)
   Date        Investor        Investment             Amount    Status
   2026-10-20  Kavita Rao      #1: $60,000, 3 of 12   $1,200    Due

 Week of Nov 2, 2026                  3 payouts · $18,000 scheduled
   Date        Investor        Investment             Amount    Status`,

  "two-factor": `Sign-in, second step                     Setting it up (My account)
-----------------------------------   --------------------------------
 Enter the 6-digit code from your     Two-step sign-in is off
 authenticator app                    [ Set up ]
   Code [ 123456 ]  [ Verify ]
   Lost your phone? Use a            1. Scan the QR code  [QR]
   recovery code                        or type the key  ABCD EFGH ...
                                     2. Enter a code [ ...... ] [ Turn on ]
 Master Admins who have not set       3. Save your 10 recovery codes
 it up are sent to the setup          [ Copy ] [ Download ]  (shown once)
 screen after signing in.`,

  "documents": `Admin > Investors > James Wilson > Documents      Portal > Your documents
-----------------------------------------   ---------------------------
 Title [ Agreement        ]                  Agreement (PDF)
 Type  [ Agreement v ]                         Oct 10, 2026 [ Download ]
 File  [ Choose file... ] PDF, JPEG, PNG,     Tax document (PDF)
       up to 10 MB       [ Upload ]            Oct 12, 2026 [ Download ]
 Agreement  Oct 10  PDF  [Download][Delete]
 Tax doc    Oct 12  PDF  [Download][Delete]`,

  "profile-requests": `Portal > Your details                  Admin > Investor page
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
   Phone · Approved Oct 12`,

  "configurable-products": `Settings > Amounts and terms
------------------------------------------------------------------
 Investment amounts (one per line)      Terms offered
   [ 25000        ]                       [x] 1 year  [x] 2 years  [ ] 3 ...
   [ 50000        ]                     Payout terms offered
   [ 100000       ]                       [x] Quarterly [x] Half-Yearly [x] Yearly
 Will be offered: $25,000, $50,000, $100,000
 Defaults   Amount [ $100,000 v ]  Term [ 2 years v ]  Payout [ Yearly v ]
 [ Save ]       Last saved Oct 27, 2026 by Ashwin Patel
 Change history (last 20 saves)`,

  "rates-management": `Settings > Interest rates
------------------------------------------------------------------
 Quarterly     ****        Rates are locked.
 Half-Yearly   ****        [ Unlock to edit ]  (needs your own password)
 Yearly        ****
 After unlocking:  [ 8.0 ] [ 9.0 ] [ 10.0 ]  [ Save rates ]  [ Lock ]
 Locks again after saving or 10 minutes.
 History (last 20 saves)`,

  "audit-log": `Settings > Audit log
------------------------------------------------------------------
 Month [ 2026-10 v ]  Category [ All v ]
 Export  From [ 2026-10-01 ] To [ 2026-10-31 ]  [ Export to Excel ]
 Sign-in alerts (last 30 days)
   5 failed sign-ins for apatel within 15 minutes
 Oct 27, 13:30  Suresh Bhandari [Sales Admin]  Inquiries
   Marked inquiry DE300004 (Robert Chen) as contacted     -> inquiry page`,

  "admin-roles": `Settings > Employees
------------------------------------------------------------------
 Ashwin Patel · apatel · [MASTER ADMIN] · email on · two-step on
   [ Change role ] [ Disable ] [ Temporary password ] [ Setup link ]
   [ Set email ] [ Reset two-step ]
 Suresh Bhandari · sbhandari · [SALES ADMIN] · alerts on
 Add user:  Name [ ] Username [ ] Role [ Sales Admin v ]  [ Add ]`,

  "email-setup": `Settings > Email
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
 Payout emails to investors   (see Payout notices)`,

  "email-templates": `Settings > Email templates
------------------------------------------------------------------
 Template [ Inquiry acknowledgement v ]
   Subject [ We received your inquiry (Ref {reference}) ]
   Body    [ Hello {name}, thank you for your inquiry ...  ]
   Placeholders: {name} {reference} {amount} {link} ...
   [ Save ]  [ Reset to default ]
 Preview (with example details)
   Subject: We received your inquiry (Ref A1B2C3D4)
   Hello Jane, ...`,

  "payout-reminders": `Settings > Email > Payout emails to investors
------------------------------------------------------------------
 Remind investors [ 3 ] days before a payout   (0 = off)   [ Save ]
 Daily job        13:00 UTC · CRON_SECRET: Set
 Last run         Oct 27, 13:00 · daily · 4 reminders sent, 0 failed
 [ Run now ]

 Portal:  Payout emails [ On / Off ]   (investor can opt out)
 Record payout dialog:  [x] Email the investor a payment confirmation`,

  "new-inquiry-alerts": `My account
------------------------------------------------------------------
 Email and alerts
   Email address [ suresh@example.com ]   Current password [ ....... ]
   [x] Email me when a new inquiry arrives
   [ Save ]
 Change password  ·  Two-step sign-in`,

  "forgot-password": `Forgot password?                       (admin and investor versions)
------------------------------------------------------------------
 Username or email [ ................ ]   [ Send link ]
 "If an account matches, we have emailed a link."   (always the same
  message, so nobody can find out which accounts exist)`,
};
