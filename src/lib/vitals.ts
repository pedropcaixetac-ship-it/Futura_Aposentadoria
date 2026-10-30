// Sinais vitais registrados no atendimento.

export const vitalFields = [
  { key: "pas", short: "PAS", label: "PA sistólica", unit: "mmHg", min: 40, max: 300 },
  { key: "pad", short: "PAD", label: "PA diastólica", unit: "mmHg", min: 20, max: 200 },
  { key: "fc", short: "FC", label: "Freq. cardíaca", unit: "bpm", min: 20, max: 250 },
  { key: "fr", short: "FR", label: "Freq. respiratória", unit: "irpm", min: 4, max: 80 },
  { key: "temp", short: "Temp.", label: "Temperatura", unit: "°C", min: 30, max: 45 },
  { key: "spo2", short: "SpO₂", label: "Saturação O₂", unit: "%", min: 50, max: 100 },
  { key: "peso", short: "Peso", label: "Peso", unit: "kg", min: 0.3, max: 400 },
  { key: "altura", short: "Altura", label: "Altura", unit: "cm", min: 30, max: 250 },
  { key: "glicemia", short: "Glicemia", label: "Glicemia capilar", unit: "mg/dL", min: 10, max: 1000 },
] as const;

export type VitalKey = (typeof vitalFields)[number]["key"];
export type Vitals = Partial<Record<VitalKey, number>>;

function toNumber(raw: unknown) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Lê os sinais do formulário, descartando valores vazios ou impossíveis.
export function parseVitals(formData: FormData): Vitals | null {
  const vitals: Vitals = {};
  for (const f of vitalFields) {
    const n = toNumber(formData.get(`vital_${f.key}`));
    if (n !== null && n >= f.min && n <= f.max) vitals[f.key] = n;
  }
  return Object.keys(vitals).length ? vitals : null;
}

export function bmi(vitals: Vitals | null | undefined) {
  if (!vitals?.peso || !vitals.altura) return null;
  const m = vitals.altura / 100;
  return Math.round((vitals.peso / (m * m)) * 10) / 10;
}

export function bmiLabel(value: number) {
  if (value < 18.5) return "Abaixo do peso";
  if (value < 25) return "Peso adequado";
  if (value < 30) return "Sobrepeso";
  if (value < 35) return "Obesidade grau I";
  if (value < 40) return "Obesidade grau II";
  return "Obesidade grau III";
}

// Texto curto para o histórico e para o PDF: "PA 120x80 mmHg · FC 72 bpm · IMC 24,1".
export function vitalsSummary(vitals: Vitals | null | undefined) {
  if (!vitals) return "";
  const parts: string[] = [];
  const pa = vitals.pas !== undefined && vitals.pad !== undefined;
  if (pa) parts.push(`PA ${vitals.pas}x${vitals.pad} mmHg`);
  for (const f of vitalFields) {
    const v = vitals[f.key];
    if (v === undefined || (pa && (f.key === "pas" || f.key === "pad"))) continue;
    parts.push(`${f.short} ${v.toLocaleString("pt-BR")} ${f.unit}`);
  }
  const imc = bmi(vitals);
  if (imc) parts.push(`IMC ${imc.toLocaleString("pt-BR")}`);
  return parts.join(" · ");
}
