import { redirect } from "next/navigation";

// O certificado digital agora fica em "Meu cadastro".
export default function SignatureSettingsPage() {
  redirect("/meu-cadastro#certificado");
}
