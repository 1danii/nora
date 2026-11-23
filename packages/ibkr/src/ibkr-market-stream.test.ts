import { describe, expect, it } from "vitest";

import { parseIbkrQuoteMessage } from "./ibkr-market-stream";

describe("IBKR market data push", () => {
  it("reads a quote's changed fields and its subscription", () => {
    expect(
      parseIbkrQuoteMessage(
        JSON.stringify({
          topic: "smd+4815747",
          conid: 4_815_747,
          _updated: 1_763_456_400_000,
          "31": "160.29",
          "83": 3.11,
        })
      )
    ).toEqual({ conidEx: "4815747", fields: { "31": "160.29", "83": 3.11 } });
  });

  it("keeps the venue of a directed subscription", () => {
    expect(
      parseIbkrQuoteMessage(
        JSON.stringify({ topic: "smd+4815747@OVERNIGHT", "31": "160.10" })
      )?.conidEx
    ).toBe("4815747@OVERNIGHT");
  });

  it("skips system messages, heartbeats and pushes without fields", () => {
    expect(
      parseIbkrQuoteMessage(JSON.stringify({ topic: "system", hb: 1 }))
    ).toBeUndefined();
    expect(
      parseIbkrQuoteMessage(JSON.stringify({ topic: "smd+4815747" }))
    ).toBeUndefined();
    expect(parseIbkrQuoteMessage("not json")).toBeUndefined();
  });
});
