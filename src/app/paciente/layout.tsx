import type { Metadata } from "next";

// O aplicativo do paciente tem nome e ícone próprios: instalado a partir daqui, abre direto em "Minhas consultas".
export const metadata: Metadata = {
  title: "Minhas consultas",
  manifest: "/paciente/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Minhas consultas", statusBarStyle: "black" },
  robots: { index: false, follow: false },
};

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-screen flex-col bg-marinho-900">{children}</main>;
}
