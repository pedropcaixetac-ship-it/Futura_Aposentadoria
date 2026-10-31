import type { Clinic, DocumentType, Patient, User } from "@prisma/client";
import { formatCep, onlyDigits } from "./format";
import { councilLabel, displayName } from "./staff";

// Laudos do SUS (APAC, AIH e LME): o profissional preenche campos fixos e o sistema
// escreve as respostas por cima do formulário oficial (ver laudo-pdf.ts).
export const LAUDO_TYPES = ["APAC", "AIH", "LME"] as const satisfies readonly DocumentType[];
export type LaudoType = (typeof LAUDO_TYPES)[number];

export function isLaudo(type: DocumentType): type is LaudoType {
  return (LAUDO_TYPES as readonly string[]).includes(type);
}

export const laudoTitle: Record<LaudoType, string> = {
  APAC: "Laudo para Solicitação/Autorização de Procedimento Ambulatorial",
  AIH: "Laudo para Solicitação de Autorização de Internação Hospitalar",
  LME: "Laudo de Solicitação, Avaliação e Autorização de Medicamentos (Componente Especializado)",
};

export type LaudoValues = Record<string, string>;

type Option = { value: string; label: string };
export type LaudoField = {
  key: string;
  label: string;
  kind?: "text" | "textarea" | "date" | "select" | "cid";
  options?: Option[];
  required?: boolean;
  // Largura no formulário, em sextos da linha (padrão: a linha inteira).
  span?: 1 | 2 | 3 | 4 | 5 | 6;
  max?: number;
  hint?: string;
};
export type LaudoSection = { title: string; hint?: string; fields: LaudoField[] };

const SEXO: Option[] = [
  { value: "M", label: "Masculino" },
  { value: "F", label: "Feminino" },
];
// Códigos de raça/cor usados pelo SUS.
const RACA_COR: Option[] = [
  { value: "01", label: "Branca" },
  { value: "02", label: "Preta" },
  { value: "03", label: "Parda" },
  { value: "04", label: "Amarela" },
  { value: "05", label: "Indígena" },
  { value: "99", label: "Sem informação" },
];
const DOCUMENTO: Option[] = [
  { value: "CNS", label: "CNS" },
  { value: "CPF", label: "CPF" },
];
const SIM_NAO: Option[] = [
  { value: "N", label: "Não" },
  { value: "S", label: "Sim" },
];

function patientFields(withGuardian: boolean): LaudoField[] {
  return [
    { key: "pacienteNome", label: "Nome do paciente", required: true, span: 4 },
    { key: "prontuario", label: "Nº do prontuário", span: 2 },
    { key: "cns", label: "Cartão Nacional de Saúde (CNS)", span: 2, max: 15 },
    { key: "nascimento", label: "Data de nascimento", kind: "date", span: 2 },
    { key: "sexo", label: "Sexo", kind: "select", options: SEXO, span: 1 },
    ...(withGuardian ? [{ key: "racaCor", label: "Raça/cor", kind: "select", options: RACA_COR, span: 1 } as LaudoField] : []),
    {
      key: "nomeMae",
      label: withGuardian ? "Nome da mãe" : "Nome da mãe ou responsável",
      span: 4,
    },
    { key: "telefone", label: "Telefone de contato", span: 2, hint: "Com DDD" },
    ...(withGuardian
      ? [
          { key: "responsavel", label: "Nome do responsável", span: 4 } as LaudoField,
          { key: "telefoneResponsavel", label: "Telefone do responsável", span: 2 } as LaudoField,
        ]
      : []),
    { key: "endereco", label: "Endereço (rua, nº, bairro)" },
    { key: "municipio", label: "Município de residência", span: 3 },
    { key: "ibge", label: "Cód. IBGE do município", span: 1, max: 7 },
    { key: "uf", label: "UF", span: 1, max: 2 },
    { key: "cep", label: "CEP", span: 1, max: 9 },
  ];
}

