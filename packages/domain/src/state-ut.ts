/**
 * Indian State and Union Territory master.
 *
 * GST state codes follow the e-invoice master codes and the e-way bill state
 * code list. Code 26 is the merged Union Territory from 26 January 2020.
 * Code 25 (former Daman and Diu) stays in the master as inactive so older
 * GSTINs can still be recognised. Codes 97 and 99 are not States or Union
 * Territories and are not seeded.
 *
 * Sources:
 * - https://einvoice1.gst.gov.in/Others/MasterCodes
 * - https://docs.ewaybillgst.gov.in/apidocs/state-code.html
 */

export type StateUtType = "state" | "union_territory";

export type StateUt = {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly gstStateCode: string;
  readonly type: StateUtType;
  readonly countryCode: "IN";
  readonly active: boolean;
};

const CODE = /^[A-Z]{2}$/;
const GST_CODE = /^\d{2}$/;

function jurisdiction(
  gstStateCode: string,
  code: string,
  name: string,
  type: StateUtType,
  active: boolean,
): StateUt {
  return {
    id: `IN-${code}`,
    name,
    code,
    gstStateCode,
    type,
    countryCode: "IN",
    active,
  };
}

const state = (gstStateCode: string, code: string, name: string): StateUt =>
  jurisdiction(gstStateCode, code, name, "state", true);

const territory = (gstStateCode: string, code: string, name: string, active = true): StateUt =>
  jurisdiction(gstStateCode, code, name, "union_territory", active);

export const STATE_UTS: readonly StateUt[] = [
  territory("01", "JK", "Jammu and Kashmir"),
  state("02", "HP", "Himachal Pradesh"),
  state("03", "PB", "Punjab"),
  territory("04", "CH", "Chandigarh"),
  state("05", "UK", "Uttarakhand"),
  state("06", "HR", "Haryana"),
  territory("07", "DL", "Delhi"),
  state("08", "RJ", "Rajasthan"),
  state("09", "UP", "Uttar Pradesh"),
  state("10", "BR", "Bihar"),
  state("11", "SK", "Sikkim"),
  state("12", "AR", "Arunachal Pradesh"),
  state("13", "NL", "Nagaland"),
  state("14", "MN", "Manipur"),
  state("15", "MZ", "Mizoram"),
  state("16", "TR", "Tripura"),
  state("17", "ML", "Meghalaya"),
  state("18", "AS", "Assam"),
  state("19", "WB", "West Bengal"),
  state("20", "JH", "Jharkhand"),
  state("21", "OD", "Odisha"),
  state("22", "CG", "Chhattisgarh"),
  state("23", "MP", "Madhya Pradesh"),
  state("24", "GJ", "Gujarat"),
  territory("25", "DD", "Daman and Diu", false),
  territory("26", "DH", "Dadra and Nagar Haveli and Daman and Diu"),
  state("27", "MH", "Maharashtra"),
  state("29", "KA", "Karnataka"),
  state("30", "GA", "Goa"),
  territory("31", "LD", "Lakshadweep"),
  state("32", "KL", "Kerala"),
  state("33", "TN", "Tamil Nadu"),
  territory("34", "PY", "Puducherry"),
  territory("35", "AN", "Andaman and Nicobar Islands"),
  state("36", "TS", "Telangana"),
  state("37", "AP", "Andhra Pradesh"),
  territory("38", "LA", "Ladakh"),
];

assertStateUtMaster(STATE_UTS);

export function activeStateUts(records: readonly StateUt[] = STATE_UTS): readonly StateUt[] {
  return records.filter((record) => record.active);
}

export function findStateUtById(
  id: string,
  records: readonly StateUt[] = STATE_UTS,
): StateUt | undefined {
  return records.find((record) => record.id === id);
}

/** Accepts "32" and "7". Returns undefined when the code is not in the master. */
export function findStateUtByGstStateCode(
  gstStateCode: string,
  records: readonly StateUt[] = STATE_UTS,
): StateUt | undefined {
  const normalized = normalizeGstStateCode(gstStateCode);
  if (!normalized) {
    return undefined;
  }
  return records.find((record) => record.gstStateCode === normalized);
}

function normalizeGstStateCode(input: string): string | undefined {
  if (!/^\d{1,2}$/.test(input)) {
    return undefined;
  }
  return input.padStart(2, "0");
}

function assertStateUtMaster(records: readonly StateUt[]): void {
  const ids = new Set<string>();
  const codes = new Set<string>();
  const gstCodes = new Set<string>();
  for (const record of records) {
    if (!CODE.test(record.code) || record.id !== `IN-${record.code}`) {
      throw new Error(`State/UT "${record.name}" has an invalid code.`);
    }
    if (!GST_CODE.test(record.gstStateCode)) {
      throw new Error(`State/UT "${record.name}" has an invalid GST state code.`);
    }
    if (record.countryCode !== "IN") {
      throw new Error(`State/UT "${record.name}" must use country code IN.`);
    }
    if (ids.has(record.id) || codes.has(record.code) || gstCodes.has(record.gstStateCode)) {
      throw new Error(`State/UT "${record.name}" repeats an id, code, or GST state code.`);
    }
    ids.add(record.id);
    codes.add(record.code);
    gstCodes.add(record.gstStateCode);
  }
}
