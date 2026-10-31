import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { onlyDigits } from "./format";
import { laudoFields, laudoTitle, type LaudoType, type LaudoValues } from "./laudos";

// Os formulários oficiais em branco ficam junto do código; o sistema só escreve
// as respostas por cima, na posição de cada campo (medidas em pontos, a partir
// do canto de baixo à esquerda da folha A4).
const MODELOS = path.join(process.cwd(), "src/lib/laudos-modelos");

const tinta = rgb(0.05, 0.1, 0.35);

type Spot =
  // Uma linha de texto; diminui a letra se não couber na largura.
  | { t: "text"; x: number; y: number; w: number; size?: number; code?: boolean }
  // Um caractere em cada quadradinho (CNS, CNES, CEP, códigos). Se não couber, vira texto corrido.
  | { t: "cells"; x: number; y: number; w: number; n: number }
  // Texto longo em várias linhas dentro de uma caixa.
  | { t: "area"; x: number; top: number; bottom: number; w: number; size?: number }
  // Dia, mês e ano entre as barras já impressas.
  | { t: "date"; y: number; xs: [number, number, number] }
  // Telefone: DDD e número, cada um nos seus quadradinhos.
  | { t: "phone"; y: number; ddd: [number, number]; num: [number, number, number] }
  // "X" na opção marcada.
  | { t: "mark"; at: Record<string, [number, number]> }
  // Círculo em volta da opção marcada (quando o quadradinho já tem um número impresso).
  | { t: "ring"; at: Record<string, [number, number, number, number]> };

type Layout = {
  // Formulário em branco, em src/lib/laudos-modelos.
  file: string;
  spots: Record<string, Spot>;
  // Caixa de "assinatura e carimbo": nome e conselho do profissional, embaixo.
  stamp: { x: number; y: number; w: number };
};

const row = (y: number, name: number, qty: number, prefix: string): Record<string, Spot> => ({
  [`${prefix}Codigo`]: { t: "cells", x: 33.6, y, w: 176.5, n: 10 },
  [`${prefix}Nome`]: { t: "text", x: name, y, w: qty - name - 8, size: 8 },
  [`${prefix}Qtde`]: { t: "text", x: qty + 6, y, w: 40 },
});

const APAC: Layout = {
  file: "apac.pdf",
  spots: {
    estabelecimento: { t: "text", x: 38, y: 739, w: 408 },
    cnes: { t: "cells", x: 455.6, y: 739, w: 101.1, n: 7 },
    pacienteNome: { t: "text", x: 38, y: 699, w: 425 },
    prontuario: { t: "text", x: 476, y: 699, w: 78 },
    cns: { t: "cells", x: 33.6, y: 675.5, w: 262.6, n: 15 },
    nascimento: { t: "date", y: 675.5, xs: [309, 333, 356] },
    sexo: { t: "mark", at: { M: [418.6, 678.6], F: [475.4, 678.6] } },
    racaCor: { t: "text", x: 496, y: 675.5, w: 58, size: 7.5 },
    nomeMae: { t: "text", x: 38, y: 652.5, w: 355 },
    telefone: { t: "phone", y: 650.8, ddd: [400.6, 31], num: [431.6, 124.5, 8] },
    responsavel: { t: "text", x: 38, y: 628.5, w: 355 },
    telefoneResponsavel: { t: "phone", y: 626.6, ddd: [400.3, 31.1], num: [431.4, 124.3, 8] },
    endereco: { t: "text", x: 38, y: 607.5, w: 514 },
    municipio: { t: "text", x: 38, y: 583.5, w: 310 },
    ibge: { t: "text", x: 358, y: 583.5, w: 70 },
    uf: { t: "cells", x: 432, y: 583.5, w: 33.1, n: 2 },
    cep: { t: "cells", x: 465.1, y: 583.5, w: 91, n: 8 },
    procCodigo: { t: "cells", x: 33.6, y: 541, w: 176.5, n: 10 },
    procNome: { t: "text", x: 219, y: 541, w: 266, size: 8.5 },
    procQtde: { t: "text", x: 500, y: 541, w: 44 },
    ...row(497.5, 219, 507.8, "sec1"),
    ...row(471.5, 219, 507.8, "sec2"),
    ...row(445.5, 219, 507.8, "sec3"),
    ...row(419.5, 219, 507.8, "sec4"),
    ...row(393.5, 219, 507.8, "sec5"),
    diagnostico: { t: "text", x: 38, y: 345, w: 292, size: 8.5 },
    cidPrincipal: { t: "text", x: 340, y: 345, w: 52, code: true },
    cidSecundario: { t: "text", x: 400, y: 345, w: 60, code: true },
    cidCausas: { t: "text", x: 470, y: 345, w: 84, code: true },
    observacoes: { t: "area", x: 38, top: 321, bottom: 255, w: 514, size: 8.5 },
    profissionalNome: { t: "text", x: 38, y: 211.5, w: 255 },
    dataSolicitacao: { t: "date", y: 211.5, xs: [303, 326, 349] },
    profissionalDocTipo: { t: "mark", at: { CNS: [53.2, 189.8], CPF: [104.2, 189.8] } },
    profissionalDoc: { t: "cells", x: 145.2, y: 188.5, w: 233.3, n: 15 },
    executante: { t: "text", x: 40, y: 41, w: 376 },
    executanteCnes: { t: "cells", x: 436.7, y: 41, w: 101, n: 7 },
  },
  stamp: { x: 384, y: 188, w: 170 },
};

