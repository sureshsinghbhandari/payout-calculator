"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { isInvestorIdLike } from "@/components/admin/investors/fields";
import { adminActor } from "@/lib/audit";
import type { Investor } from "@/lib/accounts";
import {
  cleanFileName,
  DOCUMENT_KINDS,
  DOCUMENT_TYPE_LABELS,
  detectDocumentKind,
  formatFileSize,
  isDocumentId,
  isDocumentType,
  kindFromFileName,
  MAX_DOCUMENT_BYTES,
  parseDocumentTitle,
} from "@/lib/documents";
import { getInvestor, isAccountStorageConfigured } from "@/lib/server/accounts-store";
import { recordAudit } from "@/lib/server/audit-store";
import { requireAdminPermission } from "@/lib/server/auth";
import {
  addDocument,
  deleteDocumentFile,
  DocumentError,
  inspectDocumentFile,
  isDocumentPathname,
  removeDocument,
} from "@/lib/server/documents-store";
import { isEmailEnabled, sendDocumentNotice } from "@/lib/server/email";
import { siteOrigin } from "@/lib/server/site-url";

/*
 * Investor documents (Master Admin). The file itself is uploaded from the
 * browser straight to the private Blob store (see documents/upload/route.ts);
 * these actions check and list it, and delete documents. Server actions are
 * public endpoints: every action checks the admin's permission first.
 */

const NO_ACCESS = "Your session has ended or you do not have permission for this. Sign in again as a Master Admin.";
const NOT_FOUND = "This investor could not be found. Reload the page.";

export interface DocumentActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: { title?: string; type?: string; file?: string };
}

function investorTarget(investor: Pick<Investor, "id" | "name" | "username">) {
  return { type: "investor" as const, id: investor.id, label: `${investor.name} (${investor.username})` };
}

/**
 * Lists a file the browser has just uploaded for an investor. Checks what the
 * file really is from its first bytes (not its name), and deletes it when it
 * is not an acceptable PDF, JPEG or PNG of at most 10 MB.
 */
export async function registerDocumentAction(input: {
  investorId: string;
  pathname: string;
  title: string;
  type: string;
  fileName: string;
}): Promise<DocumentActionResult> {
  const admin = await requireAdminPermission("investors.manage");
  if (!admin) return { ok: false, message: NO_ACCESS };

  if (typeof input !== "object" || input === null) return { ok: false, message: "The upload could not be found." };
  const { investorId, pathname } = input;
  const claimed = typeof pathname === "string" ? kindFromFileName(pathname) : null;
  if (!isInvestorIdLike(investorId) || !claimed || !isDocumentPathname(pathname, investorId, claimed)) {
    return { ok: false, message: "The upload could not be found. Please try again." };
  }

  // From here on, a file that is not listed is deleted again.
  const reject = async (result: DocumentActionResult): Promise<DocumentActionResult> => {
    await deleteDocumentFile(pathname);
    return result;
  };

  const title = parseDocumentTitle(input.title);
  if (!title.ok) return reject({ ok: false, message: "Fix the highlighted fields.", fieldErrors: { title: title.error } });
  if (!isDocumentType(input.type)) {
    return reject({ ok: false, message: "Fix the highlighted fields.", fieldErrors: { type: "Choose a document type." } });
  }
  if (!isAccountStorageConfigured()) return reject({ ok: false, message: "Account storage is not configured." });

  let investor: Investor | null;
  let file: Awaited<ReturnType<typeof inspectDocumentFile>>;
  try {
    [investor, file] = await Promise.all([getInvestor(investorId), inspectDocumentFile(pathname)]);
  } catch (error) {
    console.error("Checking an uploaded document failed", error);
    return reject({ ok: false, message: "The upload could not be checked. Please try again." });
  }
  if (!investor) return reject({ ok: false, message: NOT_FOUND });
  if (!file) return { ok: false, message: "The upload could not be found. Please try again." };

  const kind = detectDocumentKind(file.head);
  if (!kind || kind !== claimed) {
    return reject({
      ok: false,
      message: "This file is not a PDF, JPEG or PNG.",
      fieldErrors: { file: "Choose a PDF, JPEG or PNG file. The file's content did not match its type." },
    });
  }
  if (file.size === 0 || file.size > MAX_DOCUMENT_BYTES) {
    return reject({ ok: false, message: "This file is too large.", fieldErrors: { file: "Choose a file of at most 10 MB." } });
  }

  let doc;
  try {
    doc = await addDocument({
      investorId: investor.id,
      title: title.value,
      type: input.type,
      kind,
      fileName: cleanFileName(typeof input.fileName === "string" ? input.fileName : "", kind, title.value),
      pathname,
      size: file.size,
      uploadedBy: admin.name,
      uploadedById: admin.id,
    });
  } catch (error) {
    if (!(error instanceof DocumentError)) console.error("Listing an uploaded document failed", error);
    return reject({ ok: false, message: "The document could not be saved. Please try again." });
  }

  recordAudit({
    actor: adminActor(admin),
    category: "investor",
    action: "investor.document_uploaded",
    summary: `Uploaded the document "${doc.title}" (${DOCUMENT_TYPE_LABELS[doc.type]}, ${DOCUMENT_KINDS[kind].label}, ${formatFileSize(doc.size)}) for investor ${investor.name} (${investor.username})`,
    target: investorTarget(investor),
  });

  // Tell the investor, when email is set up (after the response; never blocks the upload).
  const emailed = isEmailEnabled() && investor.email !== "" && investor.active;
  if (emailed) {
    const origin = siteOrigin(await headers());
    const recipient = { id: investor.id, name: investor.name, username: investor.username, email: investor.email };
    after(() => sendDocumentNotice({ investor: recipient, title: doc.title, origin }));
  }

  refresh();
  return {
    ok: true,
    message: emailed
      ? `"${doc.title}" uploaded. ${investor.name} can download it in the portal. An email telling them is on its way.`
      : `"${doc.title}" uploaded. ${investor.name} can download it in the portal.`,
  };
}

export async function deleteDocumentAction(investorId: string, documentId: string): Promise<DocumentActionResult> {
  const admin = await requireAdminPermission("investors.manage");
  if (!admin) return { ok: false, message: NO_ACCESS };
  if (!isInvestorIdLike(investorId) || !isDocumentId(documentId)) return { ok: false, message: NOT_FOUND };

  try {
    const investor = await getInvestor(investorId);
    if (!investor) return { ok: false, message: NOT_FOUND };
    const removed = await removeDocument(investorId, documentId);
    recordAudit({
      actor: adminActor(admin),
      category: "investor",
      action: "investor.document_deleted",
      summary: `Deleted the document "${removed.title}" (${DOCUMENT_TYPE_LABELS[removed.type]}) of investor ${investor.name} (${investor.username})`,
      target: investorTarget(investor),
    });
  } catch (error) {
    if (error instanceof DocumentError) return { ok: false, message: error.message };
    console.error("Deleting a document failed", error);
    return { ok: false, message: "The document could not be deleted. Please try again." };
  }

  refresh();
  return { ok: true, message: "Document deleted." };
}