function requesterFields(): LaudoField[] {
  return [
    { key: "profissionalNome", label: "Nome do profissional solicitante", required: true, span: 3 },
    { key: "dataSolicitacao", label: "Data da solicitação", kind: "date", required: true, span: 1 },
    { key: "profissionalDocTipo", label: "Documento", kind: "select", options: DOCUMENTO, span: 1 },
    { key: "profissionalDoc", label: "Nº do documento", span: 1 },
  ];
}

const secondaryProcedures: LaudoField[] = [1, 2, 3, 4, 5].flatMap((n) => [
  { key: `sec${n}Codigo`, label: `Código do procedimento secundário ${n}`, span: 2, max: 10 } as LaudoField,
  { key: `sec${n}Nome`, label: "Nome do procedimento", span: 3 } as LaudoField,
  { key: `sec${n}Qtde`, label: "Qtde.", span: 1, max: 4 } as LaudoField,
]);

const medications: LaudoField[] = [1, 2, 3, 4, 5].flatMap((n) => [
  { key: `med${n}`, label: `Medicamento ${n}`, required: n === 1, span: 3 } as LaudoField,
  { key: `med${n}Mes1`, label: "Qtde. 1º mês", required: n === 1, span: 1, max: 6 } as LaudoField,
  { key: `med${n}Mes2`, label: "Qtde. 2º mês", span: 1, max: 6 } as LaudoField,
  { key: `med${n}Mes3`, label: "Qtde. 3º mês", span: 1, max: 6 } as LaudoField,
]);