const AIH: Layout = {
  file: "aih.pdf",
  spots: {
    estabelecimento: { t: "text", x: 44, y: 736.5, w: 402 },
    cnes: { t: "cells", x: 456.8, y: 736.5, w: 100.3, n: 7 },
    executante: { t: "text", x: 44, y: 713.5, w: 402 },
    executanteCnes: { t: "cells", x: 456.8, y: 713.5, w: 100.3, n: 7 },
    pacienteNome: { t: "text", x: 44, y: 678, w: 422 },
    prontuario: { t: "text", x: 478, y: 678, w: 76 },
    cns: { t: "cells", x: 38.8, y: 655, w: 260.6, n: 15 },
    nascimento: { t: "date", y: 655, xs: [328, 351, 374] },
    sexo: { t: "ring", at: { M: [460.9, 654.6, 19, 10.2], F: [524, 654.6, 19, 10.2] } },
    nomeMae: { t: "text", x: 44, y: 632, w: 352 },
    telefone: { t: "phone", y: 630.8, ddd: [403, 30.7], num: [433.7, 123.4, 8] },
    endereco: { t: "text", x: 44, y: 609, w: 510 },
    municipio: { t: "text", x: 44, y: 585, w: 308 },
    ibge: { t: "text", x: 360, y: 585, w: 72 },
    uf: { t: "cells", x: 434.1, y: 585, w: 32.9, n: 2 },
    cep: { t: "cells", x: 467, y: 585, w: 90.1, n: 8 },
    sinaisSintomas: { t: "area", x: 44, top: 545, bottom: 450, w: 508, size: 8.5 },
    condicoes: { t: "area", x: 44, top: 430, bottom: 397, w: 508, size: 8.5 },
    resultados: { t: "area", x: 44, top: 377, bottom: 344, w: 508, size: 8.5 },
    diagnostico: { t: "text", x: 44, y: 322.5, w: 219, size: 8.5 },
    cidPrincipal: { t: "text", x: 285, y: 322.5, w: 70, code: true },
    cidSecundario: { t: "text", x: 377, y: 322.5, w: 70, code: true },
    cidCausas: { t: "text", x: 470, y: 322.5, w: 84, code: true },
    procNome: { t: "text", x: 44, y: 285, w: 372, size: 8.5 },
    procCodigo: { t: "cells", x: 419.5, y: 285, w: 137.6, n: 8 },
    clinica: { t: "text", x: 42, y: 262.5, w: 90, size: 8 },
    carater: { t: "text", x: 137, y: 262.5, w: 98, size: 7 },
    profissionalDocTipo: { t: "mark", at: { CNS: [250.6, 264.1], CPF: [291.3, 264.1] } },
    profissionalDoc: { t: "cells", x: 325.9, y: 262.5, w: 231.2, n: 15 },
    profissionalNome: { t: "text", x: 44, y: 229, w: 240 },
    dataSolicitacao: { t: "date", y: 229, xs: [293, 318, 343] },
    acidente: { t: "mark", at: { TRANSITO: [56.5, 193.5], TIPICO: [56.5, 179.8], TRAJETO: [56.5, 166] } },
    seguradoraCnpj: { t: "cells", x: 169.9, y: 189.5, w: 242.9, n: 14 },
    bilhete: { t: "text", x: 418, y: 189.5, w: 78 },
    serie: { t: "text", x: 504, y: 189.5, w: 50 },
    empresaCnpj: { t: "cells", x: 169.9, y: 164.5, w: 242.9, n: 14 },
    cnae: { t: "text", x: 418, y: 164.5, w: 78 },
    cbor: { t: "text", x: 504, y: 164.5, w: 50 },
    vinculo: {
      t: "mark",
      at: {
        Empregado: [51.3, 142.9],
        Empregador: [136.3, 142.9],
        Autônomo: [225.3, 142.9],
        Desempregado: [305.8, 142.9],
        Aposentado: [401.7, 142.9],
        "Não segurado": [487.9, 142.9],
      },
    },
  },
  stamp: { x: 375, y: 228, w: 180 },
};

