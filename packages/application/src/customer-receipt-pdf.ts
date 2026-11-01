import { StandardFonts, PDFDocument, PageSizes, rgb } from "pdf-lib";
import { customerReceiptPrintLines, type PrintableCustomerReceipt } from "./customer-receipt.js";
import { TemplateError } from "@fledge/domain";

const MARGIN = 48;
const BOTTOM = 52;
const SIZE = 10;
const LEADING = 14;

export async function buildCustomerReceiptPdf(receipt: PrintableCustomerReceipt): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Payment Receipt " + receipt.receiptId);
  pdf.setProducer("Fledge Billing");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage(PageSizes.A4);
  let y = page.getHeight() - MARGIN;
  const width = page.getWidth() - MARGIN * 2;
  const nextPage = (): void => {
    page = pdf.addPage(PageSizes.A4);
    y = page.getHeight() - MARGIN;
  };
  for (const [index, line] of customerReceiptPrintLines(receipt).entries()) {
    const face = index === 0 || line === "RECEIVED FROM" ? bold : font;
    const wrapped = wrap(line, face, width);
    if (y - wrapped.length * LEADING < BOTTOM) nextPage();
    for (const part of wrapped) {
      try {
        page.drawText(part, { x: MARGIN, y: y - SIZE, size: SIZE, font: face, color: rgb(0.1, 0.12, 0.16) });
      } catch {
        throw new TemplateError("This receipt contains a character the PDF font cannot draw.");
      }
      y -= LEADING;
    }
  }
  const pages = pdf.getPages();
  pages.forEach((item, index) => {
    item.drawText("Page " + (index + 1) + " of " + pages.length, {
      x: MARGIN, y: 28, size: 9, font, color: rgb(0.2, 0.24, 0.28),
    });
  });
  return pdf.save();
}

function wrap(value: string, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, width: number): string[] {
  const words = value.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? current + " " + word : word;
    if (font.widthOfTextAtSize(candidate, SIZE) <= width) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}
