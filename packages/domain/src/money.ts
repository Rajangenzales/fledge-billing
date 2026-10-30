/**
 * Exact INR amounts for billing calculations.
 *
 * Values are reduced rational numbers in rupees (bigint numerator and
 * denominator). Arithmetic does not round. Callers round only through
 * `roundHalfUp` at a chosen decimal scale. `INR_MINOR_SCALE` is 2 (paise).
 */

export const INR_MINOR_SCALE = 2;

const MAX_DECIMAL_SCALE = 8;
const MAX_INTEGER_DIGITS = 15;

const moneyParts = new WeakMap<Money, Parts>();
const ratioParts = new WeakMap<Ratio, Parts>();

type Parts = {
  numerator: bigint;
  denominator: bigint;
};

export class MoneyError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string) {
    super(userMessage);
    this.name = "MoneyError";
    this.userMessage = userMessage;
  }
}

/** Exact multiplier, such as a quantity or a percentage. Not an amount of money. */
export class Ratio {
  private constructor(numerator: bigint, denominator: bigint) {
    ratioParts.set(this, reduce(numerator, denominator));
  }

  static of(numerator: bigint, denominator: bigint): Ratio {
    assertBigInt(numerator, "Ratio numerator");
    assertBigInt(denominator, "Ratio denominator");
    if (denominator === 0n) {
      throw new MoneyError("Ratio denominator must not be zero.");
    }
    return new Ratio(numerator, denominator);
  }

  /** Parses a decimal string such as "1.5". Rejects JavaScript number syntax. */
  static parse(input: string): Ratio {
    const parsed = parseDecimal(input, "Ratio");
    return new Ratio(parsed.numerator, parsed.denominator);
  }

  /** Parses a percent string. "18" is 18/100 and "0.25" is 0.25/100. */
  static percent(input: string): Ratio {
    const parsed = parseDecimal(input, "Percent");
    return new Ratio(parsed.numerator, parsed.denominator * 100n);
  }
}

/** Exact rupee amount. Construct with `parse` or `fromMinor`, never from a number. */
export class Money {
  private constructor(numerator: bigint, denominator: bigint) {
    moneyParts.set(this, reduce(numerator, denominator));
  }

  static zero(): Money {
    return new Money(0n, 1n);
  }

  /** Parses a rupee amount such as "10.50" or "-0.25". */
  static parse(input: string): Money {
    const parsed = parseDecimal(input, "Amount");
    return new Money(parsed.numerator, parsed.denominator);
  }

  /**
   * Builds an amount from minor units.
   * `Money.fromMinor(1050n, INR_MINOR_SCALE)` is ₹10.50.
   */
  static fromMinor(minor: bigint, scale: number): Money {
    assertBigInt(minor, "Minor units");
    assertScale(scale);
    return new Money(minor, 10n ** BigInt(scale));
  }

  add(other: Money): Money {
    const left = readMoney(this);
    const right = readMoney(other);
    return new Money(
      left.numerator * right.denominator + right.numerator * left.denominator,
      left.denominator * right.denominator,
    );
  }

  subtract(other: Money): Money {
    const left = readMoney(this);
    const right = readMoney(other);
    return new Money(
      left.numerator * right.denominator - right.numerator * left.denominator,
      left.denominator * right.denominator,
    );
  }

  times(factor: Ratio): Money {
    const amount = readMoney(this);
    const ratio = readRatio(factor);
    return new Money(
      amount.numerator * ratio.numerator,
      amount.denominator * ratio.denominator,
    );
  }

  compare(other: Money): -1 | 0 | 1 {
    const left = readMoney(this);
    const right = readMoney(other);
    const leftValue = left.numerator * right.denominator;
    const rightValue = right.numerator * left.denominator;
    if (leftValue < rightValue) return -1;
    if (leftValue > rightValue) return 1;
    return 0;
  }

  equals(other: Money): boolean {
    return this.compare(other) === 0;
  }

  isZero(): boolean {
    return readMoney(this).numerator === 0n;
  }

  isNegative(): boolean {
    return readMoney(this).numerator < 0n;
  }

