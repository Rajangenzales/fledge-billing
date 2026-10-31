export type Fail = (message: string) => never;

export function requiredText(
  value: unknown,
  message: string,
  maxLength: number,
  fail: Fail,
): string {
  if (typeof value !== "string") {
    throw fail(message);
  }
  const text = value.trim();
  if (text.length === 0 || text.length > maxLength || hasControlCharacter(text)) {
    throw fail(message);
  }
  return text;
}

export function optionalText(
  value: unknown,
  maxLength: number,
  fail: Fail,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw fail("Enter text without control characters.");
  }
  const text = value.trim();
  if (text.length === 0) {
    return null;
  }
  if (text.length > maxLength || hasControlCharacter(text)) {
    throw fail(`Keep this field to ${maxLength} characters.`);
  }
  return text;
}

export function normalizePin(value: unknown, fail: Fail): string | null {
  const pin = optionalText(value, 6, fail);
  if (pin === null) {
    return null;
  }
  if (!/^[1-9][0-9]{5}$/.test(pin)) {
    throw fail("Enter a 6-digit PIN code.");
  }
  return pin;
}

export function normalizePhone(value: unknown, fail: Fail): string | null {
  const phone = optionalText(value, 20, fail);
  if (phone === null) {
    return null;
  }
  if (!/^\+?[0-9][0-9\s-]{7,18}$/.test(phone)) {
    throw fail("Enter a phone number with 8 to 15 digits.");
  }
  const digits = phone.replace(/\D/g, "").length;
  if (digits < 8 || digits > 15) {
    throw fail("Enter a phone number with 8 to 15 digits.");
  }
  return phone;
}

export function normalizeEmail(value: unknown, fail: Fail): string | null {
  const email = optionalText(value, 200, fail);
  if (email === null) {
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw fail("Enter a valid email address.");
  }
  return email;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127;
  });
}
