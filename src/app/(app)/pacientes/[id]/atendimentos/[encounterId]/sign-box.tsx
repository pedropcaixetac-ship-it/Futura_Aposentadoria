import { formatDateTime } from "@/lib/format";
import { startSigning } from "../../../../assinatura/actions";
import type { SignTarget } from "@/lib/signature/service";

type Props = {
  target: SignTarget;
  signed: { id: string; signerName: string; signedAt: Date; provider: string } | null;
  canSign: boolean;
  providers: { id: string; label: string }[];
};

// Botão "Assinar" ou o selo de já assinado, para um atendimento ou documento.
export function SignBox({ target, signed, canSign, providers }: Props) {
  if (signed) {
    return (
      <a
        href={`/api/pdf/assinado/${signed.id}`}
        target="_blank"
        className="btn-secondary border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
        title={`Assinado por ${signed.signerName} em ${formatDateTime(signed.signedAt)}`}
      >
        ✓ PDF assinado{signed.provider === "TESTE" ? " (teste)" : ""}
      </a>
    );
  }
  if (!canSign || providers.length === 0) return null;
  return (
    <form action={startSigning.bind(null, target)} className="flex items-center gap-2">
      {providers.length > 1 ? (
        <select name="provider" className="input w-auto py-1.5" aria-label="Certificado">
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      ) : (
        <input type="hidden" name="provider" value={providers[0].id} />
      )}
      <button className="btn-primary">Assinar</button>
    </form>
  );
}
