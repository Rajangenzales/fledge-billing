export function sumOutstandingAmounts(settlements) {
  const totalPaise = settlements.reduce((total, settlement) => {
    const value = settlement?.outstandingAmount;
    if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value)) {
      throw new Error("An invoice outstanding balance is invalid.");
    }
    const [whole, fraction = ""] = value.split(".");
    return total + BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  }, 0n);

  const whole = totalPaise / 100n;
  const fraction = (totalPaise % 100n).toString().padStart(2, "0");
  return fraction === "00" ? whole.toString() : `${whole}.${fraction}`;
}

export function formatOutstandingBalance(value) {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value)) {
    return "Unavailable";
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value));
}