// LME antiga (até 5 medicamentos e 3 meses), usada nas primeiras LMEs emitidas pelo sistema.
// Continua aqui para o PDF de um laudo já emitido sair sempre igual.
const medRow = (n: number, y: number): Record<string, Spot> => ({
  [`med${n}`]: { t: "text", x: 60, y, w: 342, size: 8.5 },
  [`med${n}Mes1`]: { t: "text", x: 412, y, w: 44 },
  [`med${n}Mes2`]: { t: "text", x: 465, y, w: 44 },
  [`med${n}Mes3`]: { t: "text", x: 518, y, w: 40 },
});

const LME_2010: Layout = {
  file: "lme-2010.pdf",
  spots: {
    cnes: { t: "cells", x: 36.5, y: 659, w: 169.3, n: 7 },
    estabelecimento: { t: "text", x: 212, y: 659, w: 342 },
    pacienteNome: { t: "text", x: 42, y: 630.5, w: 422 },
    peso: { t: "cells", x: 478.6, y: 630.5, w: 61.9, n: 3 },
    nomeMae: { t: "text", x: 42, y: 604.5, w: 422 },
    altura: { t: "cells", x: 478.9, y: 605, w: 62, n: 3 },
    ...medRow(1, 561.5),
    ...medRow(2, 543),
    ...medRow(3, 524.5),
    ...medRow(4, 508.5),
    ...medRow(5, 489.5),
    cidPrincipal: { t: "cells", x: 35.2, y: 459, w: 67.5, n: 4 },
    diagnostico: { t: "text", x: 112, y: 459, w: 444, size: 8.5 },
    anamnese: { t: "area", x: 44, top: 434, bottom: 392, w: 512, size: 8.5 },
    tratamentoPrevio: { t: "mark", at: { S: [47.5, 362.6], N: [47.5, 345.6] } },
    tratamentoRelato: { t: "area", x: 106, top: 361.5, bottom: 337, w: 450, size: 8 },
    incapaz: { t: "mark", at: { N: [48, 279.7], S: [85.7, 280] } },
    responsavel: { t: "text", x: 304, y: 274.5, w: 252, size: 8.5 },
    profissionalNome: { t: "text", x: 42, y: 231, w: 240 },
    dataSolicitacao: { t: "date", y: 231, xs: [296, 324, 352] },
    profissionalDocTipo: { t: "mark", at: { CPF: [47.5, 205.4], CNS: [90.4, 204.8] } },
    profissionalDoc: { t: "cells", x: 132.8, y: 204, w: 253.5, n: 15 },
    preenchidoPor: {
      t: "mark",
      at: { PACIENTE: [231.3, 177.2], MAE: [279.9, 177.4], RESPONSAVEL: [356.7, 177.6], MEDICO: [486.8, 177.7], OUTRO: [47.5, 163.1] },
    },
    outroNome: { t: "text", x: 147, y: 162.5, w: 175, size: 8 },
    outroCpf: { t: "cells", x: 383.5, y: 161.5, w: 180.6, n: 11 },
    racaCor: {
      t: "mark",
      at: { "01": [46.8, 132.3], "04": [99.8, 129.9], "02": [46.7, 119.3], "05": [99.8, 117.5], "03": [46.9, 105], "99": [99.9, 105.1] },
    },
    etnia: { t: "text", x: 205, y: 117, w: 160, size: 8 },
    telefone: { t: "phone", y: 127, ddd: [380.1, 29.7], num: [409.8, 151, 9] },
    pacienteDocTipo: { t: "mark", at: { CPF: [46, 77.9], CNS: [89.3, 78.3] } },
    pacienteDoc: { t: "cells", x: 131.5, y: 76.5, w: 240.5, n: 15 },
    email: { t: "text", x: 45, y: 52.5, w: 325 },
  },
  stamp: { x: 397, y: 201, w: 162 },
};

