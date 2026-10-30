import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// Cores do tema (azul-marinho e dourado).
const marinho = rgb(0.06, 0.13, 0.27);
const dourado = rgb(0.78, 0.62, 0.25);
const cinza = rgb(0.4, 0.45, 0.5);

const A4 = { width: 595.28, height: 841.89 };
const margin = 50;
const contentWidth = A4.width - margin * 2;
const footerTop = 125;

// heading: título grande com linha, que abre um bloco (ex.: cada atendimento do prontuário).
// small: texto miúdo e cinza (ex.: código de integridade de cada atendimento).
export type PdfSection = { title?: string; text: string; heading?: boolean; small?: boolean };

export type PdfInput = {
  clinicName: string;
  title: string;
  // Linhas logo abaixo do título (paciente, data, convênio...).
  info: string[];
  sections: PdfSection[];
  // Bloco de quem emitiu, no rodapé da última página. Sem ele, não há linha de assinatura.
  professional?: { name: string; council?: string | null; specialty?: string | null };
  place: string;
  integrityCode?: string | null;
  // Selo de assinatura digital, no pé da última página.
  signatureStamp?: string[];
};

// As fontes padrão do PDF só conhecem letras latinas. Qualquer símbolo fora
// disso (emoji, por exemplo) vira "?" em vez de quebrar a geração do arquivo.
function cleanText(font: PDFFont, text: string) {
  const known = new Set(font.getCharacterSet());
  return Array.from(text.replace(/\r/g, "").replace(/\t/g, "    "))
    .map((ch) => (ch === "\n" || known.has(ch.codePointAt(0)!) ? ch : "?"))
    .join("");
}

function wrap(font: PDFFont, size: number, text: string, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // Palavra maior que a linha inteira: corta em pedaços.
      line = word;
      while (font.widthOfTextAtSize(line, size) > width) {
        let cut = line.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function buildPdf(input: PdfInput) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(input.title);
  if (input.professional) pdf.setAuthor(input.professional.name);
  pdf.setProducer(input.clinicName);
  pdf.setCreator(input.clinicName);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const t = (text: string, font: PDFFont = regular) => cleanText(font, text);

  let page: PDFPage;
  let y = 0;

  const newPage = () => {
    page = pdf.addPage([A4.width, A4.height]);
    page.drawRectangle({ x: 0, y: A4.height - 70, width: A4.width, height: 70, color: marinho });
    page.drawText(t(input.clinicName, bold), { x: margin, y: A4.height - 43, size: 16, font: bold, color: dourado });
    page.drawRectangle({ x: 0, y: A4.height - 74, width: A4.width, height: 4, color: dourado });
    y = A4.height - 110;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < footerTop) newPage();
  };

  const write = (text: string, font: PDFFont, size: number, color = rgb(0, 0, 0)) => {
    for (const line of wrap(font, size, t(text, font), contentWidth)) {
      ensureSpace(size + 4);
      page.drawText(line, { x: margin, y, size, font, color });
      y -= size + 5;
    }
  };

  newPage();
  write(input.title.toUpperCase(), bold, 15, marinho);
  y -= 4;
  for (const line of input.info) write(line, regular, 10, cinza);
  y -= 6;
  page!.drawLine({ start: { x: margin, y }, end: { x: A4.width - margin, y }, thickness: 0.5, color: cinza });
  y -= 22;

  for (const section of input.sections) {
    if (section.heading) {
      ensureSpace(80);
      y -= 6;
      page!.drawRectangle({ x: margin, y: y - 5, width: contentWidth, height: 20, color: rgb(0.93, 0.95, 0.98) });
      write(section.title ?? "", bold, 12, marinho);
      y -= 2;
      if (section.text) write(section.text, regular, 10, cinza);
      y -= 12;
      continue;
    }
    if (section.small) {
      write(section.text, regular, 8, cinza);
      y -= 14;
      continue;
    }
    if (section.title) {
      ensureSpace(40);
      write(section.title, bold, 11, marinho);
      y -= 2;
    }
    write(section.text || "—", regular, 11);
    y -= 14;
  }

  // Data, local e linha de assinatura do profissional.
  ensureSpace(input.professional ? 110 : 30);
  y -= 10;
  page!.drawText(t(input.place), { x: margin, y, size: 10, font: regular, color: cinza });
  if (input.professional) {
    y -= 50;
    const signX = A4.width / 2 - 120;
    page!.drawLine({ start: { x: signX, y }, end: { x: signX + 240, y }, thickness: 0.7, color: marinho });
    y -= 14;
    for (const line of [input.professional.name, input.professional.council, input.professional.specialty]) {
      if (!line) continue;
      const font = line === input.professional.name ? bold : regular;
      const text = t(line, font);
      page!.drawText(text, { x: A4.width / 2 - font.widthOfTextAtSize(text, 10) / 2, y, size: 10, font, color: marinho });
      y -= 13;
    }
  }

  if (input.signatureStamp?.length) {
    const height = 14 + input.signatureStamp.length * 11;
    page!.drawRectangle({
      x: margin,
      y: 58,
      width: contentWidth,
      height,
      borderColor: dourado,
      borderWidth: 0.8,
      color: rgb(1, 0.99, 0.95),
    });
    input.signatureStamp.forEach((line, i) => {
      const font = i === 0 ? bold : regular;
      page!.drawText(t(line, font), { x: margin + 8, y: 58 + height - 15 - i * 11, size: 8, font, color: marinho });
    });
  }

  // Rodapé de todas as páginas: código de integridade e numeração.
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: margin, y: 50 }, end: { x: A4.width - margin, y: 50 }, thickness: 0.5, color: dourado });
    if (input.integrityCode) {
      p.drawText(t(`Código de integridade: ${input.integrityCode}`), { x: margin, y: 36, size: 7, font: regular, color: cinza });
    }
    const label = `Página ${i + 1} de ${pages.length}`;
    p.drawText(t(label), {
      x: A4.width - margin - regular.widthOfTextAtSize(label, 8),
      y: 36,
      size: 8,
      font: regular,
      color: cinza,
    });
  });

  return pdf.save();
}
