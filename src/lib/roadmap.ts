/**
 * Upcoming features shown to Master Admins on /admin/settings/upcoming, and
 * in docs/UPCOMING-FEATURES.md. Update the status or priority here as work
 * progresses, then run `npm run docs:features` to rewrite the Markdown file.
 */
export type RoadmapStatus = "planned" | "in-progress" | "done";
export type RoadmapPriority = "now" | "next" | "later";
export type RoadmapCategory =
  | "communication"
  | "sales"
  | "portal"
  | "operations"
  | "security"
  | "reporting"
  | "platform";

export interface RoadmapItem {
  id: string;
  title: string;
  category: RoadmapCategory;
  priority: RoadmapPriority;
  status: RoadmapStatus;
  description: string;
  /** What happens for the team once it is live. */
  outcome?: string;
  /** Other items this one depends on (ids). */
  dependsOn?: string[];
  /** What is needed to build it. */
  needs?: string[];
}

export const ROADMAP_STATUS_LABELS: Record<RoadmapStatus, string> = {
  planned: "Planned",
  "in-progress": "In progress",
  done: "Done",
};

export const ROADMAP_PRIORITY_LABELS: Record<RoadmapPriority, string> = {
  now: "Now",
  next: "Next",
  later: "Later",
};

export const ROADMAP_CATEGORY_LABELS: Record<RoadmapCategory, string> = {
  communication: "Email and messaging",
  sales: "Sales and inquiries",
  portal: "Investor portal",
  operations: "Payouts and operations",
  security: "Security and compliance",
  reporting: "Reports and insights",
  platform: "Platform and experience",
};

export const ROADMAP_CATEGORY_ORDER: RoadmapCategory[] = [
  "communication",
  "sales",
  "portal",
  "operations",
  "security",
  "reporting",
  "platform",
];