export const laudoSections: Record<LaudoType, LaudoSection[]> = {
  APAC: [
    {
      title: "Estabelecimento solicitante",
      fields: [
        { key: "estabelecimento", label: "Nome do estabelecimento de saúde solicitante", required: true, span: 4 },
        { key: "cnes", label: "CNES", span: 2, max: 7 },
      ],
    },
    { title: "Paciente", fields: patientFields(true) },
    {
      title: "Procedimento solicitado",
      fields: [
        { key: "procCodigo", label: "Código do procedimento principal", required: true, span: 2, max: 10, hint: "Código da tabela SIGTAP, 10 números" },
        { key: "procNome", label: "Nome do procedimento principal", required: true, span: 3 },
        { key: "procQtde", label: "Qtde.", required: true, span: 1, max: 4 },
      ],
    },
    { title: "Procedimentos secundários", hint: "Preencha só se houver.", fields: secondaryProcedures },
    {
      title: "Justificativa",
      fields: [
        { key: "diagnostico", label: "Descrição do diagnóstico", required: true },
        { key: "cidPrincipal", label: "CID-10 principal", kind: "cid", required: true, span: 2 },
        { key: "cidSecundario", label: "CID-10 secundário", kind: "cid", span: 2 },
        { key: "cidCausas", label: "CID-10 causas associadas", kind: "cid", span: 2 },
        { key: "observacoes", label: "Observações", kind: "textarea", max: 1200 },
      ],
    },
    { title: "Solicitação", fields: requesterFields() },
    {
      title: "Estabelecimento executante",
      hint: "Onde o procedimento será feito, se já souber.",
      fields: [
        { key: "executante", label: "Nome fantasia do estabelecimento executante", span: 4 },
        { key: "executanteCnes", label: "CNES", span: 2, max: 7 },
      ],
    },
  ],
  AIH: [
    {
      title: "Estabelecimentos",
      fields: [
        { key: "estabelecimento", label: "Nome do estabelecimento solicitante", required: true, span: 4 },
        { key: "cnes", label: "CNES", span: 2, max: 7 },
        { key: "executante", label: "Nome do estabelecimento executante", span: 4 },
        { key: "executanteCnes", label: "CNES", span: 2, max: 7 },
      ],
    },
    { title: "Paciente", fields: patientFields(false) },
    {
      title: "Justificativa da internação",
      fields: [
        { key: "sinaisSintomas", label: "Principais sinais e sintomas clínicos", kind: "textarea", required: true, max: 1500 },
        { key: "condicoes", label: "Condições que justificam a internação", kind: "textarea", required: true, max: 700 },
        { key: "resultados", label: "Principais resultados de provas diagnósticas (exames realizados)", kind: "textarea", max: 700 },
        { key: "diagnostico", label: "Diagnóstico inicial", required: true },
        { key: "cidPrincipal", label: "CID-10 principal", kind: "cid", required: true, span: 2 },
        { key: "cidSecundario", label: "CID-10 secundário", kind: "cid", span: 2 },
        { key: "cidCausas", label: "CID-10 causas associadas", kind: "cid", span: 2 },
      ],
    },
    {
      title: "Procedimento solicitado",
      fields: [
        { key: "procNome", label: "Descrição do procedimento solicitado", required: true, span: 4 },
        { key: "procCodigo", label: "Código do procedimento", required: true, span: 2, max: 10, hint: "Código da tabela SIGTAP" },
        {
          key: "clinica",
          label: "Clínica",
          kind: "select",
          span: 2,
          options: ["Cirúrgica", "Obstétrica", "Clínica médica", "Pediátrica", "Psiquiátrica", "Cuidados prolongados", "Reabilitação"].map((v) => ({ value: v, label: v })),
        },
        {
          key: "carater",
          label: "Caráter da internação",
          kind: "select",
          span: 4,
          options: [
            { value: "01", label: "01 - Eletivo" },
            { value: "02", label: "02 - Urgência" },
            { value: "03", label: "03 - Acidente no local de trabalho ou a serviço da empresa" },
            { value: "04", label: "04 - Acidente no trajeto para o trabalho" },
            { value: "05", label: "05 - Outros tipos de acidente de trânsito" },
            { value: "06", label: "06 - Outros tipos de lesões e envenenamentos" },
          ],
        },
        ...requesterFields(),
      ],
    },
    {
      title: "Causas externas (acidentes ou violências)",
      hint: "Preencha só em caso de acidente ou violência.",
      fields: [
        {
          key: "acidente",
          label: "Tipo",
          kind: "select",
          span: 2,
          options: [
            { value: "TRANSITO", label: "Acidente de trânsito" },
            { value: "TIPICO", label: "Acidente de trabalho típico" },
            { value: "TRAJETO", label: "Acidente de trabalho no trajeto" },
          ],
        },
        { key: "seguradoraCnpj", label: "CNPJ da seguradora", span: 2 },
        { key: "bilhete", label: "Nº do bilhete", span: 1 },
        { key: "serie", label: "Série", span: 1 },
        { key: "empresaCnpj", label: "CNPJ da empresa", span: 2 },
        { key: "cnae", label: "CNAE da empresa", span: 2 },
        { key: "cbor", label: "CBOR", span: 2 },
        {
          key: "vinculo",
          label: "Vínculo com a Previdência",
          kind: "select",
          span: 3,
          options: ["Empregado", "Empregador", "Autônomo", "Desempregado", "Aposentado", "Não segurado"].map((v) => ({ value: v, label: v })),
        },
      ],
    },
  ],
  LME: [
    {
      title: "Estabelecimento solicitante",
      fields: [
        { key: "cnes", label: "CNES", required: true, span: 2, max: 7 },
        { key: "estabelecimento", label: "Nome do estabelecimento de saúde solicitante", required: true, span: 4 },
      ],
    },
    {
      title: "Paciente",
      fields: [
        { key: "pacienteNome", label: "Nome completo do paciente", required: true, span: 4 },
        { key: "peso", label: "Peso (kg)", required: true, span: 1, max: 6 },
        { key: "altura", label: "Altura (cm)", required: true, span: 1, max: 3 },
        { key: "nomeMae", label: "Nome da mãe do paciente", required: true },
      ],
    },
    { title: "Medicamentos solicitados", hint: "Até 5 medicamentos, com a quantidade de cada mês.", fields: medications },
    {
      title: "Justificativa",
      fields: [
        { key: "cidPrincipal", label: "CID-10", kind: "cid", required: true, span: 2 },
        { key: "diagnostico", label: "Diagnóstico", span: 4 },
        { key: "anamnese", label: "Anamnese", kind: "textarea", required: true, max: 900 },
        { key: "tratamentoPrevio", label: "Fez tratamento prévio ou está em tratamento da doença?", kind: "select", options: SIM_NAO, required: true, span: 3 },
        { key: "tratamentoRelato", label: "Se sim, relatar", kind: "textarea", max: 300 },
        { key: "incapaz", label: "O paciente é considerado incapaz?", kind: "select", options: SIM_NAO, required: true, span: 3 },
        { key: "responsavel", label: "Se sim, nome do responsável", span: 3 },
      ],
    },
    { title: "Médico solicitante", fields: requesterFields() },
    {
      title: "Dados preenchidos pelo paciente ou responsável",
      hint: "Opcional: podem ser preenchidos à mão pelo paciente.",
      fields: [
        {
          key: "preenchidoPor",
          label: "Preenchido por",
          kind: "select",
          span: 2,
          options: [
            { value: "PACIENTE", label: "Paciente" },
            { value: "MAE", label: "Mãe do paciente" },
            { value: "RESPONSAVEL", label: "Responsável (do item 13)" },
            { value: "MEDICO", label: "Médico solicitante" },
            { value: "OUTRO", label: "Outro" },
          ],
        },
        { key: "outroNome", label: "Se outro, nome", span: 2 },
        { key: "outroCpf", label: "Se outro, CPF", span: 2 },
        { key: "racaCor", label: "Raça/cor/etnia", kind: "select", options: RACA_COR, span: 2 },
        { key: "etnia", label: "Etnia (se indígena)", span: 2 },
        { key: "telefone", label: "Telefone(s) do paciente", span: 2 },
        { key: "pacienteDocTipo", label: "Documento do paciente", kind: "select", options: DOCUMENTO, span: 1 },
        { key: "pacienteDoc", label: "Nº do documento", span: 2 },
        { key: "email", label: "E-mail do paciente", span: 3 },
      ],
    },
  ],
};

