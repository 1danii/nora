import { describe, expect, it } from "vitest";

import {
  inUsOvernightSession,
  tradesOvernight,
  withQuoteFields,
} from "./ibkr-asset-queries";

/** A New York wall-clock time in November 2026 (EST, UTC-5) as epoch ms. */
const newYork = (day: number, hour: number, minute = 0) =>
  Date.UTC(2026, 10, day, hour + 5, minute);

describe("US overnight session", () => {
  it("runs from 20:00 to 03:50 New York time", () => {
    // Tuesday the 17th, evening, and Wednesday the 18th, early morning.
    expect(inUsOvernightSession(newYork(17, 19, 59))).toBe(false);
    expect(inUsOvernightSession(newYork(17, 20))).toBe(true);
    expect(inUsOvernightSession(newYork(18, 3, 49))).toBe(true);
    expect(inUsOvernightSession(newYork(18, 3, 50))).toBe(false);
    expect(inUsOvernightSession(newYork(18, 4, 10))).toBe(false);
  });

  it("opens Sunday evening and closes Friday morning", () => {
    // Sunday the 15th, Friday the 20th, Saturday the 21st.
    expect(inUsOvernightSession(newYork(15, 21))).toBe(true);
    expect(inUsOvernightSession(newYork(20, 2))).toBe(true);
    expect(inUsOvernightSession(newYork(20, 21))).toBe(false);
    expect(inUsOvernightSession(newYork(21, 2))).toBe(false);
  });
});

describe("overnight eligibility", () => {
  it("reads OVERNIGHT from the contract's exchanges", () => {
    expect(tradesOvernight({ valid_exchanges: "SMART,NASDAQ,OVERNIGHT" })).toBe(
      true
    );
    expect(tradesOvernight({ valid_exchanges: "SMART,IBIS" })).toBe(false);
    expect(tradesOvernight({})).toBe(false);
  });
});

describe("live quote pushes", () => {
  it("apply only the changed fields to the last snapshot", () => {
    const snapshot = [{ conid: 4_815_747, "31": "159.72", "7741": "155.46" }];
    expect(withQuoteFields(snapshot, { "31": "160.29" })).toEqual([
      { conid: 4_815_747, "31": "160.29", "7741": "155.46" },
    ]);
  });

  it("start a snapshot when there was none", () => {
    expect(withQuoteFields(null, { "31": "160.10" })).toEqual([
      { "31": "160.10" },
    ]);
  });
});
