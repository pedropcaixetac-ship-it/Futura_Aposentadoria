// Dinheiro é guardado em centavos (número inteiro) para não haver erro de arredondamento.

export function formatMoney(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Aceita "150", "150,5", "1.250,00" ou "R$ 1.250,00". Devolve null se não for um valor válido.
export function parseMoney(input: string): number | null {
  const clean = input.replace(/R\$|\s/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(clean)) return null;
  const [reais, centavos = ""] = clean.replace(/\./g, "").split(",");
  return Number(reais) * 100 + Number(centavos.padEnd(2, "0"));
}

// Valor em reais no formato do campo de digitação (ex.: 1250,00).
export function moneyInput(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

const unidades = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ate999(n: number): string {
  if (n === 100) return "cem";
  const partes: string[] = [];
  if (n >= 100) partes.push(centenas[Math.floor(n / 100)]);
  const resto = n % 100;
  if (resto >= 20) {
    partes.push(dezenas[Math.floor(resto / 10)]);
    if (resto % 10) partes.push(unidades[resto % 10]);
  } else if (resto > 0) {
    partes.push(unidades[resto]);
  }
  return partes.join(" e ");
}

function inteiroPorExtenso(n: number): string {
  if (n === 0) return "zero";
  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const grupos: string[] = [];
  if (milhoes) grupos.push(milhoes === 1 ? "um milhão" : `${ate999(milhoes)} milhões`);
  if (milhares) grupos.push(milhares === 1 ? "mil" : `${ate999(milhares)} mil`);
  if (resto) grupos.push(ate999(resto));
  // "mil e cem", "mil duzentos e trinta": o "e" só entra antes do último grupo quando ele é "redondo" ou menor que 100.
  if (grupos.length > 1 && resto && (resto < 100 || resto % 100 === 0)) {
    return `${grupos.slice(0, -1).join(", ")} e ${grupos[grupos.length - 1]}`;
  }
  return grupos.join(", ").replace(/, (?=[^,]*$)/, " ");
}

// Valor por extenso, como se escreve em recibo: "cento e cinquenta reais e trinta centavos".
export function moneyInWords(cents: number) {
  const reais = Math.floor(cents / 100);
  const centavos = cents % 100;
  const partes: string[] = [];
  if (reais) {
    const deReais = reais % 1_000_000 === 0 ? " de reais" : reais === 1 ? " real" : " reais";
    partes.push(inteiroPorExtenso(reais) + deReais);
  }
  if (centavos) partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  return partes.length ? partes.join(" e ") : "zero real";
}
