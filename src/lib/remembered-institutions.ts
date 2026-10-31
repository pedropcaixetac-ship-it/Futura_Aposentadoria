// Instituições em que alguém já entrou neste aparelho, para escolher no login sem digitar o código.
// Fica só no navegador; a tela de login não mostra a lista de clientes para quem é de fora.
export type RememberedInstitution = { code: string; name: string };

const KEY = "instituicoes";
const MAX = 10;

export function readInstitutions(): RememberedInstitution[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((i) => typeof i?.code === "string" && typeof i?.name === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

// A última usada fica em primeiro.
export function rememberInstitution(item: RememberedInstitution) {
  try {
    const list = [item, ...readInstitutions().filter((i) => i.code !== item.code)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // navegador sem armazenamento (janela anônima): o login continua pelo código
  }
}
