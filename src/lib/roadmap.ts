/**
 * Upcoming features shown to Master Admins on /admin/settings/upcoming.
 * Update the status here as work progresses.
 */
export type RoadmapStatus = "planned" | "in-progress" | "done";

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  status: RoadmapStatus;
  /** What happens for the team once it is live. */
  outcome: string;
  /** Other items this one depends on. */
  dependsOn?: string[];
  /** What is needed to build it. */
  needs: string[];
}

export const ROADMAP_STATUS_LABELS: Record<RoadmapStatus, string> = {
  planned: "Planned",
  "in-progress": "In progress",
  done: "Done",
};

export const ROADMAP: RoadmapItem[] = [
  {
    id: "gmail-link",
    title: "Link a Gmail account",
    description:
      "Connect the team's Gmail account so the app can send emails and read replies from that mailbox.",
    status: "planned",
    outcome: "Emails to customers come from the team's own Gmail address, and replies land in the same mailbox.",
    needs: [
      "A Google Cloud project with the Gmail API enabled",
      "The Gmail account owner signs in once to approve access (done in the browser, not shared with us)",
      "A Master Admin screen to connect or disconnect the account",
    ],
  },
  {
    id: "inquiry-acknowledgement",
    title: "Acknowledge inquiries by email",
    description:
      "As soon as an inquiry arrives, email the customer a thank-you message with their reference number and what happens next.",
    status: "planned",
    outcome: "Every customer gets an immediate confirmation with their reference number, and the email is recorded in the audit log.",
    dependsOn: ["gmail-link"],
    needs: ["The linked Gmail account", "Approved wording for the acknowledgement email"],
  },
  {
    id: "customer-responses",
    title: "Customer responses from Gmail",
    description:
      "Read customers' email replies from the linked Gmail account and attach them to the matching inquiry by reference number.",
    status: "planned",
    outcome:
      "Admins see the conversation on the inquiry, and each customer response is recorded in the audit log under Customer responses.",
    dependsOn: ["gmail-link", "inquiry-acknowledgement"],
    needs: ["The linked Gmail account", "Reference numbers in email subjects (added by the acknowledgement email)"],
  },
];
