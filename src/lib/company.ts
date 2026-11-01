/**
 * The company's real-world details, in one place. Everything that prints the
 * company's name, address, governing law or privacy contact reads from here:
 * the Investment Agreement and the Investor Acknowledgment (see
 * agreement-template.ts) and the public Privacy Notice (app/privacy).
 *
 * Values in [square brackets] are placeholders. The Signing panel on an
 * investor's page warns until they are replaced, and the Privacy Notice shows
 * them as plain text instead of a clickable address. Replace all four, then
 * have a licensed attorney read the documents (see docs/legal-review.md).
 */
export const COMPANY = {
  /** Full legal name exactly as registered, including the entity type (for example "Example Capital LLC"). */
  legalName: "[Company legal name]",
  /** Registered or principal business address, on one line. */
  address: "[Company address]",
  /** The US state whose law governs the agreement, and whose courts hear disputes. */
  governingState: "[State]",
  /** Mailbox for privacy questions and data requests. Must be one the company reads. */
  privacyEmail: "[Privacy contact email]",
} as const;

export function isPlaceholder(value: string): boolean {
  return /^\[.*\]$/.test(value.trim());
}
