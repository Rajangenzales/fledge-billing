import { TemplateError } from "./template.js";

const MAX_LOGO_BYTES = 1_000_000;

export function assertInvoiceLogo(bytes: Uint8Array): "png" | "jpeg" {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_LOGO_BYTES) {
    throw new TemplateError("Choose a PNG or JPEG logo under 1 MB.");
  }
  if (isPng(bytes)) {
    return "png";
  }
  if (isJpeg(bytes)) {
    return "jpeg";
  }
  throw new TemplateError("Choose a PNG or JPEG logo under 1 MB.");
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