export function laudoFields(type: LaudoType) {
  return laudoSections[type].flatMap((s) => s.fields);
}

type StaffUser = Pick<User, "name" | "jobTitle" | "sex" | "cns" | "cpf" | "councilType" | "councilNumber" | "councilUf" | "rqe">;

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

// Respostas iniciais tiradas do cadastro do paciente, da clínica e do profissional.
// O profissional confere e completa o que faltar.
export function laudoDefaults(
  type: LaudoType,
  { clinic, patient, professional, vitals, today = new Date() }: {
    clinic: Pick<Clinic, "name" | "cnes">;
    patient: Patient;
    professional: StaffUser;
    vitals?: { peso?: number; altura?: number } | null;
    today?: Date;
  },
): LaudoValues {
  const address = [[patient.street, patient.number].filter(Boolean).join(", "), patient.complement, patient.district]
    .filter(Boolean)
    .join(" - ");
  const proDoc = onlyDigits(professional.cns) ? "CNS" : onlyDigits(professional.cpf) ? "CPF" : "";
  const values: LaudoValues = {
    estabelecimento: clinic.name,
    cnes: onlyDigits(clinic.cnes),
    pacienteNome: patient.name,
    cns: onlyDigits(patient.cns),
    nascimento: patient.birthDate ? isoDate(patient.birthDate) : "",
    sexo: patient.sex === "F" || patient.sex === "M" ? patient.sex : "",
    nomeMae: patient.motherName ?? (type === "AIH" ? (patient.guardianName ?? "") : ""),
    telefone: onlyDigits(patient.phone || patient.landline),
    responsavel: patient.guardianName ?? "",
    telefoneResponsavel: onlyDigits(patient.guardianPhone),
    endereco: address,
    municipio: patient.city ?? "",
    uf: patient.state ?? "",
    cep: formatCep(patient.cep),
    profissionalNome: displayName(professional),
    dataSolicitacao: isoDate(today),
    profissionalDocTipo: proDoc,
    profissionalDoc: proDoc === "CNS" ? onlyDigits(professional.cns) : onlyDigits(professional.cpf),
  };
  if (type === "LME") {
    values.peso = vitals?.peso ? String(vitals.peso).replace(".", ",") : "";
    values.altura = vitals?.altura ? String(vitals.altura) : "";
    values.email = patient.email ?? "";
    values.pacienteDocTipo = onlyDigits(patient.cns) ? "CNS" : onlyDigits(patient.cpf) ? "CPF" : "";
    values.pacienteDoc = onlyDigits(patient.cns) || onlyDigits(patient.cpf);
    values.incapaz = patient.guardianName ? "" : "N";
  }
  const keys = new Set(laudoFields(type).map((f) => f.key));
  return Object.fromEntries(Object.entries(values).filter(([k, v]) => keys.has(k) && v));
}

