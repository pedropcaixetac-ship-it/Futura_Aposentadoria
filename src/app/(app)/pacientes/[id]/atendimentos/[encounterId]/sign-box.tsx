import { formatDateTime } from "@/lib/format";
import { startSigning, startSigningAll } from "../../../../assinatura/actions";
import type { SignTarget } from "@/lib/signature/service";

type Props = {
  target: SignTarget;
  signed: { id: string; signerName: string; signedAt: Date; provider: string } | null;
  canSign: boolean;
  providers: { id: string; label: string }[];
  // Tela para onde voltar depois de assinar, quando não for a do atendimento.
  back?: string;
  label?: string;
};

// Botão "Assinar" ou o selo de já assinado, para um atendimento ou documento.
export function SignBox({ target, signed, canSign, providers, back, label = "Assinar" }: Props) {
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
      {back && <input type="hidden" name="back" value={back} />}
      <ProviderChoice providers={providers} />
      <button className="btn-primary">{label}</button>
    </form>
  );
}

// "Assinar todos": assina de uma vez os itens que ainda não foram assinados.
export function SignAllBox({ targets, providers, back }: { targets: SignTarget[]; providers: Props["providers"]; back: string }) {
  if (targets.length === 0 || providers.length === 0) return null;
  return (
    <form action={startSigningAll.bind(null, targets)} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="back" value={back} />
      <ProviderChoice providers={providers} />
      <button className="btn-primary">Assinar todos ({targets.length})</button>
    </form>
  );
}

function ProviderChoice({ providers }: { providers: Props["providers"] }) {
  if (providers.length === 1) return <input type="hidden" name="provider" value={providers[0].id} />;
  return (
    <select name="provider" className="input w-auto py-1.5" aria-label="Certificado">
      {providers.map((p) => (
        <option key={p.id} value={p.id}>{p.label}</option>
      ))}
    </select>
  );
}