// Os campos de baixo (13 e 18 a 23) ficaram no mesmo lugar no modelo atual.
const LME_2010_BOTTOM = Object.fromEntries(
  ["incapaz", "responsavel", "preenchidoPor", "outroNome", "outroCpf", "racaCor", "etnia", "telefone", "pacienteDocTipo", "pacienteDoc", "email"].map(
    (k) => [k, LME_2010.spots[k]],
  ),
);

// Colunas de quantidade de cada mês, no modelo atual (6 meses).
const MONTH_X = [369.6, 399.8, 433.9, 466.2, 497.4, 528.1, 560.9];
const medRow6 = (n: number, y: number): Record<string, Spot> => ({
  [`med${n}`]: { t: "text", x: 60, y, w: 306, size: 8.5 },
  ...Object.fromEntries(
    [1, 2, 3, 4, 5, 6].map((m) => [`med${n}Mes${m}`, { t: "text", x: MONTH_X[m - 1] + 3, y, w: MONTH_X[m] - MONTH_X[m - 1] - 6, size: 9 }]),
  ),
});

// Modelo atual da LME: até 6 medicamentos, 6 meses e CNS do médico.
const LME: Layout = {
  file: "lme.pdf",
  spots: {
    cnes: LME_2010.spots.cnes,
    estabelecimento: LME_2010.spots.estabelecimento,
    pacienteNome: LME_2010.spots.pacienteNome,
    peso: LME_2010.spots.peso,
    nomeMae: LME_2010.spots.nomeMae,
    altura: LME_2010.spots.altura,
    ...medRow6(1, 560.5),
    ...medRow6(2, 541.5),
    ...medRow6(3, 523),
    ...medRow6(4, 505),
    ...medRow6(5, 486.5),
    ...medRow6(6, 467.5),
    cidPrincipal: { t: "cells", x: 35.2, y: 434, w: 67.5, n: 4 },
    diagnostico: { t: "text", x: 112, y: 434, w: 444, size: 8.5 },
    anamnese: { t: "area", x: 44, top: 408, bottom: 366, w: 512, size: 8.5 },
    tratamentoPrevio: { t: "mark", at: { N: [47.5, 338.4], S: [89.6, 338.4] } },
    tratamentoRelato: { t: "text", x: 147, y: 337, w: 408, size: 8 },
    profissionalNome: { t: "text", x: 42, y: 231, w: 345 },
    profissionalCns: { t: "cells", x: 35.8, y: 203.5, w: 253.7, n: 15 },
    dataSolicitacao: { t: "date", y: 203.5, xs: [301, 328, 356] },
    ...LME_2010_BOTTOM,
  },
  stamp: LME_2010.stamp,
};

const LAYOUTS: Record<LaudoType, Layout> = { APAC, AIH, LME };

// LME emitida no modelo antigo: tinha "documento do médico" (CPF ou CNS) em vez do CNS.
function layoutFor(type: LaudoType, values: LaudoValues) {
  if (type === "LME" && (values.profissionalDocTipo || values.profissionalDoc)) return LME_2010;
  return LAYOUTS[type];
}

function clean(font: PDFFont, text: string) {
  const known = new Set(font.getCharacterSet());
  return Array.from(text).map((ch) => (known.has(ch.codePointAt(0)!) ? ch : "?")).join("");
}