export const ROADMAP: RoadmapItem[] = [
  // ---------- Email and messaging ----------
  {
    id: "email-setup",
    title: "Send and receive email (Gmail now, Resend later)",
    category: "communication",
    priority: "now",
    status: "in-progress",
    description:
      "Email works with Gmail now (no domain needed; replies are picked up by checking the inbox) and can switch to Resend with the EMAIL_PROVIDER setting once there is a company domain (replies arrive instantly, with delivery and bounce tracking). Settings > Email shows the status and a test button.",
    outcome: "Customers get emails from the business, and their replies come back into the app.",
    needs: [
      "Now: a Gmail account for the business with 2-Step Verification and an app password, added to Vercel by the owner",
      "Later: a company domain, a Resend Full access API key and the Resend webhook",
    ],
  },
  {
    id: "company-domain",
    title: "Company domain",
    category: "communication",
    priority: "now",
    status: "planned",
    description:
      "Buy a domain (about $11 a year) for the website and email, verify it in Resend, and point the site at it.",
    outcome: "Customers see a company web address and get emails from it, which reads as more trustworthy.",
    needs: ["The domain name to buy", "DNS records from Resend for sending and receiving"],
  },
  {
    id: "inquiry-acknowledgement",
    title: "Acknowledge inquiries by email",
    category: "communication",
    priority: "now",
    status: "in-progress",
    description:
      "As soon as an inquiry arrives, email the customer a thank-you with their reference number and what happens next.",
    outcome: "Every customer gets an immediate confirmation, recorded in the audit log.",
    dependsOn: ["email-setup", "company-domain"],
    needs: ["Approved wording for the acknowledgement email (a first version is live)"],
  },
  {
    id: "customer-responses",
    title: "Customer email replies",
    category: "communication",
    priority: "now",
    status: "in-progress",
    description:
      "Customers' replies are picked up (from the Gmail inbox now, through the Resend webhook later) and attached to the matching inquiry by its reply address or reference number. Staff can answer from the inquiry page.",
    outcome: "Admins see the conversation on the inquiry; each response is recorded in the audit log under Customer responses.",
    dependsOn: ["email-setup", "inquiry-acknowledgement"],
  },
  {
    id: "new-inquiry-alerts",
    title: "Alerts for new inquiries",
    category: "communication",
    priority: "next",
    status: "planned",
    description: "Notify the sales team by email (and optionally Slack or Teams) the moment a new inquiry arrives.",
    dependsOn: ["email-setup"],
  },
  {
    id: "email-templates",
    title: "Email templates",
    category: "communication",
    priority: "next",
    status: "planned",
    description:
      "Editable templates for follow-ups, welcome-to-the-portal emails, password setup links and payout notices, with the customer's name and plan filled in.",
    dependsOn: ["email-setup"],
  },
  {
    id: "payout-reminders",
    title: "Payout notices to investors",
    category: "communication",
    priority: "later",
    status: "planned",
    description: "Email investors a few days before each payout, and confirm when it has been paid.",
    dependsOn: ["email-setup", "record-payments"],
  },
  {
    id: "sms-whatsapp",
    title: "SMS and WhatsApp messages",
    category: "communication",
    priority: "later",
    status: "planned",
    description: "Optional text or WhatsApp messages for acknowledgements and payout notices.",
    needs: ["A messaging provider account (for example Twilio or WhatsApp Business)", "Customer consent to receive messages"],
  },

  // ---------- Sales and inquiries ----------
  {
    id: "visitor-inquiries",
    title: "Inquiries from the calculator",
    category: "sales",
    priority: "now",
    status: "done",
    description:
      "Visitors send an inquiry with their plan, name, email, phone and a message. Spam protection: a hidden honeypot field and at most 5 inquiries per client per hour.",
    outcome: "Admins see every inquiry on the Inquiries page (the admin home), newest first.",
  },
  {
    id: "inquiry-statuses",
    title: "Inquiry statuses, delete and restore",
    category: "sales",
    priority: "now",
    status: "done",
    description:
      "New, Contacted and Converted statuses. Mark as contacted asks for a note (call, meeting or note). Delete moves an inquiry to Deleted inquiries, where a Master Admin can restore it.",
  },
  {
    id: "convert-to-investor",
    title: "Convert an inquiry into an investor",
    category: "sales",
    priority: "now",
    status: "done",
    description:
      "A contacted inquiry becomes an investor with one click: the form is pre-filled from the inquiry and the interest rate is fixed at that moment.",
  },
  {
    id: "assign-inquiries",
    title: "Assign inquiries and follow-up dates",
    category: "sales",
    priority: "next",
    status: "planned",
    description:
      "Assign each inquiry to a Sales Admin, set a follow-up date, and show each person their own list of today's follow-ups.",
  },
  {
    id: "inquiry-notes",
    title: "Notes and call log on inquiries",
    category: "sales",
    priority: "next",
    status: "done",
    description:
      "Add notes, calls and meetings to an inquiry, shown as a timeline with who added each entry, together with every audit event about the inquiry. The Inquiries list shows each inquiry's latest note.",
  },
  {
    id: "lead-source",
    title: "Lead source and seminar tracking",
    category: "sales",
    priority: "next",
    status: "planned",
    description:
      "Record where each inquiry came from (seminar, website, referral) using links or QR codes, so you can see which seminars bring investors.",
    outcome: "Each seminar gets its own QR code; the Inquiries page shows the source.",
  },
  {
    id: "pipeline-board",
    title: "Pipeline board",
    category: "sales",
    priority: "later",
    status: "planned",
    description: "A board view of inquiries by stage (New, Contacted, Meeting booked, Converted) with drag and drop.",
  },
  {
    id: "search-export",
    title: "Search, filters and export",
    category: "sales",
    priority: "next",
    status: "in-progress",
    description: "Search inquiries and investors by name, email or reference, filter by status and date, and export to Excel.",
    outcome: "Inquiries can already be searched by name, email, phone or reference and filtered by status; investors, dates and export are next.",
  },

  // ---------- Investor portal ----------
  {
    id: "investor-portal",
    title: "Investor portal",
    category: "portal",
    priority: "now",
    status: "done",
    description:
      "Investors sign in at /portal and see each investment: amounts, dates, totals, the next payout and the full payout schedule. The interest rate is never shown.",
  },
  {
    id: "investor-logins",
    title: "Investor logins",
    category: "portal",
    priority: "now",
    status: "done",
    description:
      "A Master Admin gives each investor a temporary password or a one-time setup link (valid 72 hours), can reset it, edit contact details and disable or enable the login.",
  },
  {
    id: "forgot-password",
    title: "Forgot password by email",
    category: "portal",
    priority: "next",
    status: "planned",
    description: "Investors and staff reset their own password with an emailed link instead of asking an admin.",
    dependsOn: ["email-setup"],
  },
  {
    id: "statements",
    title: "Statements and downloads",
    category: "portal",
    priority: "next",
    status: "planned",
    description: "Investors download a statement for each investment (PDF and Excel) with the schedule and payments made.",
  },
  {
    id: "documents",
    title: "Document vault",
    category: "portal",
    priority: "later",
    status: "planned",
    description: "Share agreements, certificates and tax documents with each investor securely in the portal.",
  },
  {
    id: "multiple-investments",
    title: "More investments and renewals",
    category: "portal",
    priority: "later",
    status: "planned",
    description:
      "Add further investments for an existing investor, and offer renewal at maturity with the current rates.",
  },
  {
    id: "profile-requests",
    title: "Profile and bank detail updates",
    category: "portal",
    priority: "later",
    status: "planned",
    description: "Investors request changes to their contact or bank details; a Master Admin approves them.",
  },

  // ---------- Payouts and operations ----------
  {
    id: "payout-calculator",
    title: "Payout calculator",
    category: "operations",
    priority: "now",
    status: "done",
    description:
      "Payout schedule for a fixed-term investment (simple interest, Interest Only or Interest and Principal), comparisons with other payout terms and types, and an Excel download.",
  },
  {
    id: "rates-management",
    title: "Interest rates managed by Master Admins",
    category: "operations",
    priority: "now",
    status: "done",
    description:
      "One rate per payout term, never sent to visitors or investors. Editing needs the admin's own password, locks again after saving or 10 minutes, and keeps the last 20 saves.",
  },
  {
    id: "record-payments",
    title: "Record actual payouts",
    category: "operations",
    priority: "next",
    status: "planned",
    description:
      "Mark each scheduled payout as paid (date, amount, reference), so the portal shows real payments instead of scheduled dates.",
  },
  {
    id: "payout-calendar",
    title: "Payout calendar",
    category: "operations",
    priority: "next",
    status: "planned",
    description: "One view of all upcoming payouts across investors, with totals per week and month for cash planning.",
  },
  {
    id: "monthly-payouts",
    title: "Monthly payout term",
    category: "operations",
    priority: "later",
    status: "planned",
    description: "Add Monthly alongside Quarterly, Half-Yearly and Yearly, with its own rate.",
  },
  {
    id: "holiday-calendar",
    title: "Bank holiday calendar",
    category: "operations",
    priority: "later",
    status: "planned",
    description:
      "Skip public holidays when counting business days, and optionally move payouts that land on weekends or holidays.",
  },
  {
    id: "configurable-products",
    title: "Amounts and terms in settings",
    category: "operations",
    priority: "later",
    status: "planned",
    description: "Let Master Admins change the investment amounts and terms on a settings page instead of in the code.",
  },

  // ---------- Security and compliance ----------
  {
    id: "admin-roles",
    title: "Admin users and roles",
    category: "security",
    priority: "now",
    status: "done",
    description:
      "Named admin users with Master Admin and Sales Admin roles, temporary passwords and setup links, and a sign-in rate limit. Sales Admins never see interest rates.",
  },
  {
    id: "audit-log",
    title: "Audit log",
    category: "security",
    priority: "now",
    status: "done",
    description:
      "Who did what and when: sign-ins, password changes, inquiries, investors, users, rates and emails, by month and category. Events about an inquiry also show on that inquiry.",
  },
  {
    id: "two-factor",
    title: "Two-step sign-in",
    category: "security",
    priority: "next",
    status: "planned",
    description: "Optional authenticator-app codes for staff and investors, required for Master Admins.",
  },
  {
    id: "kyc",
    title: "Identity checks (KYC)",
    category: "security",
    priority: "later",
    status: "planned",
    description: "Collect and verify investor identity documents before an investment is confirmed.",
    needs: ["Advice on the rules that apply to your business", "An identity verification provider"],
  },
  {
    id: "e-signature",
    title: "E-signature of agreements",
    category: "security",
    priority: "later",
    status: "planned",
    description: "Send the investment agreement for electronic signature and store the signed copy in the document vault.",
    dependsOn: ["documents"],
  },
  {
    id: "privacy",
    title: "Privacy notice and data requests",
    category: "security",
    priority: "next",
    status: "planned",
    description:
      "A privacy notice on the inquiry form, consent checkbox, retention periods, and a way to handle deletion requests.",
  },
  {
    id: "remove-permanent-delete",
    title: "Remove permanent delete before go-live",
    category: "security",
    priority: "now",
    status: "planned",
    description: "The temporary Delete permanently button for inquiries is removed once the app is ready.",
  },
  {
    id: "automated-tests",
    title: "Automated tests and checks",
    category: "security",
    priority: "next",
    status: "planned",
    description: "Tests for sign-in, roles, conversion and the portal, run automatically before each deployment.",
  },
  {
    id: "sign-in-alerts",
    title: "Sign-in alerts",
    category: "security",
    priority: "later",
    status: "planned",
    description: "Warn Master Admins about repeated failed sign-ins or sign-ins from new places, using the audit log.",
  },

  // ---------- Reports and insights ----------
  {
    id: "dashboard",
    title: "Dashboard",
    category: "reporting",
    priority: "next",
    status: "planned",
    description:
      "Inquiries per week, conversion rate, total invested, and upcoming payouts owed, on the admin home page.",
  },
  {
    id: "audit-export",
    title: "Audit log export",
    category: "reporting",
    priority: "later",
    status: "planned",
    description: "Download the audit log for a date range as Excel.",
  },
  {
    id: "web-analytics",
    title: "Visitor analytics",
    category: "reporting",
    priority: "later",
    status: "planned",
    description: "Privacy-friendly visit counts for the calculator page (Vercel Web Analytics has a free tier).",
  },

  // ---------- Platform and experience ----------
  {
    id: "seminar-deck",
    title: "Seminar presentation",
    category: "platform",
    priority: "now",
    status: "done",
    description: "A PowerPoint and PDF deck for investor seminars, with the calculator address, a QR code and the disclaimer (in docs/).",
  },
  {
    id: "demo-data",
    title: "Demo data for testing",
    category: "platform",
    priority: "now",
    status: "done",
    description:
      "npm run seed:demo adds demo inquiries, investors, notes and activity, and removes them again with --remove, before go-live.",
  },
  {
    id: "custom-domain",
    title: "Your own web address",
    category: "platform",
    priority: "next",
    status: "planned",
    description: "Use your company domain (for example invest.yourcompany.com) instead of the vercel.app address.",
    needs: ["A domain you own", "Adding two DNS records"],
  },
  {
    id: "branding",
    title: "Company branding",
    category: "platform",
    priority: "next",
    status: "planned",
    description: "Your logo, colours and contact details across the calculator, portal, emails and seminar materials.",
  },
  {
    id: "installable-app",
    title: "Install on phones",
    category: "platform",
    priority: "later",
    status: "planned",
    description: "Let investors add the portal to their phone's home screen and open it like an app.",
  },
  {
    id: "languages",
    title: "More languages",
    category: "platform",
    priority: "later",
    status: "planned",
    description: "Show the calculator and portal in other languages, with local number and date formats.",
  },
  {
    id: "accessibility-review",
    title: "Accessibility review",
    category: "platform",
    priority: "later",
    status: "planned",
    description: "A full check against WCAG 2.2 AA with screen readers and keyboard-only use.",
  },
];
