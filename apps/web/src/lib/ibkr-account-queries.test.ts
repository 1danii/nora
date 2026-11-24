import { describe, expect, it } from "vitest";

import { performanceOf } from "./ibkr-account-queries";

const dates = ["20261102", "20261103", "20261104"];

/** A `pa/performance` answer for one account. */
const answer = (navs: number[], returns: (number | null)[]) => ({
  nav: {
    dates,
    data: [{ id: "U1", navs, startNAV: { date: "20261030", val: 1000 } }],
  },
  cps: { dates, data: [{ id: "U1", returns }] },
});

describe("performanceOf", () => {
  it("leaves a deposit out of the money earned", () => {
    // +10% on 1000, then 500 deposited with no move, then +10% on 1600.
    const performance = performanceOf(
      "U1",
      answer([1100, 1600, 1760], [0.1, 0.1, 0.21])
    );
    expect(performance.returns).toEqual([0.1, 0.1, 0.21]);
    expect(performance.earned[0]).toBeCloseTo(100);
    expect(performance.earned[1]).toBeCloseTo(100);
    expect(performance.earned[2]).toBeCloseTo(260);
  });

  it("takes the value's own change where cps has no return", () => {
    const performance = performanceOf(
      "U1",
      answer([1100, 1210, 1331], [0.1, null, 0.331])
    );
    expect(performance.returns[1]).toBeCloseTo(0.21);
    expect(performance.earned).toEqual([
      expect.closeTo(100),
      expect.closeTo(210),
      expect.closeTo(331),
    ]);
  });
});
