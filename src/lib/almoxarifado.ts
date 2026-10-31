// Almoxarifado do hospital: material que não é da farmácia (limpeza, escritório, rouparia, manutenção...).

export const SUPPLY_CATEGORIES = ["Limpeza e higiene", "Escritório", "Rouparia", "Descartáveis", "Manutenção", "Copa", "Outros"];

export const SUPPLY_UNITS = ["unidade", "caixa", "pacote", "rolo", "litro", "galão", "kg", "peça", "par", "resma"];

// Setores que pedem material e abrem chamados.
export const HOSPITAL_SECTORS = [
  "Pronto-socorro",
  "Internação",
  "Enfermaria",
  "UTI",
  "Centro cirúrgico",
  "CME",
  "Farmácia",
  "Laboratório",
  "Imagem",
  "Quimioterapia",
  "Cozinha",
  "Ambulatório",
  "Recepção",
  "Administração",
  "Higiene e limpeza",
  "Rouparia",
  "Manutenção",
];

export const supplyMovementLabel: Record<string, string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída para setor",
  AJUSTE: "Ajuste de contagem",
  PERDA: "Perda",
};

export const supplyRequestStatusLabel: Record<string, string> = {
  ABERTA: "Aguardando",
  ATENDIDA: "Entregue",
  CANCELADA: "Cancelado",
};

export function supplyBalance(movements: { quantity: number }[]) {
  return movements.reduce((sum, m) => sum + m.quantity, 0);
}

// Quanto entregar de cada item: o pedido, limitado ao que há no estoque.
export function deliverable(requested: number, balance: number) {
  return Math.max(0, Math.min(requested, balance));
}

// Linhas do formulário de pedido: item0/quantidade0, item1/quantidade1...
// Devolve os itens pedidos ou a mensagem de erro.
export function parseRequestLines(entries: { itemId: string; quantity: string }[]): { itemId: string; quantity: number }[] | string {
  const lines: { itemId: string; quantity: number }[] = [];
  for (const e of entries) {
    if (!e.itemId) continue;
    const q = Number(e.quantity);
    if (!Number.isInteger(q) || q <= 0 || q > 10_000) return "Informe a quantidade de cada item pedido.";
    if (lines.some((l) => l.itemId === e.itemId)) return "O mesmo item apareceu duas vezes no pedido. Junte numa linha só.";
    lines.push({ itemId: e.itemId, quantity: q });
  }
  return lines.length ? lines : "Escolha pelo menos um item.";
}
