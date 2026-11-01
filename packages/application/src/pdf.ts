import { TemplateError, assertInvoiceLogo, presentationLines, type IssuedRender } from "@fledge/domain";
import { PDFDocument, PageSizes, StandardFonts, rgb } from "pdf-lib";

const MARGIN = 48;
const BOTTOM = 56;
const SIZE = 10;
const LEADING = 14;

export async function buildInvoicePdf(render: IssuedRender, logo?: Uint8Array): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const dated = documentDate(render.documentDate);
  pdf.setCreationDate(dated);
  pdf.setModificationDate(dated);
  pdf.setTitle(`${render.documentType} ${render.documentNumber ?? ""}`.trim());
  pdf.setProducer("Fledge Billing");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const image = logo ? await embedLogo(pdf, logo) : null;
  const lines = presentationLines(render);
  const totals = lines.slice(-5);
  const body = lines.slice(0, -5);
  let page = pdf.addPage(PageSizes.A4);
  let y = page.getHeight() - MARGIN;
  const width = page.getWidth() - MARGIN * 2;
  if (image) {
    const scale = Math.min(120 / image.width, 48 / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, { x: MARGIN, y: y - height, width, height });
    y -= height + 12;
  }

  const nextPage = (): void => {
    page = pdf.addPage(PageSizes.A4);
    y = page.getHeight() - MARGIN;
  };
  const drawLine = (text: string, face: typeof font): void => {
    const wrapped = wrap(text, face, width);
    for (const line of wrapped) {
      if (y - LEADING < BOTTOM) {
        nextPage();
      }
      try {
        page.drawText(line, { x: MARGIN, y: y - SIZE, size: SIZE, font: face, color: rgb(0.1, 0.12, 0.16) });
      } catch {
        throw new TemplateError("This invoice has a character the PDF font cannot draw.");
      }
      y -= LEADING;
    }
  };

  for (const line of body) {
    drawLine(line, line === body[0] ? bold : font);
  }
  const totalsHeight = totals.length * LEADING;
  if (y - totalsHeight < BOTTOM) {
    nextPage();
  }
  for (const line of totals) {
    drawLine(line, line.startsWith("Total:") ? bold : font);
  }

  const pages = pdf.getPages();
  pages.forEach((item, index) => {
    item.drawText(`Page ${index + 1} of ${pages.length}`, {
      x: MARGIN,
      y: 28,
      size: 9,
      font,
      color: rgb(0.2, 0.24, 0.28),
    });
  });
  return pdf.save();
}

async function embedLogo(pdf: PDFDocument, logo: Uint8Array): Promise<Awaited<ReturnType<PDFDocument["embedPng"]>>> {
  const kind = assertInvoiceLogo(logo);
  return kind === "png" ? pdf.embedPng(logo) : pdf.embedJpg(logo);
}

function wrap(text: string, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const fragments = splitLongWord(word, font, width);
      for (const fragment of fragments) {
        const next = current.length === 0 ? fragment : `${current} ${fragment}`;
        if (font.widthOfTextAtSize(next, SIZE) <= width) {
          current = next;
          continue;
        }
        if (current.length > 0) {
          lines.push(current);
        }
        current = fragment;
      }
    }
    if (current.length > 0) {
      lines.push(current);
    }
  }
  return lines.length > 0 ? lines : [""];
}

function splitLongWord(
  word: string,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  width: number,
): string[] {
  if (font.widthOfTextAtSize(word, SIZE) <= width) {
    return [word];
  }
  const characters = Array.from(word);
  const chunks: string[] = [];
  let start = 0;
  while (start < characters.length) {
    let low = start + 1;
    let high = characters.length;
    let end = start;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const candidate = characters.slice(start, middle).join("");
      if (font.widthOfTextAtSize(candidate, SIZE) <= width) {
        end = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (end === start) {
      throw new TemplateError("This invoice contains a character that cannot fit on the page.");
    }
    chunks.push(characters.slice(start, end).join(""));
    start = end;
  }
  return chunks;
}

function documentDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new TemplateError("This invoice has an invalid saved document date.");
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== value) {
    throw new TemplateError("This invoice has an invalid saved document date.");
  }
  return date;
}