function wrap(font: PDFFont, size: number, text: string, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function draw(page: PDFPage, font: PDFFont, bold: PDFFont, spot: Spot, value: string, shown: string): void {
  const text = (s: string, x: number, y: number, size: number, f = font) =>
    page.drawText(clean(f, s), { x, y, size, font: f, color: tinta });
  const cellText = (s: string, x: number, w: number, n: number, y: number) => {
    const cell = w / n;
    Array.from(s).forEach((ch, i) => {
      const c = clean(bold, ch);
      text(c, x + cell * i + (cell - bold.widthOfTextAtSize(c, 9.5)) / 2, y, 9.5, bold);
    });
  };

  switch (spot.t) {
    case "text": {
      const s = clean(font, spot.code ? value : shown);
      let size = spot.size ?? 9.5;
      while (size > 5 && font.widthOfTextAtSize(s, size) > spot.w) size -= 0.5;
      text(s, spot.x, spot.y, size);
      return;
    }
    case "cells": {
      const chars = Array.from(value.replace(/[\s.\-/]/g, "").toUpperCase());
      if (chars.length > spot.n) return draw(page, font, bold, { t: "text", x: spot.x + 3, y: spot.y, w: spot.w - 6 }, value, value);
      cellText(chars.join(""), spot.x, spot.w, spot.n, spot.y);
      return;
    }
    case "area": {
      const size = spot.size ?? 9;
      let y = spot.top;
      const lines = wrap(font, size, clean(font, shown), spot.w);
      for (const line of lines) {
        if (y < spot.bottom) break;
        text(line, spot.x, y, size);
        y -= size + 2.5;
      }
      return;
    }
    case "date": {
      const [yy, mm, dd] = value.split("-");
      if (!dd) return;
      text(dd, spot.xs[0], spot.y, 9.5);
      text(mm, spot.xs[1], spot.y, 9.5);
      text(yy, spot.xs[2], spot.y, 9.5);
      return;
    }
    case "phone": {
      const d = onlyDigits(value);
      const [ddd, num] = d.length >= 10 ? [d.slice(0, 2), d.slice(2)] : ["", d];
      if (ddd) cellText(ddd, spot.ddd[0], spot.ddd[1], 2, spot.y);
      cellText(num, spot.num[0], spot.num[1], Math.max(spot.num[2], num.length), spot.y);
      return;
    }
    case "mark": {
      const at = spot.at[value];
      if (at) text("X", at[0], at[1], 8, bold);
      return;
    }
    case "ring": {
      const at = spot.at[value];
      if (!at) return;
      const [x, y, w, h] = at;
      page.drawEllipse({ x: x + w / 2, y: y + h / 2, xScale: w / 2 + 2, yScale: h / 2 + 2, borderColor: tinta, borderWidth: 1.2 });
      return;
    }
  }
}

export type LaudoPdfInput = {
  type: LaudoType;
  values: LaudoValues;
  // Nome e conselho do profissional, no campo de assinatura e carimbo.
  stamp: string[];
  clinicName: string;
  author: string;
  integrityCode?: string | null;
  // Selo de assinatura digital, numa segunda folha (o formulário ocupa a primeira inteira).
  signatureStamp?: string[];
};

export async function buildLaudoPdf(input: LaudoPdfInput) {
  const layout = layoutFor(input.type, input.values);
  const template = await readFile(path.join(MODELOS, layout.file));
  const pdf = await PDFDocument.load(template);
  pdf.setTitle(laudoTitle[input.type]);
  pdf.setAuthor(input.author);
  pdf.setProducer(input.clinicName);
  pdf.setCreator(input.clinicName);
  pdf.setSubject(input.type);
  pdf.setKeywords([]);

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.getPage(0);
  const fields = new Map(laudoFields(input.type).map((f) => [f.key, f]));

  for (const [key, spot] of Object.entries(layout.spots)) {
    const value = input.values[key];
    if (!value) continue;
    const shown = fields.get(key)?.options?.find((o) => o.value === value)?.label ?? value;
    draw(page, font, bold, spot, value, key === "racaCor" && input.type === "APAC" ? `${value} ${shown}` : shown);
  }

  // Carimbo: nome e registro no conselho, de baixo para cima dentro da caixa.
  const { stamp } = layout;
  [...input.stamp].reverse().forEach((line, i) => {
    const f = i === input.stamp.length - 1 ? bold : font;
    const s = clean(f, line);
    let size = 7.5;
    while (size > 5 && f.widthOfTextAtSize(s, size) > stamp.w) size -= 0.5;
    page.drawText(s, { x: stamp.x + (stamp.w - f.widthOfTextAtSize(s, size)) / 2, y: stamp.y + i * 9, size, font: f, color: tinta });
  });

  if (input.integrityCode) {
    page.drawText(clean(font, `Emitido por ${input.clinicName} · Código de integridade: ${input.integrityCode}`), {
      x: 30,
      y: 14,
      size: 5.5,
      font,
      color: rgb(0.4, 0.45, 0.5),
    });
  }

  if (input.signatureStamp?.length) {
    const extra = pdf.addPage([595.28, 841.89]);
    extra.drawText(clean(bold, laudoTitle[input.type]), { x: 50, y: 780, size: 11, font: bold, color: tinta });
    extra.drawText(clean(font, `Paciente: ${input.values.pacienteNome ?? ""}`), { x: 50, y: 762, size: 10, font, color: tinta });
    const height = 14 + input.signatureStamp.length * 11;
    extra.drawRectangle({ x: 50, y: 730 - height, width: 495, height, borderColor: rgb(0.78, 0.62, 0.25), borderWidth: 0.8, color: rgb(1, 0.99, 0.95) });
    input.signatureStamp.forEach((line, i) => {
      const f = i === 0 ? bold : font;
      extra.drawText(clean(f, line), { x: 58, y: 730 - 15 - i * 11, size: 8, font: f, color: tinta });
    });
  }

  return pdf.save();
}
