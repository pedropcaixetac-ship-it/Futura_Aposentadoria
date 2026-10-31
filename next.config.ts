import type { NextConfig } from "next";

// Proteções que o navegador aplica em todas as páginas do sistema.
const securityHeaders = [
  // Só abre por conexão segura (https) durante 1 ano.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // Outro site não consegue mostrar o sistema dentro de uma moldura para enganar quem clica.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  // O navegador não "adivinha" o tipo de um arquivo (evita PDF ou imagem virar página com código).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Ao sair para outro site, não leva o endereço da página (que pode ter o link da teleconsulta).
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Formulários oficiais em branco dos laudos do SUS, lidos ao gerar o PDF (ver src/lib/laudo-pdf.ts).
  outputFileTracingIncludes: { "/**": ["./src/lib/laudos-modelos/*.pdf"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
