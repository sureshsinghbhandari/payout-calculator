import "server-only";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import PostalMime from "postal-mime";

/**
 * Gmail transport: sends through Gmail's SMTP server and reads the inbox over
 * IMAP, signing in with the account address and a Google app password
 * (needs 2-Step Verification on the account). Used when EMAIL_PROVIDER is "gmail".
 */
export interface GmailAccount {
  user: string;
  password: string;
}

export interface GmailOutgoing {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  inReplyTo?: string;
}

export async function sendViaGmail(
  account: GmailAccount,
  mail: GmailOutgoing,
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: account.user, pass: account.password },
    connectionTimeout: 15_000,
    socketTimeout: 20_000,
  });
  try {
    const info = await transport.sendMail({
      from: mail.from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
      ...(mail.inReplyTo ? { inReplyTo: mail.inReplyTo, references: mail.inReplyTo } : {}),
    });
    return { ok: true, messageId: info.messageId };
  } catch (error) {
    return { ok: false, error: gmailError(error) };
  } finally {
    transport.close();
  }
}

function gmailError(error: unknown): string {
  const code = (error as { code?: string; authenticationFailed?: boolean })?.code;
  if (code === "EAUTH" || (error as { authenticationFailed?: boolean })?.authenticationFailed) {
    return "Gmail refused the sign-in. Check GMAIL_USER and GMAIL_APP_PASSWORD (an app password, not the normal password).";
  }
  return error instanceof Error ? error.message : "Gmail did not accept the email.";
}

/** Envelope of an inbox message, used to decide whether to download it. */
export interface InboxEnvelope {
  uid: number;
  from: string;
  recipients: string[];
  subject: string;
}

/** A downloaded inbox message. */
export interface InboxMessage {
  uid: number;
  from: string;
  fromName: string;
  recipients: string[];
  subject: string;
  date: string | null;
  messageId: string | null;
  text: string;
  html: string | null;
}

export interface InboxScan {
  uidValidity: string;
  /** Highest UID looked at. */
  lastUid: number;
  messages: InboxMessage[];
}

/** UIDs to look at on the first check (no earlier state). */
const FIRST_SCAN = 200;
/** Most messages downloaded in one check. */
const MAX_DOWNLOADS = 50;

/**
 * Looks at inbox messages newer than `afterUid` (or the newest few on the first
 * check, or when the mailbox was reset) and downloads only those `wanted`
 * accepts. Other messages are never downloaded; only their envelope is read.
 */
export async function scanGmailInbox(
  account: GmailAccount,
  previous: { uidValidity: string; lastUid: number } | null,
  wanted: (envelope: InboxEnvelope) => boolean,
): Promise<InboxScan> {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: account.user, pass: account.password },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 15_000,
    socketTimeout: 30_000,
  });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(gmailError(error));
  }
  try {
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      const mailbox = client.mailbox;
      if (!mailbox) throw new Error("The Gmail inbox could not be opened.");
      const uidValidity = String(mailbox.uidValidity);
      const sameMailbox = previous && previous.uidValidity === uidValidity;
      const start = sameMailbox ? previous.lastUid + 1 : Math.max(1, mailbox.uidNext - FIRST_SCAN);
      let lastUid = sameMailbox ? previous.lastUid : start - 1;
      if (start >= mailbox.uidNext) return { uidValidity, lastUid, messages: [] };

      const toDownload: number[] = [];
      for await (const msg of client.fetch(
        `${start}:*`,
        { uid: true, envelope: true, headers: ["delivered-to"] },
        { uid: true },
      )) {
        // "n:*" always returns the newest message, even when it is older than n.
        if (msg.uid < start) continue;
        lastUid = Math.max(lastUid, msg.uid);
        const env = msg.envelope;
        const addresses = [...(env?.to ?? []), ...(env?.cc ?? [])]
          .map((a) => a.address?.toLowerCase())
          .filter((a): a is string => Boolean(a));
        const deliveredTo = (msg.headers?.toString("utf8") ?? "")
          .split(/\r?\n/)
          .map((line) => /^delivered-to:\s*(.+)$/i.exec(line.trim())?.[1]?.trim().toLowerCase())
          .filter((a): a is string => Boolean(a));
        const envelope: InboxEnvelope = {
          uid: msg.uid,
          from: env?.from?.[0]?.address?.toLowerCase() ?? "",
          recipients: [...deliveredTo, ...addresses],
          subject: env?.subject ?? "",
        };
        if (wanted(envelope) && toDownload.length < MAX_DOWNLOADS) toDownload.push(msg.uid);
      }

      const messages: InboxMessage[] = [];
      for (const uid of toDownload) {
        const msg = await client.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const parsed = await PostalMime.parse(msg.source);
        const mailboxes = (list: typeof parsed.to) =>
          (list ?? []).flatMap((a) => ("address" in a && a.address ? [a.address.toLowerCase()] : []));
        const from = parsed.from && "address" in parsed.from ? parsed.from : null;
        messages.push({
          uid,
          from: from?.address?.toLowerCase() ?? "",
          fromName: from?.name ?? "",
          recipients: [...(parsed.deliveredTo ? [parsed.deliveredTo.toLowerCase()] : []), ...mailboxes(parsed.to), ...mailboxes(parsed.cc)],
          subject: parsed.subject ?? "",
          date: parsed.date ?? null,
          messageId: parsed.messageId ?? null,
          text: parsed.text ?? "",
          html: parsed.html ?? null,
        });
      }
      return { uidValidity, lastUid, messages };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
}
