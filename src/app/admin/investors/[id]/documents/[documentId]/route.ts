import { redirect } from "next/navigation";
import { connection, type NextRequest } from "next/server";
import { isInvestorIdLike } from "@/components/admin/investors/fields";
import { adminActor } from "@/lib/audit";
import { isDocumentId, type InvestorDocument } from "@/lib/documents";
import { getInvestor } from "@/lib/server/accounts-store";
import { recordAudit } from "@/lib/server/audit-store";
import { requireAdminPermission } from "@/lib/server/auth";
import { downloadHeaders, getDocument, openDocumentFile } from "@/lib/server/documents-store";

/**
 * Downloads one of an investor's documents (Master Admin), streamed from the
 * private Blob store as an attachment.
 *
 * GET /admin/investors/<id>/documents/<document id>
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  await connection();
  const admin = await requireAdminPermission("investors.manage");
  if (!admin) redirect("/admin");

  const { id, documentId } = await params;
  if (!isInvestorIdLike(id) || !isDocumentId(documentId)) return notFound();

  let doc: InvestorDocument | null;
  let file: Awaited<ReturnType<typeof openDocumentFile>>;
  let investor;
  try {
    [doc, investor] = await Promise.all([getDocument(id, documentId), getInvestor(id)]);
    file = doc && investor ? await openDocumentFile(doc) : null;
  } catch (error) {
    console.error("Downloading a document failed", error);
    return new Response("The document could not be loaded. Please try again.", { status: 500 });
  }
  if (!doc || !investor || !file) return notFound();

  recordAudit({
    actor: adminActor(admin),
    category: "investor",
    action: "investor.document_downloaded",
    summary: `Downloaded the document "${doc.title}" of investor ${investor.name} (${investor.username})`,
    target: { type: "investor", id: investor.id, label: `${investor.name} (${investor.username})` },
  });
  return new Response(file.stream, { headers: downloadHeaders(doc, file.size) });
}

function notFound(): Response {
  return new Response("This document could not be found.", { status: 404 });
}
