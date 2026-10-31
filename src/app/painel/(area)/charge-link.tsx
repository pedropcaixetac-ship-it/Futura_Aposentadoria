import { chargeMessage } from "@/lib/painel-financeiro";
import { billingStatus } from "@/lib/plans";
import { whatsappUrl } from "@/lib/whatsapp";

type ChargeClinic = {
  name: string;
  phone: string | null;
  contactName: string | null;
  contactPhone: string | null;
  paidUntil: Date | null;
  plan: { name: string; priceCents: number } | null;
};

// Abre o WhatsApp com a cobrança (ou o lembrete) pronta para o responsável pela clínica.
// Chave Pix opcional em PAINEL_PIX_CHAVE.
export function ChargeLink({ clinic, label = "Cobrar no WhatsApp" }: { clinic: ChargeClinic; label?: string }) {
  if (!clinic.paidUntil) return null;
  const status = billingStatus(clinic.paidUntil);
  const text = chargeMessage({
    contactName: clinic.contactName,
    clinicName: clinic.name,
    planName: clinic.plan?.name ?? null,
    priceCents: clinic.plan?.priceCents ?? null,
    paidUntil: clinic.paidUntil,
    status,
    pixKey: process.env.PAINEL_PIX_CHAVE ?? null,
  });
  const url = whatsappUrl(clinic.contactPhone, text) ?? whatsappUrl(clinic.phone, text);
  if (!url) return <span className="text-xs text-slate-400">Sem celular do responsável</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-emerald-700 hover:underline">
      {label}
    </a>
  );
}
