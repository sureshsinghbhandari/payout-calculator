import { redirect } from "next/navigation";
import { connection, type NextRequest } from "next/server";
import { investorActor } from "@/lib/audit";
import { isDocumentId, type InvestorDocument } from "@/lib/documents";
import { recordAudit } from "@/lib/server/audit-store";
import { getCurrentInvestor } from "@/lib/server/auth";
import { downloadHeaders, getDocument, openDocumentFile } from "@/lib/server/documents-store";

/**
 * Downloads one of the signed-in investor's own documents, streamed from the
 * private Blob store as an attachment. Documents are looked up among this
 * investor's documents only, so nobody can fetch another investor's file.
 *
 * GET /portal/documents/<document id>
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  await connection();
  const investor = await getCurrentInvestor().catch((error) => {
    console.error("Loading investor for a document download failed", error);
    return null;
  });
  if (!investor || investor.mustChangePassword) redirect("/portal");

  const { documentId } = await params;
  if (!isDocumentId(documentId)) return notFound();

  let doc: InvestorDocument | null;
  let file: Awaited<ReturnType<typeof openDocumentFile>>;
  try {
    doc = await getDocument(investor.id, documentId);
    file = doc ? await openDocumentFile(doc) : null;
  } catch (error) {
    console.error("Downloading a document failed", error);
    return new Response("The document could not be loaded. Please try again.", { status: 500 });
  }
  if (!doc || !file) return notFound();

  recordAudit({
    actor: investorActor(investor),
    category: "investor",
    action: "investor.document_downloaded",
    summary: `Downloaded the document "${doc.title}"`,
    target: { type: "investor", id: investor.id, label: `${investor.name} (${investor.username})` },
  });
  return new Response(file.stream, { headers: downloadHeaders(doc, file.size) });
}

function notFound(): Response {
  return new Response("This document could not be found.", { status: 404 });
}
