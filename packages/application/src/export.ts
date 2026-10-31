import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TemplateError, invoicePdfFilename, renderPrintSheet } from "@fledge/domain";
import { AppError } from "./errors.js";
import { buildInvoicePdf } from "./pdf.js";
import { renderIssuedDocument, type IssuedRenderDeps } from "./preview.js";

export async function exportInvoicePdf(
  id: string,
  directory: string,
  deps: IssuedRenderDeps,
  logo?: Uint8Array,
): Promise<{ filePath: string }> {
  const render = renderIssuedDocument(id, deps);
  const filename = invoicePdfFilename(render.documentType, render.documentNumber, render.documentDate);
  const directoryPath = path.resolve(directory);
  const filePath = path.resolve(directoryPath, filename);
  if (filename.includes("/") || filename.includes("\\") || !filePath.startsWith(`${directoryPath}${path.sep}`)) {
    throw new AppError("INTERNAL", "Choose a folder on this computer.");
  }
  const bytes = await pdfBytes(render, logo);
  const partial = `${filePath}.partial`;
  try {
    mkdirSync(directoryPath, { recursive: true });
    writeFileSync(partial, bytes);
    renameSync(partial, filePath);
  } catch (error) {
    rmSync(partial, { force: true });
    throw new AppError("INTERNAL", "The invoice could not be saved as a PDF.", error);
  }
  return { filePath };
}

export async function shareInvoicePdf(
  id: string,
  directory: string,
  deps: IssuedRenderDeps,
  logo?: Uint8Array,
): Promise<{ method: "local-file"; filePath: string }> {
  const saved = await exportInvoicePdf(id, directory, deps, logo);
  return { method: "local-file", filePath: saved.filePath };
}

export function printInvoice(id: string, deps: IssuedRenderDeps): string {
  return renderPrintSheet(renderIssuedDocument(id, deps));
}

async function pdfBytes(
  render: Parameters<typeof buildInvoicePdf>[0],
  logo: Uint8Array | undefined,
): Promise<Uint8Array> {
  try {
    return await buildInvoicePdf(render, logo);
  } catch (error) {
    if (error instanceof TemplateError) {
      throw error;
    }
    throw new AppError("INTERNAL", "The invoice could not be saved as a PDF.", error);
  }
}
