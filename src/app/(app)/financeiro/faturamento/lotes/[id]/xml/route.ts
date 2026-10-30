import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canManageFinance } from "@/lib/permissions";
import { hasTab } from "@/lib/tabs";
import { batchFileName, buildBatchXml } from "@/lib/tiss-xml";
import { loadBatch } from "../data";

// Arquivo XML do lote, para enviar no portal do convênio.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasTab(user, "financeiro") || !canManageFinance(user)) return new Response("Sem permissão", { status: 403 });
  const loaded = await loadBatch(user.clinicId, (await params).id);
  if (!loaded) return new Response("Lote não encontrado", { status: 404 });

  const { xml, hash } = buildBatchXml(loaded.input);
  await audit({ clinicId: user.clinicId, userId: user.id, action: "LOTE_BAIXADO", entity: "ClaimBatch", entityId: loaded.batch.id, details: { hash } });
  return new Response(new Uint8Array(Buffer.from(xml, "latin1")), {
    headers: {
      "Content-Type": "application/xml; charset=ISO-8859-1",
      "Content-Disposition": `attachment; filename="${batchFileName(loaded.batch.number, hash)}"`,
      "Cache-Control": "no-store",
    },
  });
}
