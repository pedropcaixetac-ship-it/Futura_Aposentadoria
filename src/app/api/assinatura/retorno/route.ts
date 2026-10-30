import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { discoverCertificate, exchangeCode } from "@/lib/signature/providers";
import { signTarget } from "@/lib/signature/service";
import { redirectUri, takePending } from "@/lib/signature/flow";
import { seal } from "@/lib/signature/secret-box";

// O app do certificado devolve o profissional para cá depois que ele autoriza.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const url = new URL(request.url);
  const pending = await takePending(url.searchParams.get("state"));
  if (!pending) return new NextResponse("Pedido de assinatura expirado. Volte e clique em Assinar de novo.", { status: 400 });

  const back = pending.back;
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL(`${back}?assinatura=cancelada`, request.url));

  try {
    const token = await exchangeCode(pending.provider, { code, redirectUri: await redirectUri(), codeVerifier: pending.verifier });
    const certificate = await discoverCertificate(pending.provider, token.accessToken);
    const data = {
      accessToken: seal(token.accessToken),
      certificateAlias: certificate.alias,
      certificateChain: certificate.chain.map((c) => c.toString("base64")).join(","),
      expiresAt: new Date(Date.now() + token.expiresIn * 1000),
    };
    await prisma.signatureSession.upsert({
      where: { userId_provider: { userId: user.id, provider: pending.provider } },
      create: { userId: user.id, provider: pending.provider, ...data },
      update: data,
    });
    for (const target of pending.targets) await signTarget(user, target, pending.provider);
  } catch (error) {
    console.error("Falha na assinatura", error);
    return NextResponse.redirect(new URL(`${back}?assinatura=erro`, request.url));
  }
  return NextResponse.redirect(new URL(back, request.url));
}
