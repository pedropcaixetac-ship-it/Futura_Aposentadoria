// Lista de medicamentos comuns para a busca enquanto o médico digita a prescrição.
// Não é uma bula: serve só para sugerir o nome e a apresentação. O médico pode
// sempre escrever outro medicamento à mão.

export type Medication = {
  name: string;
  presentation: string;
  // Via mais comum, usando os mesmos nomes da lista ROUTES da prescrição.
  route: string;
  // Verdadeiro quando o item vem do estoque da farmácia do próprio hospital.
  inPharmacy?: boolean;
};

const O = "Oral";
const EV = "Endovenosa (EV)";
const IM = "Intramuscular (IM)";
const SC = "Subcutânea (SC)";
const SL = "Sublingual (SL)";
const INAL = "Inalatória";
const TOP = "Tópica";
const RET = "Retal";

const LIST: [string, string, string][] = [
  // Dor e febre
  ["Dipirona", "500 mg comprimido", O],
  ["Dipirona", "500 mg/mL gotas", O],
  ["Dipirona", "500 mg/mL ampola 2 mL", EV],
  ["Paracetamol", "500 mg comprimido", O],
  ["Paracetamol", "750 mg comprimido", O],
  ["Paracetamol", "200 mg/mL gotas", O],
  ["Ibuprofeno", "400 mg comprimido", O],
  ["Ibuprofeno", "600 mg comprimido", O],
  ["Ibuprofeno", "50 mg/mL gotas", O],
  ["Cetoprofeno", "100 mg ampola", EV],
  ["Cetoprofeno", "100 mg comprimido", O],
  ["Diclofenaco de sódio", "50 mg comprimido", O],
  ["Diclofenaco de sódio", "75 mg/3 mL ampola", IM],
  ["Nimesulida", "100 mg comprimido", O],
  ["Naproxeno", "500 mg comprimido", O],
  ["Cetorolaco", "10 mg comprimido sublingual", SL],
  ["Cetorolaco", "30 mg/mL ampola", EV],
  ["Tenoxicam", "20 mg ampola", EV],
  ["Tramadol", "50 mg cápsula", O],
  ["Tramadol", "50 mg/mL ampola 2 mL", EV],
  ["Codeína + paracetamol", "30 mg + 500 mg comprimido", O],
  ["Morfina", "10 mg/mL ampola", EV],
  ["Morfina", "10 mg comprimido", O],
  ["Fentanil", "50 mcg/mL ampola", EV],
  ["Metadona", "10 mg comprimido", O],
  ["Escopolamina (butilbrometo)", "10 mg comprimido", O],
  ["Escopolamina + dipirona", "20 mg + 2,5 g ampola 5 mL", EV],
  // Antibióticos
  ["Amoxicilina", "500 mg cápsula", O],
  ["Amoxicilina", "250 mg/5 mL suspensão", O],
  ["Amoxicilina + clavulanato", "875 mg + 125 mg comprimido", O],
  ["Amoxicilina + clavulanato", "1 g + 200 mg frasco-ampola", EV],
  ["Azitromicina", "500 mg comprimido", O],
  ["Azitromicina", "200 mg/5 mL suspensão", O],
  ["Azitromicina", "500 mg frasco-ampola", EV],
  ["Claritromicina", "500 mg comprimido", O],
  ["Cefalexina", "500 mg cápsula", O],
  ["Cefalexina", "250 mg/5 mL suspensão", O],
  ["Cefazolina", "1 g frasco-ampola", EV],
  ["Ceftriaxona", "1 g frasco-ampola", EV],
  ["Cefepima", "1 g frasco-ampola", EV],
  ["Ciprofloxacino", "500 mg comprimido", O],
  ["Ciprofloxacino", "2 mg/mL bolsa 200 mL", EV],
  ["Levofloxacino", "500 mg comprimido", O],
  ["Levofloxacino", "5 mg/mL bolsa 100 mL", EV],
  ["Sulfametoxazol + trimetoprima", "800 mg + 160 mg comprimido", O],
  ["Nitrofurantoína", "100 mg cápsula", O],
  ["Fosfomicina", "3 g sachê", O],
  ["Metronidazol", "250 mg comprimido", O],
  ["Metronidazol", "5 mg/mL bolsa 100 mL", EV],
  ["Clindamicina", "300 mg cápsula", O],
  ["Clindamicina", "150 mg/mL ampola 4 mL", EV],
  ["Doxiciclina", "100 mg comprimido", O],
  ["Penicilina G benzatina", "1.200.000 UI frasco-ampola", IM],
  ["Oxacilina", "500 mg frasco-ampola", EV],
  ["Piperacilina + tazobactam", "4 g + 500 mg frasco-ampola", EV],
  ["Meropenem", "1 g frasco-ampola", EV],
  ["Vancomicina", "500 mg frasco-ampola", EV],
  ["Gentamicina", "80 mg/2 mL ampola", EV],
  ["Amicacina", "500 mg/2 mL ampola", EV],
  // Antifúngicos, antivirais e vermífugos
  ["Fluconazol", "150 mg cápsula", O],
  ["Fluconazol", "2 mg/mL bolsa 100 mL", EV],
  ["Nistatina", "100.000 UI/mL suspensão", O],
  ["Aciclovir", "400 mg comprimido", O],
  ["Aciclovir", "250 mg frasco-ampola", EV],
  ["Oseltamivir", "75 mg cápsula", O],
  ["Albendazol", "400 mg comprimido", O],
  ["Ivermectina", "6 mg comprimido", O],
  // Estômago e intestino
  ["Omeprazol", "20 mg cápsula", O],
  ["Omeprazol", "40 mg frasco-ampola", EV],
  ["Pantoprazol", "40 mg comprimido", O],
  ["Pantoprazol", "40 mg frasco-ampola", EV],
  ["Esomeprazol", "40 mg comprimido", O],
  ["Ondansetrona", "4 mg comprimido", O],
  ["Ondansetrona", "8 mg comprimido", O],
  ["Ondansetrona", "2 mg/mL ampola 4 mL", EV],
  ["Metoclopramida", "10 mg comprimido", O],
  ["Metoclopramida", "5 mg/mL ampola 2 mL", EV],
  ["Bromoprida", "10 mg cápsula", O],
  ["Bromoprida", "5 mg/mL ampola 2 mL", EV],
  ["Dimenidrinato", "50 mg comprimido", O],
  ["Dimenidrinato + piridoxina", "ampola 10 mL", EV],
  ["Simeticona", "75 mg/mL gotas", O],
  ["Hidróxido de alumínio", "suspensão", O],
  ["Lactulose", "667 mg/mL xarope", O],
  ["Bisacodil", "5 mg comprimido", O],
  ["Óleo mineral", "frasco", O],
  ["Loperamida", "2 mg comprimido", O],
  ["Sais para reidratação oral", "sachê", O],
  ["Racecadotrila", "100 mg cápsula", O],
  // Coração e pressão
  ["Losartana", "50 mg comprimido", O],
  ["Enalapril", "10 mg comprimido", O],
  ["Enalapril", "20 mg comprimido", O],
  ["Captopril", "25 mg comprimido", O],
  ["Anlodipino", "5 mg comprimido", O],
  ["Anlodipino", "10 mg comprimido", O],
  ["Hidroclorotiazida", "25 mg comprimido", O],
  ["Clortalidona", "25 mg comprimido", O],
  ["Furosemida", "40 mg comprimido", O],
  ["Furosemida", "10 mg/mL ampola 2 mL", EV],
  ["Espironolactona", "25 mg comprimido", O],
  ["Atenolol", "50 mg comprimido", O],
  ["Propranolol", "40 mg comprimido", O],
  ["Carvedilol", "6,25 mg comprimido", O],
  ["Carvedilol", "25 mg comprimido", O],
  ["Metoprolol (succinato)", "50 mg comprimido", O],
  ["Metoprolol (tartarato)", "5 mg/5 mL ampola", EV],
  ["Hidralazina", "25 mg comprimido", O],
  ["Hidralazina", "20 mg/mL ampola", EV],
  ["Nitroglicerina", "5 mg/mL ampola 10 mL", EV],
  ["Dinitrato de isossorbida", "5 mg comprimido sublingual", SL],
  ["Nitroprussiato de sódio", "50 mg/2 mL ampola", EV],
  ["Amiodarona", "200 mg comprimido", O],
  ["Amiodarona", "50 mg/mL ampola 3 mL", EV],
  ["Digoxina", "0,25 mg comprimido", O],
  ["Ácido acetilsalicílico (AAS)", "100 mg comprimido", O],
  ["Clopidogrel", "75 mg comprimido", O],
  ["Sinvastatina", "20 mg comprimido", O],
  ["Sinvastatina", "40 mg comprimido", O],
  ["Atorvastatina", "20 mg comprimido", O],
  ["Atorvastatina", "40 mg comprimido", O],
  ["Rosuvastatina", "10 mg comprimido", O],
  ["Varfarina", "5 mg comprimido", O],
  ["Rivaroxabana", "20 mg comprimido", O],
  ["Apixabana", "5 mg comprimido", O],
  ["Enoxaparina", "40 mg seringa", SC],
  ["Enoxaparina", "60 mg seringa", SC],
  ["Heparina", "5.000 UI/0,25 mL ampola", SC],
  ["Heparina", "5.000 UI/mL frasco 5 mL", EV],
  // Diabetes e tireoide
  ["Metformina", "500 mg comprimido", O],
  ["Metformina", "850 mg comprimido", O],
  ["Glibenclamida", "5 mg comprimido", O],
  ["Gliclazida", "30 mg comprimido", O],
  ["Insulina NPH", "100 UI/mL frasco", SC],
  ["Insulina regular", "100 UI/mL frasco", SC],
  ["Insulina glargina", "100 UI/mL caneta", SC],
  ["Glicose 50%", "ampola 10 mL", EV],
  ["Levotiroxina", "50 mcg comprimido", O],
  ["Levotiroxina", "100 mcg comprimido", O],
  // Pulmão e alergia
  ["Salbutamol", "100 mcg spray", INAL],
  ["Fenoterol", "5 mg/mL gotas para nebulização", INAL],
  ["Brometo de ipratrópio", "0,25 mg/mL gotas para nebulização", INAL],
  ["Budesonida", "32 mcg spray nasal", INAL],
  ["Beclometasona", "250 mcg spray", INAL],
  ["Formoterol + budesonida", "6/200 mcg cápsula inalatória", INAL],
  ["Prednisona", "20 mg comprimido", O],
  ["Prednisona", "5 mg comprimido", O],
  ["Prednisolona", "3 mg/mL solução oral", O],
  ["Dexametasona", "4 mg comprimido", O],
  ["Dexametasona", "4 mg/mL ampola 2,5 mL", EV],
  ["Hidrocortisona", "100 mg frasco-ampola", EV],
  ["Hidrocortisona", "500 mg frasco-ampola", EV],
  ["Metilprednisolona", "500 mg frasco-ampola", EV],
  ["Loratadina", "10 mg comprimido", O],
  ["Desloratadina", "5 mg comprimido", O],
  ["Cetirizina", "10 mg comprimido", O],
  ["Dexclorfeniramina", "2 mg comprimido", O],
  ["Dexclorfeniramina", "0,4 mg/mL xarope", O],
  ["Prometazina", "25 mg comprimido", O],
  ["Prometazina", "25 mg/mL ampola 2 mL", IM],
  ["Hidroxizina", "25 mg comprimido", O],
  ["Adrenalina (epinefrina)", "1 mg/mL ampola", IM],
  ["Acetilcisteína", "600 mg envelope", O],
  ["Ambroxol", "30 mg/5 mL xarope", O],
  ["Montelucaste", "10 mg comprimido", O],
  // Sistema nervoso e saúde mental
  ["Diazepam", "10 mg comprimido", O],
  ["Diazepam", "5 mg/mL ampola 2 mL", EV],
  ["Clonazepam", "2 mg comprimido", O],
  ["Clonazepam", "2,5 mg/mL gotas", O],
  ["Alprazolam", "0,5 mg comprimido", O],
  ["Midazolam", "5 mg/mL ampola 3 mL", EV],
  ["Midazolam", "15 mg comprimido", O],
  ["Haloperidol", "5 mg comprimido", O],
  ["Haloperidol", "5 mg/mL ampola", IM],
  ["Risperidona", "2 mg comprimido", O],
  ["Quetiapina", "25 mg comprimido", O],
  ["Olanzapina", "10 mg comprimido", O],
  ["Fluoxetina", "20 mg cápsula", O],
  ["Sertralina", "50 mg comprimido", O],
  ["Escitalopram", "10 mg comprimido", O],
  ["Amitriptilina", "25 mg comprimido", O],
  ["Bupropiona", "150 mg comprimido", O],
  ["Carbonato de lítio", "300 mg comprimido", O],
  ["Fenitoína", "100 mg comprimido", O],
  ["Fenitoína", "50 mg/mL ampola 5 mL", EV],
  ["Ácido valproico", "500 mg comprimido", O],
  ["Carbamazepina", "200 mg comprimido", O],
  ["Fenobarbital", "100 mg comprimido", O],
  ["Gabapentina", "300 mg cápsula", O],
  ["Pregabalina", "75 mg cápsula", O],
  ["Zolpidem", "10 mg comprimido", O],
  ["Ciclobenzaprina", "10 mg comprimido", O],
  ["Orfenadrina + dipirona + cafeína", "comprimido", O],
  ["Sumatriptana", "50 mg comprimido", O],
  // Soros e eletrólitos
  ["Soro fisiológico 0,9%", "frasco 500 mL", EV],
  ["Soro fisiológico 0,9%", "frasco 1.000 mL", EV],
  ["Soro glicosado 5%", "frasco 500 mL", EV],
  ["Soro glicosado 5%", "frasco 1.000 mL", EV],
  ["Ringer lactato", "frasco 500 mL", EV],
  ["Cloreto de potássio 19,1%", "ampola 10 mL", EV],
  ["Cloreto de sódio 20%", "ampola 10 mL", EV],
  ["Gluconato de cálcio 10%", "ampola 10 mL", EV],
  ["Sulfato de magnésio 50%", "ampola 10 mL", EV],
  ["Bicarbonato de sódio 8,4%", "ampola 10 mL", EV],
  ["Água destilada", "ampola 10 mL", EV],
  // Urgência e anestesia
  ["Atropina", "0,25 mg/mL ampola", EV],
  ["Noradrenalina", "2 mg/mL ampola 4 mL", EV],
  ["Dobutamina", "12,5 mg/mL ampola 20 mL", EV],
  ["Dopamina", "5 mg/mL ampola 10 mL", EV],
  ["Naloxona", "0,4 mg/mL ampola", EV],
  ["Flumazenil", "0,1 mg/mL ampola 5 mL", EV],
  ["Propofol", "10 mg/mL ampola 20 mL", EV],
  ["Cetamina", "50 mg/mL frasco 10 mL", EV],
  ["Lidocaína 2%", "sem vasoconstritor frasco 20 mL", "Outra"],
  ["Lidocaína", "gel 2%", TOP],
  ["Ácido tranexâmico", "50 mg/mL ampola 5 mL", EV],
  ["Vitamina K (fitomenadiona)", "10 mg/mL ampola", IM],
  ["Tiamina (vitamina B1)", "100 mg/mL ampola", IM],
  // Vitaminas e outros
  ["Sulfato ferroso", "40 mg de ferro comprimido", O],
  ["Ácido fólico", "5 mg comprimido", O],
  ["Vitamina D (colecalciferol)", "7.000 UI comprimido", O],
  ["Complexo B", "comprimido", O],
  ["Carbonato de cálcio", "500 mg comprimido", O],
  ["Alopurinol", "100 mg comprimido", O],
  ["Colchicina", "0,5 mg comprimido", O],
  ["Tansulosina", "0,4 mg cápsula", O],
  ["Finasterida", "5 mg comprimido", O],
  ["Sildenafila", "50 mg comprimido", O],
  ["Anticoncepcional (levonorgestrel + etinilestradiol)", "0,15 + 0,03 mg comprimido", O],
  ["Misoprostol", "25 mcg comprimido", "Outra"],
  ["Ocitocina", "5 UI/mL ampola", EV],
  // Pele e uso local
  ["Dexametasona", "creme 0,1%", TOP],
  ["Hidrocortisona", "creme 1%", TOP],
  ["Betametasona", "creme 0,05%", TOP],
  ["Cetoconazol", "creme 2%", TOP],
  ["Miconazol", "creme vaginal 2%", "Outra"],
  ["Nitrato de miconazol", "creme 2%", TOP],
  ["Neomicina + bacitracina", "pomada", TOP],
  ["Mupirocina", "pomada 2%", TOP],
  ["Sulfadiazina de prata", "creme 1%", TOP],
  ["Permetrina", "loção 5%", TOP],
  ["Colírio de tobramicina", "0,3% frasco", "Outra"],
  ["Glicerina", "supositório", RET],
  ["Fleet enema", "frasco 130 mL", RET],
];

