import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { consentText, councilLabel, teleconsultationState } from "@/lib/teleconsulta";
import { ensureRoom } from "@/lib/teleconsulta-sala";
import { joinUrl, videoConfigured } from "@/lib/video";
import { acceptConsent } from "./actions";
import { displayName } from "@/lib/staff";

// Página aberta pelo paciente, sem login: o link secreto é a chave.
export const metadata: Metadata = { title: "Teleconsulta", robots: { index: false, follow: false } };

function Shell({ clinic, children }: { clinic: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col bg-marinho-900">
      <header className="flex items-center justify-between px-4 py-3 text-white">
        <span className="font-semibold text-dourado-300">{clinic}</span>
        <span className="text-sm text-marinho-100">Teleconsulta</span>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center p-4">{children}</div>
    </main>
  );
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div className="card w-full max-w-md border-t-4 border-t-dourado-500 text-center">
      <h1 className="mb-2 text-lg font-semibold text-marinho-800">{title}</h1>
      <p className="text-sm text-slate-600">{text}</p>
    </div>
  );
}

export default async function PatientTeleconsultationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await prisma.teleconsultation.findUnique({
    where: { token },
    include: { clinic: true, professional: true, patient: true },
  });
  if (!t) notFound();

  const council = councilLabel(t.professional);
  const state = teleconsultationState(t);
  const firstName = (t.patient.socialName || t.patient.name).split(" ")[0];

  if (state === "ENCERRADA") {
    return <Shell clinic={t.clinic.name}><Notice title="Teleconsulta encerrada" text="Obrigado. Se precisar de algo, entre em contato com a clínica." /></Shell>;
  }
  if (state === "EXPIRADA") {
    return <Shell clinic={t.clinic.name}><Notice title="Este link expirou" text="Entre em contato com a clínica para receber um novo link." /></Shell>;
  }

  if (state === "AGUARDANDO_TERMO") {
    const text = consentText({ clinicName: t.clinic.name, professionalName: displayName(t.professional), council });
    return (
      <Shell clinic={t.clinic.name}>
        <form action={acceptConsent.bind(null, token)} className="card w-full max-w-xl space-y-4 border-t-4 border-t-dourado-500">
          <div>
            <h1 className="text-lg font-semibold text-marinho-800">Olá, {firstName}!</h1>
            <p className="text-sm text-slate-600">
              Sua consulta com {displayName(t.professional)}{council && ` (${council})`} será por vídeo.
              Antes de entrar, leia e aceite o termo abaixo.
            </p>
          </div>
          <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {text}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="aceito" required className="mt-1" />
            <span>Li e aceito o termo de consentimento para teleconsulta.</span>
          </label>
          <button className="btn-primary w-full">Aceitar e entrar na consulta</button>
          <p className="text-xs text-slate-500">
            Use um lugar reservado e permita o acesso à câmera e ao microfone quando o navegador pedir.
          </p>
        </form>
      </Shell>
    );
  }

  if (!videoConfigured()) {
    return <Shell clinic={t.clinic.name}><Notice title="Vídeo indisponível" text="A clínica ainda não ativou as chamadas de vídeo. Entre em contato com a clínica." /></Shell>;
  }

  let url: string;
  try {
    url = await joinUrl(await ensureRoom(t), t.patient.socialName || t.patient.name, false);
  } catch (e) {
    console.error(e);
    return <Shell clinic={t.clinic.name}><Notice title="Não foi possível abrir o vídeo" text="Tente recarregar a página em alguns instantes." /></Shell>;
  }
  if (!t.patientJoinedAt) {
    await prisma.teleconsultation.update({ where: { id: t.id }, data: { patientJoinedAt: new Date() } });
    await audit({ clinicId: t.clinicId, action: "TELECONSULTA_PACIENTE_ENTROU", entity: "Teleconsultation", entityId: t.id, patientId: t.patientId });
  }

  return (
    <main className="flex h-dvh flex-col bg-marinho-900">
      <header className="flex items-center justify-between px-4 py-2 text-sm text-white">
        <span className="font-semibold text-dourado-300">{t.clinic.name}</span>
        <span className="text-marinho-100">Aguarde: {displayName(t.professional)} vai entrar na chamada</span>
      </header>
      <iframe
        src={url}
        title="Chamada de vídeo"
        allow="camera; microphone; fullscreen; display-capture; autoplay"
        className="w-full flex-1 border-0"
      />
    </main>
  );
}
