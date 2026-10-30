import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prontuário Eletrônico",
  description: "Prontuário eletrônico e gestão de clínicas",
  applicationName: "Prontuário",
  manifest: "/manifest.webmanifest",
  // No iPhone o ícone e o nome vêm daqui, e não do manifest.
  appleWebApp: { capable: true, title: "Prontuário", statusBarStyle: "black" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

// Cor da barra do celular (azul-marinho).
export const viewport: Viewport = {
  themeColor: "#0b1c38",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
