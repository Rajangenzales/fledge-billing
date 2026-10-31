import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TemplateError } from "@fledge/domain";
import { AppError } from "./errors.js";
import { renderCustomerReceipt, type CustomerReceiptDeps } from "./customer-receipt.js";
import { buildCustomerReceiptPdf } from "./customer-receipt-pdf.js";

export async function exportCustomerReceiptPdf(
  receiptId: string,
  directory: string,
  deps: CustomerReceiptDeps,
): Promise<{ filePath: string }> {
  const receipt = renderCustomerReceipt(receiptId, deps);
  const safeId = receipt.receiptId.replace(/[^A-Za-z0-9-]+/g, "-").replace(/-+/g, "-");
  const date = /^\\d{4}-\\d{2}-\\d{2}$/.test(receipt.paymentDate) ? receipt.paymentDate : "undated";
  const filename = "payment-receipt_" + safeId + "_" + date + ".pdf";
  const directoryPath = path.resolve(directory);
  const filePath = path.resolve(directoryPath, filename);
  if (!safeId || filename.includes("/") || filename.includes("\\\\") || !filePath.startsWith(directoryPath + path.sep)) {
    throw new AppError("INTERNAL", "Choose a folder on this computer.");
  }
  let bytes: Uint8Array;
  try {
    bytes = await buildCustomerReceiptPdf(receipt);
  } catch (error) {
    if (error instanceof TemplateError) throw error;
    throw new AppError("INTERNAL", "The payment receipt could not be prepared as a PDF.", error);
  }
  const partial = filePath + ".partial";
  try {
    mkdirSync(directoryPath, { recursive: true });
    writeFileSync(partial, bytes);
    renameSync(partial, filePath);
  } catch (error) {
    rmSync(partial, { force: true });
    throw new AppError("INTERNAL", "The payment receipt could not be saved as a PDF.", error);
  }
  return { filePath };
}
