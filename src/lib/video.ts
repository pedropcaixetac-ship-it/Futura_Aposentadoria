// Chamada de vídeo da teleconsulta, fornecida pela Daily (daily.co).
// Tudo que depende da Daily fica neste arquivo, para que trocar de empresa
// no futuro mexa só aqui.

const API = "https://api.daily.co/v1";

export function videoConfigured() {
  return !!process.env.DAILY_API_KEY;
}

async function daily(path: string, init: RequestInit = {}) {
  const key = process.env.DAILY_API_KEY;
  if (!key) throw new Error("Teleconsulta não configurada: falta a chave DAILY_API_KEY");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  if (!res.ok && !(init.method === "DELETE" && res.status === 404)) {
    throw new Error(`Falha na Daily (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

// Sala privada: só entra quem recebe um passe (token) gerado pelo sistema.
// Sem gravação, e a sala some sozinha quando o prazo do link termina.
export async function createRoom(name: string, expiresAt: Date): Promise<{ name: string; url: string }> {
  const room = await daily("/rooms", {
    method: "POST",
    body: JSON.stringify({
      name,
      privacy: "private",
      properties: {
        exp: Math.floor(expiresAt.getTime() / 1000),
        eject_at_room_exp: true,
        enable_prejoin_ui: true,
        enable_chat: true,
        enable_recording: false,
        max_participants: 4,
      },
    }),
  });
  return { name: room.name, url: room.url };
}

export async function deleteRoom(name: string) {
  await daily(`/rooms/${encodeURIComponent(name)}`, { method: "DELETE" });
}

// Endereço para abrir a chamada já com o passe de entrada.
// O profissional entra como "dono" da sala; o passe vale por poucas horas.
export async function joinUrl(room: { name: string; url: string }, userName: string, isOwner: boolean) {
  const { token } = await daily("/meeting-tokens", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        room_name: room.name,
        user_name: userName,
        is_owner: isOwner,
        lang: "pt-BR",
        exp: Math.floor(Date.now() / 1000) + 4 * 3600,
      },
    }),
  });
  return `${room.url}?t=${token}`;
}
