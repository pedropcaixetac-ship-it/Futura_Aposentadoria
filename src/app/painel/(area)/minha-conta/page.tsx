import QRCode from "qrcode";
import { prisma, withSecrets } from "@/lib/db";
import { requirePlatformUser } from "@/lib/painel-auth";
import { formatDateTime } from "@/lib/format";
import { open } from "@/lib/signature/secret-box";
import { totpUri } from "@/lib/totp";
import { ActionForm } from "@/app/(app)/financeiro/action-form";
import { PasswordFields } from "@/app/(app)/meu-cadastro/password-fields";
import { cancelPlatformTwoFactor, changePlatformPassword, disablePlatformTwoFactor, startPlatformTwoFactor } from "./actions";
import { PlatformTwoFactorConfirm } from "./two-factor-confirm";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4">
      <h2 className="border-b border-dourado-300 pb-2 font-semibold text-marinho-800">{title}</h2>
      {children}
    </section>
  );
}

export default async function MyPlatformAccountPage() {
  const user = await requirePlatformUser();
  const me = await prisma.platformUser.findUniqueOrThrow({ where: { id: user.id }, omit: withSecrets });
  // QR code só enquanto a pessoa está ativando (segredo gerado, ainda desligado).
  const setupSecret = me.totpSecret && !me.totpEnabledAt ? open(me.totpSecret) : null;
  const qr = setupSecret ? await QRCode.toDataURL(totpUri(setupSecret, me.email, "Painel do dono"), { margin: 1, width: 200 }) : null;

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-marinho-800">Minha conta</h1>
        <p className="text-sm text-slate-600">
          {me.name} · {me.email} · {me.owner ? "Dono" : "Equipe"}
          {me.lastLoginAt && <> · último acesso {formatDateTime(me.lastLoginAt)}</>}
        </p>
      </div>

      <Section title="Trocar senha">
        <ActionForm action={changePlatformPassword} submitLabel="Trocar senha" className="space-y-4">
          <PasswordFields />
        </ActionForm>
      </Section>

      <Section title="Verificação em duas etapas">
        <p className="text-sm text-slate-700">
          Muito recomendada aqui, porque o painel controla todas as instituições. Além da senha, o painel pede um código de 6 números
          que muda a cada 30 segundos no app do seu celular (Google Authenticator, Microsoft Authenticator ou similar).
        </p>
        {me.totpEnabledAt ? (
          <>
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Ligada desde {formatDateTime(me.totpEnabledAt)}. Códigos de recuperação sem usar: {me.totpRecoveryCodes.length}.
            </p>
            <ActionForm action={disablePlatformTwoFactor} submitLabel="Desligar verificação em duas etapas" className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label" htmlFor="disable-current">Sua senha</label>
                <input className="input" id="disable-current" name="current" type="password" autoComplete="current-password" required />
              </div>
            </ActionForm>
          </>
        ) : qr ? (
          <div className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
              <li>Instale no celular o Google Authenticator (ou outro app de códigos).</li>
              <li>No app, toque em &quot;+&quot; e depois em &quot;Ler código QR&quot;, e aponte para a imagem abaixo.</li>
              <li>Digite o código de 6 números que aparecer no app.</li>
            </ol>
            <div className="flex flex-wrap items-center gap-6">
              {/* eslint-disable-next-line @next/next/no-img-element -- QR gerado na hora como data URL */}
              <img src={qr} alt="QR code para o app de códigos" width={200} height={200} className="rounded border border-slate-200" />
              <p className="max-w-xs text-xs text-slate-500">
                Não consegue ler o QR? No app, escolha &quot;Inserir chave&quot; e digite: <span className="break-all font-mono text-slate-700">{setupSecret}</span>
              </p>
            </div>
            <PlatformTwoFactorConfirm />
            <form action={cancelPlatformTwoFactor}><button className="text-sm text-marinho-700 hover:underline">Cancelar</button></form>
          </div>
        ) : (
          <form action={startPlatformTwoFactor}><button className="btn-primary">Ativar verificação em duas etapas</button></form>
        )}
      </Section>
    </div>
  );
}
