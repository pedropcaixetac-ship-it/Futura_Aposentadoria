// Manifest do aplicativo do paciente (o da equipe fica em src/app/manifest.ts).
export function GET() {
  return Response.json(
    {
      name: "Minhas consultas",
      short_name: "Consultas",
      description: "Suas consultas na clínica",
      lang: "pt-BR",
      id: "/paciente",
      start_url: "/paciente",
      scope: "/paciente",
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