export const MEDICATIONS: Medication[] = LIST.map(([name, presentation, route]) => ({ name, presentation, route }));

// Tira acentos e deixa minúsculo, para "dipirona" achar "Dipirona" e "acido" achar "Ácido".
export function normalizeText(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// O texto que vai para a prescrição: nome e apresentação juntos.
export function medicationLabel(m: Pick<Medication, "name" | "presentation">) {
  return [m.name, m.presentation].filter(Boolean).join(" ").trim();
}

// Procura pelo começo de cada palavra digitada, sem ligar para acentos.
// "dipi 500" acha "Dipirona 500 mg comprimido"; "clav" acha "Amoxicilina + clavulanato".
// Os itens da farmácia do hospital vêm primeiro; depois a lista comum, sem repetir.
export function searchMedications(query: string, pharmacy: Medication[] = [], limit = 12): Medication[] {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0 || normalizeText(query).length < 2) return [];

  const score = (m: Medication) => {
    const name = normalizeText(m.name);
    const text = normalizeText(medicationLabel(m));
    const tokens = text.split(/[\s+/(),-]+/).filter(Boolean);
    if (!words.every((w) => tokens.some((t) => t.startsWith(w)) || text.includes(w))) return -1;
    // Quem começa pelo que foi digitado aparece antes.
    return name.startsWith(words[0]) ? 0 : 1;
  };

  const seen = new Set<string>();
  const results: { m: Medication; s: number; order: number }[] = [];
  // Item da farmácia sem via: usa a via do mesmo medicamento na lista comum.
  const withRoute = (m: Medication): Medication => {
    if (m.route) return m;
    const label = normalizeText(medicationLabel(m));
    const same = MEDICATIONS.find((c) => normalizeText(medicationLabel(c)) === label);
    return { ...m, route: same?.route ?? "" };
  };
  [...pharmacy.map((m) => ({ ...withRoute(m), inPharmacy: true })), ...MEDICATIONS].forEach((m, order) => {
    const key = normalizeText(medicationLabel(m));
    if (seen.has(key)) return;
    const s = score(m);
    if (s < 0) return;
    seen.add(key);
    results.push({ m, s: s + (m.inPharmacy ? -10 : 0), order });
  });

  return results
    .sort((a, b) => a.s - b.s || a.order - b.order)
    .slice(0, limit)
    .map((r) => r.m);
}

// Coloca o medicamento escolhido como próximo item da receita da clínica.
// Se o último item ainda está vazio ("1. "), preenche ele; senão cria o item seguinte.
// Deixa uma linha recuada embaixo para o médico escrever como tomar.
export function addToPrescription(body: string, m: Pick<Medication, "name" | "presentation">) {
  const label = medicationLabel(m);
  const numbers = [...body.matchAll(/^\s*(\d+)\.\s/gm)].map((x) => Number(x[1]));
  const emptyLast = body.match(/(^|\n)(\d+)\.\s*$/);
  if (emptyLast) return `${body.replace(/(\d+)\.\s*$/, `$1. ${label}`)}\n   `;
  const next = numbers.length ? Math.max(...numbers) + 1 : 1;
  const base = body.replace(/\s+$/, "");
  return `${base}${base ? "\n\n" : ""}${next}. ${label}\n   `;
}
