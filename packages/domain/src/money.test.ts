import { describe, expect, it } from "vitest";
import {
  INR_MINOR_SCALE,
  Money,
  MoneyError,
  Ratio,
  roundHalfUp,
} from "./money.js";

describe("Money", () => {
  it("adds decimal amounts that floating point cannot represent exactly", () => {
    const sum = Money.parse("0.10").add(Money.parse("0.20"));
    expect(sum.equals(Money.parse("0.30"))).toBe(true);
    expect(sum.toDecimalString()).toBe("0.3");
  });

  it("subtracts amounts, including down through zero", () => {
    expect(
      Money.parse("10.50").subtract(Money.parse("0.25")).toDecimalString(),
    ).toBe("10.25");
    expect(Money.parse("5").subtract(Money.parse("5")).isZero()).toBe(true);
    expect(Money.parse("1").subtract(Money.parse("2")).isNegative()).toBe(true);
    expect(
      Money.parse("1").subtract(Money.parse("2")).equals(Money.parse("-1")),
    ).toBe(true);
  });

  it("treats equivalent writings as the same amount", () => {
    expect(Money.parse("1.50").equals(Money.parse("1.5"))).toBe(true);
    expect(Money.parse("-0").equals(Money.zero())).toBe(true);
    expect(Money.parse("10.50").equals(Money.fromMinor(1050n, INR_MINOR_SCALE))).toBe(
      true,
    );
  });

  it("orders amounts", () => {
    expect(Money.parse("1").compare(Money.parse("1.01"))).toBe(-1);
    expect(Money.parse("2").compare(Money.parse("2.0"))).toBe(0);
    expect(Money.parse("-1").compare(Money.parse("-2"))).toBe(1);
  });

  it("divides exact amounts without rounding", () => {
    expect(Money.parse("10").dividedBy(Money.parse("4")).toDecimalString()).toBe("2.5");
    const included = Money.parse("100").times(Ratio.parse("100")).dividedBy(Money.parse("118"));
    expect(roundHalfUp(included, INR_MINOR_SCALE).toDecimalString()).toBe("84.75");
    expect(() => Money.parse("1").dividedBy(Money.zero())).toThrow(MoneyError);
  });

  it("multiplies by an exact ratio without rounding", () => {
    const tax = Money.parse("250").times(Ratio.percent("18"));
    expect(tax.toDecimalString()).toBe("45");

    const quantity = Money.parse("10.50").times(Ratio.parse("1.5"));
    expect(quantity.toDecimalString()).toBe("15.75");
  });

  it("keeps a non-terminating product exact until rounding", () => {
    const raw = Money.parse("100").times(Ratio.of(100n, 118n));
    expect(() => raw.toDecimalString()).toThrow(MoneyError);
    expect(roundHalfUp(raw, INR_MINOR_SCALE).toDecimalString()).toBe("84.75");
    expect(() => raw.toDecimalString()).toThrow(MoneyError);
  });

  it("does not change the original amount when adding or rounding", () => {
    const original = Money.parse("1.005");
    original.add(Money.parse("1"));
    roundHalfUp(original, INR_MINOR_SCALE);
    expect(original.toDecimalString()).toBe("1.005");
  });

  it("rejects values that are not decimal strings", () => {
    for (const input of ["", "10.5.0", "1e2", " 1", "1 ", "+1", "01.00", "0.123456789"]) {
      expect(() => Money.parse(input)).toThrow(MoneyError);
    }
    expect(() => Money.parse(10.5 as unknown as string)).toThrow(MoneyError);
    expect(() => Money.fromMinor(10 as unknown as bigint, 2)).toThrow(MoneyError);
    expect(() => Ratio.of(1n, 0n)).toThrow(MoneyError);
  });
});

describe("roundHalfUp", () => {
  it("rounds half away from zero at the requested scale", () => {
    expect(roundHalfUp(Money.parse("1.005"), 2).toDecimalString()).toBe("1.01");
    expect(roundHalfUp(Money.parse("1.004"), 2).toDecimalString()).toBe("1");
    expect(roundHalfUp(Money.parse("1.225"), 2).toDecimalString()).toBe("1.23");
    expect(roundHalfUp(Money.parse("2.5"), 0).toDecimalString()).toBe("3");
    expect(roundHalfUp(Money.parse("10.50"), 0).toDecimalString()).toBe("11");
    expect(roundHalfUp(Money.parse("10.49"), 0).toDecimalString()).toBe("10");
    expect(roundHalfUp(Money.parse("-1.5"), 0).toDecimalString()).toBe("-2");
    expect(roundHalfUp(Money.parse("-1.25"), 0).toDecimalString()).toBe("-1");
    expect(roundHalfUp(Money.parse("-0.5"), 0).toDecimalString()).toBe("-1");
  });

  it("uses paise when the INR scale is requested", () => {
    expect(INR_MINOR_SCALE).toBe(2);
    expect(roundHalfUp(Money.parse("10.504"), INR_MINOR_SCALE).toDecimalString()).toBe(
      "10.5",
    );
    expect(roundHalfUp(Money.parse("10.505"), INR_MINOR_SCALE).toDecimalString()).toBe(
      "10.51",
    );
  });

  it("rejects a scale outside the supported range", () => {
    expect(() => roundHalfUp(Money.parse("1"), -1)).toThrow(MoneyError);
    expect(() => roundHalfUp(Money.parse("1"), 1.5)).toThrow(MoneyError);
    expect(() => roundHalfUp(Money.parse("1"), 9)).toThrow(MoneyError);
  });
});
