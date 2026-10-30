import { headers } from "next/headers";
import { prisma } from "./db";
import { createRoom } from "./video";

// Endereço do site (ex.: https://minhaclinica.vercel.app), para montar o link do paciente.
export async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// Cria a sala de vídeo na primeira vez que alguém entra e reaproveita depois.
export async function ensureRoom(t: { id: string; roomName: string | null; roomUrl: string | null; expiresAt: Date }) {
  if (t.roomName && t.roomUrl) return { name: t.roomName, url: t.roomUrl };
  const room = await createRoom(`tc-${t.id}`, t.expiresAt);
  // Se o profissional e o paciente entrarem ao mesmo tempo, fica valendo a primeira sala gravada.
  await prisma.teleconsultation.updateMany({
    where: { id: t.id, roomName: null },
    data: { roomName: room.name, roomUrl: room.url },
  });
  const saved = await prisma.teleconsultation.findUniqueOrThrow({ where: { id: t.id } });
  return { name: saved.roomName!, url: saved.roomUrl! };
}