// Mantém só os campos do laudo, com texto limpo. Devolve os campos obrigatórios em branco.
export function parseLaudo(type: LaudoType, formData: FormData) {
  const values: LaudoValues = {};
  const missing: string[] = [];
  for (const f of laudoFields(type)) {
    let v = String(formData.get(`laudo_${f.key}`) ?? "").replace(/\r/g, "").trim();
    if (f.kind !== "textarea") v = v.replace(/\s+/g, " ");
    if (f.max) v = v.slice(0, f.max);
    if (f.options && v && !f.options.some((o) => o.value === v)) v = "";
    if (f.kind === "date" && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) v = "";
    if (v) values[f.key] = v;
    else if (f.required) missing.push(f.label);
  }
  return { values, missing };
}

export function formatLaudoDate(iso: string | undefined) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Versão em texto do laudo: vai para a impressão digital, para a lista de documentos
// e para o PDF do prontuário completo.
export function laudoText(type: LaudoType, values: LaudoValues) {
  const blocks: string[] = [laudoTitle[type]];
  for (const section of laudoSections[type]) {
    const lines = section.fields
      .filter((f) => values[f.key])
      .map((f) => {
        const raw = values[f.key];
        const shown =
          f.kind === "date" ? formatLaudoDate(raw) : (f.options?.find((o) => o.value === raw)?.label ?? raw);
        return `${f.label}: ${shown}`;
      });
    if (lines.length) blocks.push(`${section.title}\n${lines.join("\n")}`);
  }
  return blocks.join("\n\n");
}

// Carimbo do profissional no campo "assinatura e carimbo".
export function laudoStamp(professional: StaffUser) {
  return [displayName(professional), councilLabel(professional)].filter((l): l is string => !!l);
}

export function allLaudoDefaults(input: Parameters<typeof laudoDefaults>[1]) {
  return Object.fromEntries(LAUDO_TYPES.map((t) => [t, laudoDefaults(t, input)])) as Record<LaudoType, LaudoValues>;
}

// Uma linha para as listas de documentos: o que foi pedido e o CID.
export function laudoSummary(type: LaudoType, values: LaudoValues) {
  const asked =
    type === "LME"
      ? [1, 2, 3, 4, 5].map((n) => values[`med${n}`]).filter(Boolean).join(", ")
      : [values.procCodigo, values.procNome].filter(Boolean).join(" ");
  return [asked, values.cidPrincipal && `CID ${values.cidPrincipal}`].filter(Boolean).join(" · ");
}
