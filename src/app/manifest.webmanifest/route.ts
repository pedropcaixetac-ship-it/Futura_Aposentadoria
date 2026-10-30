// Deixa o sistema "instalável": no celular, "Adicionar à tela inicial" cria um ícone que abre em tela cheia,
// sem a barra do navegador, como se fosse um aplicativo.
// O aplicativo do paciente tem o próprio, em /paciente/manifest.webmanifest.
export function GET() {
  return Response.json(
    {
      name: "Prontuário Eletrônico",
      short_name: "Prontuário",
      description: "Prontuário eletrônico e gestão de clínicas",
      lang: "pt-BR",
      id: "/",
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#0b1c38",
      theme_color: "#0b1c38",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
