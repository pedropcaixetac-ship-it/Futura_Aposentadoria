import { PDFDocument } from "pdf-lib";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { SignPdf } from "@signpdf/signpdf";
import { Signer, SUBFILTER_ETSI_CADES_DETACHED } from "@signpdf/utils";
import { buildCms, type RawSigner } from "./cms";

class CmsSigner extends Signer {
  constructor(
    private chain: Buffer[],
    private raw: RawSigner,
  ) {
    super();
  }

  async sign(content: Buffer) {
    return buildCms(content, this.chain, this.raw);
  }
}

// Coloca a assinatura digital dentro do PDF (padrão PAdES, o mesmo que o
// Adobe Reader e o validador do ITI reconhecem).
export async function signPdf(pdfBytes: Uint8Array, signerName: string, chain: Buffer[], raw: RawSigner) {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  pdflibAddPlaceholder({
    pdfDoc,
    reason: "Documento assinado digitalmente (ICP-Brasil)",
    contactInfo: "",
    name: signerName,
    location: "",
    signatureLength: 16000,
    subFilter: SUBFILTER_ETSI_CADES_DETACHED,
  });
  const withPlaceholder = Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
  return new SignPdf().sign(withPlaceholder, new CmsSigner(chain, raw));
}
