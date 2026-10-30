import type { Instrumentation } from "next";

// Todo erro que acontece no servidor (tela, ação de formulário, endereço da API) fica registrado
// em "Problemas" no Painel do dono, com a tela, a clínica e quem estava usando.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordError, sessionOwner } = await import("./lib/problems");
  const err = error instanceof Error ? error : new Error(String(error));
  const cookie = request.headers.cookie;
  const owner = await sessionOwner(Array.isArray(cookie) ? cookie.join("; ") : cookie);
  await recordError({
    message: err.message,
    page: request.path,
    digest: (err as Error & { digest?: string }).digest ?? null,
    details: [`${request.method} ${context.routePath} (${context.routerKind}, ${context.routeType})`, err.stack]
      .filter(Boolean)
      .join("\n"),
    ...owner,
  });
};