  /**
   * Shortest terminating decimal. Throws when the value does not terminate
   * within the supported scale, which means it still needs `roundHalfUp`.
   */
  toDecimalString(): string {
    const { numerator, denominator } = readMoney(this);
    let factor = 1n;
    for (let scale = 0; scale <= MAX_DECIMAL_SCALE; scale += 1) {
      if ((numerator * factor) % denominator === 0n) {
        return formatMinor(numerator * factor / denominator, scale);
      }
      factor *= 10n;
    }
    throw new MoneyError(
      "Amount is not a terminating decimal. Round it before formatting.",
    );
  }
}

/**
 * Rounds half away from zero to `decimalPlaces`.
 * This is the only rounding operation. Addition, subtraction, and
 * multiplication leave the exact rational unchanged.
 */
export function roundHalfUp(amount: Money, decimalPlaces: number): Money {
  const { numerator, denominator } = readMoney(amount);
  assertScale(decimalPlaces);
  const scale = 10n ** BigInt(decimalPlaces);
  const minor = divRoundHalfAwayFromZero(numerator * scale, denominator);
  return Money.fromMinor(minor, decimalPlaces);
}

function readMoney(amount: Money): Parts {
  if (!(amount instanceof Money)) {
    throw new MoneyError("Expected a money amount.");
  }
  const value = moneyParts.get(amount);
  if (!value) {
    throw new MoneyError("Expected a money amount.");
  }
  return value;
}

function readRatio(factor: Ratio): Parts {
  if (!(factor instanceof Ratio)) {
    throw new MoneyError("Expected a ratio.");
  }
  const value = ratioParts.get(factor);
  if (!value) {
    throw new MoneyError("Expected a ratio.");
  }
  return value;
}

function reduce(numerator: bigint, denominator: bigint): Parts {
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  if (numerator === 0n) {
    return { numerator: 0n, denominator: 1n };
  }
  const divisor = gcd(numerator, denominator);
  return {
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  };
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x;
}

function divRoundHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

function parseDecimal(input: string, label: string): Parts {
  if (typeof input !== "string") {
    throw new MoneyError(`${label} must be a decimal string.`);
  }
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(input);
  if (!match) {
    throw new MoneyError(
      `${label} must be a decimal string such as "10.50", without spaces or exponents.`,
    );
  }
  const sign = match[1] === "-" ? -1n : 1n;
  const whole = match[2] ?? "";
  const fraction = match[3] ?? "";
  if (whole.length > 1 && whole.startsWith("0")) {
    throw new MoneyError(`${label} must not include leading zeros.`);
  }
  if (whole.length > MAX_INTEGER_DIGITS) {
    throw new MoneyError(
      `${label} must not exceed ${MAX_INTEGER_DIGITS} digits before the decimal point.`,
    );
  }
  if (fraction.length > MAX_DECIMAL_SCALE) {
    throw new MoneyError(
      `${label} must not exceed ${MAX_DECIMAL_SCALE} digits after the decimal point.`,
    );
  }
  const digits = whole + fraction;
  const numerator = sign * BigInt(digits);
  const denominator = 10n ** BigInt(fraction.length);
  return reduce(numerator, denominator);
}

function assertScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 0 || scale > MAX_DECIMAL_SCALE) {
    throw new MoneyError(
      `Decimal places must be a whole number from 0 to ${MAX_DECIMAL_SCALE}.`,
    );
  }
}

function assertBigInt(value: bigint, label: string): void {
  if (typeof value !== "bigint") {
    throw new MoneyError(`${label} must be an integer.`);
  }
}

function formatMinor(minor: bigint, scale: number): string {
  const sign = minor < 0n ? "-" : "";
  const absolute = minor < 0n ? -minor : minor;
  const digits = absolute.toString().padStart(scale + 1, "0");
  if (scale === 0) {
    return sign + digits;
  }
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale).replace(/0+$/, "");
  if (fraction.length === 0) {
    return sign + whole;
  }
  return `${sign}${whole}.${fraction}`;
}
