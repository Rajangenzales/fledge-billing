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
  if (image) {
    const scale = Math.min(120 / image.width, 48 / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, { x: MARGIN, y: y - height, width, height });
    y -= height + 12;
  }
  const width = page.getWidth() - MARGIN * 2;

  const nextPage = (): void => {
    page = pdf.addPage(PageSizes.A4);
    y = page.getHeight() - MARGIN;
  };
  const drawLine = (text: string, face: typeof font): void => {
    const wrapped = wrap(text, face, width);
    const height = wrapped.length * LEADING;
    if (y - height < BOTTOM) {
      nextPage();
    }
    for (const line of wrapped) {
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
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current.length === 0 ? word : `${current} ${word}`;
    if (font.widthOfTextAtSize(next, SIZE) <= width) {
      current = next;
      continue;
    }
    if (current.length > 0) {
      lines.push(current);
    }
    current = word;
  }
  if (current.length > 0) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
}

function documentDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return new Date(Date.UTC(2026, 0, 1));
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}
