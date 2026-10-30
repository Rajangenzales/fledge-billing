import { describe, expect, it } from "vitest";
import {
  STATE_UTS,
  activeStateUts,
  findStateUtByGstStateCode,
  findStateUtById,
} from "./state-ut.js";

describe("State and UT master", () => {
  it("lists every current state and union territory, plus former Daman and Diu", () => {
    const active = activeStateUts();
    expect(active.filter((record) => record.type === "state")).toHaveLength(28);
    expect(active.filter((record) => record.type === "union_territory")).toHaveLength(8);
    expect(STATE_UTS.filter((record) => !record.active).map((record) => record.gstStateCode)).toEqual([
      "25",
    ]);
    expect(STATE_UTS.every((record) => record.countryCode === "IN")).toBe(true);
  });

  it("uses current GST codes for places that changed after GST began", () => {
    expect(findStateUtByGstStateCode("32")).toMatchObject({
      id: "IN-KL",
      name: "Kerala",
      type: "state",
      active: true,
    });
    expect(findStateUtByGstStateCode("7")).toMatchObject({
      id: "IN-DL",
      name: "Delhi",
      type: "union_territory",
    });
    expect(findStateUtById("IN-LA")).toMatchObject({
      gstStateCode: "38",
      name: "Ladakh",
      type: "union_territory",
    });
    expect(findStateUtByGstStateCode("37")).toMatchObject({ name: "Andhra Pradesh", code: "AP" });
    expect(findStateUtByGstStateCode("36")).toMatchObject({ name: "Telangana", code: "TS" });
    expect(findStateUtByGstStateCode("21")).toMatchObject({ name: "Odisha" });
    expect(findStateUtByGstStateCode("26")).toMatchObject({
      name: "Dadra and Nagar Haveli and Daman and Diu",
      active: true,
    });
    expect(findStateUtByGstStateCode("25")).toMatchObject({
      name: "Daman and Diu",
      active: false,
    });
  });

  it("does not treat other-territory or other-country codes as states", () => {
    expect(findStateUtByGstStateCode("28")).toBeUndefined();
    expect(findStateUtByGstStateCode("97")).toBeUndefined();
    expect(findStateUtByGstStateCode("99")).toBeUndefined();
    expect(findStateUtByGstStateCode("")).toBeUndefined();
    expect(findStateUtById("Kerala")).toBeUndefined();
  });
});
