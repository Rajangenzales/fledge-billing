/**
 * Display formatting for stored INR decimals.
 * The stored string is not rounded or replaced.
 */

import { TemplateError } from "./template.js";

const STORED_AMOUNT = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function formatInr(stored: string): string {
  if (typeof stored !== "string" || !STORED_AMOUNT.test(stored)) {
    throw new TemplateError("A stored amount could not be shown.");
  }
  const negative = stored.startsWith("-");
  const unsigned = negative ? stored.slice(1) : stored;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const decimals = fraction.length > 2 ? fraction : fraction.padEnd(2, "0");
  const shown = `INR ${groupIndian(whole)}.${decimals}`;
  return negative ? shown.replace("INR ", "INR -") : shown;
}

function groupIndian(whole: string): string {
  if (whole.length <= 3) {
    return whole;
  }
  const tail = whole.slice(-3);
  const head = whole.slice(0, -3);
  const groups: string[] = [];
  let rest = head;
  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest.length > 0) {
    groups.unshift(rest);
  }
  return `${groups.join(",")},${tail}`;
}
