import { CalendarDate } from "@internationalized/date";
import type { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  chartSessionAt,
  exchangeDate,
  parseTradingSchedule,
  scheduledSession,
  sessionAt,
} from "./ibkr-trading-schedule";

const weekday = {
  sessions: [{ openingTime: "0930", closingTime: "1600", prop: "LIQUID" }],
  tradingtimes: [
    { openingTime: "0400", closingTime: "2000", cancelDayOrders: "Y" },
  ],
};

/** As IBKR documents it: a venue per exchange, weekdays by code. */
const nasdaq = [
  {
    exchange: "NYSE",
    timezone: "America/New_York",
    schedules: [{ tradingScheduleDate: "20000103", ...weekday }],
  },
  {
    exchange: "NASDAQ",
    timezone: "America/New_York",
    schedules: [
      { tradingScheduleDate: "20000101", sessions: [], tradingtimes: [] },
      { tradingScheduleDate: "20000102", sessions: [], tradingtimes: [] },
      ...["20000103", "20000104", "20000105", "20000106", "20000107"].map(
        (tradingScheduleDate) => ({ tradingScheduleDate, ...weekday })
      ),
      // Thanksgiving shut, and the Friday after closing at 13:00.
      { tradingScheduleDate: 20_261_126, sessions: [], tradingtimes: [] },
      {
        tradingScheduleDate: "20261127",
        sessions: { openingTime: 930, closingTime: 1300 },
        tradingtimes: { openingTime: 400, closingTime: 1700 },
      },
    ],
  },
];

const iso = (time: number | undefined) =>
  time === undefined ? undefined : new Date(time).toISOString();

const sessionOn = (date: CalendarDate) => {
  const schedule = parseTradingSchedule(nasdaq, "NASDAQ");
  if (!schedule) {
    throw new Error("No schedule");
  }
  const session = scheduledSession(schedule, date);
  return (
    session && {
      start: iso(session.start),
      open: iso(session.open),
      close: iso(session.close),
      end: iso(session.end),
    }
  );
};

describe("trading schedule", () => {
  it("places a weekday's hours in winter time", () => {
    expect(sessionOn(new CalendarDate(2026, 11, 17))).toEqual({
      start: "2026-11-17T09:00:00.000Z",
      open: "2026-11-17T14:30:00.000Z",
      close: "2026-11-17T21:00:00.000Z",
      end: "2026-11-18T01:00:00.000Z",
    });
  });

  it("moves the open an hour on the Monday after the clocks go forward", () => {
    expect(sessionOn(new CalendarDate(2026, 3, 9))?.open).toBe(
      "2026-03-09T13:30:00.000Z"
    );
    expect(sessionOn(new CalendarDate(2026, 3, 6))?.open).toBe(
      "2026-03-06T14:30:00.000Z"
    );
  });

  it("has no session at the weekend or on a holiday", () => {
    expect(sessionOn(new CalendarDate(2026, 11, 21))).toBeUndefined();
    expect(sessionOn(new CalendarDate(2026, 11, 26))).toBeUndefined();
  });

  it("uses a dated early close over the weekday's hours", () => {
    expect(sessionOn(new CalendarDate(2026, 11, 27))).toEqual({
      start: "2026-11-27T09:00:00.000Z",
      open: "2026-11-27T14:30:00.000Z",
      close: "2026-11-27T18:00:00.000Z",
      end: "2026-11-27T22:00:00.000Z",
    });
  });

  it("treats the whole trading day as regular hours without sessions", () => {
    const schedule = parseTradingSchedule({
      exchange: "IBIS",
      timezone: "Europe/Berlin",
      schedules: [
        {
          tradingScheduleDate: "20000103",
          tradingTimes: [{ openingTime: "0900", closingTime: "1730" }],
        },
      ],
    });
    const session =
      schedule && scheduledSession(schedule, new CalendarDate(2026, 11, 16));
    expect(iso(session?.open)).toBe("2026-11-16T08:00:00.000Z");
    expect(iso(session?.end)).toBe("2026-11-16T16:30:00.000Z");
  });

  it("reads the exchange's date, not UTC's", () => {
    const schedule = parseTradingSchedule(nasdaq, "NASDAQ");
    // 01:30 UTC on the 18th is still the 17th in New York.
    const date =
      schedule && exchangeDate(schedule, Date.UTC(2026, 10, 18, 1, 30));
    expect(date?.toString()).toBe("2026-11-17");
  });

  it("gives no venue's hours when several came back and none matches", () => {
    expect(parseTradingSchedule(nasdaq, "ARCA")).toBeUndefined();
  });

  it("gives up without a time zone it knows", () => {
    expect(
      parseTradingSchedule({ timezone: "Mars/Olympus", schedules: [] })
    ).toBeUndefined();
  });
});

/** One Monday's hours, placed on Monday 16 November 2026 in New York. */
const place = (
  day: { sessions?: Schema.Json; tradingtimes?: Schema.Json },
  date = new CalendarDate(2026, 11, 16)
) => {
  const schedule = parseTradingSchedule({
    exchange: "X",
    timezone: "America/New_York",
    schedules: [{ tradingScheduleDate: "20000103", ...day }],
  });
  const session = schedule && scheduledSession(schedule, date);
  return (
    session && {
      start: iso(session.start),
      open: iso(session.open),
      close: iso(session.close),
      end: iso(session.end),
    }
  );
};

describe("trading schedule edge cases", () => {
  it("opens a session that runs over midnight the evening before", () => {
    expect(
      place({ tradingtimes: [{ openingTime: "1700", closingTime: "1600" }] })
    ).toEqual({
      start: "2026-11-15T22:00:00.000Z",
      open: "2026-11-15T22:00:00.000Z",
      close: "2026-11-16T21:00:00.000Z",
      end: "2026-11-16T21:00:00.000Z",
    });
  });

  it("leaves an overnight interval ending that morning out of the day", () => {
    expect(
      place({
        sessions: [{ openingTime: "0930", closingTime: "1600" }],
        tradingtimes: [
          { openingTime: "2000", closingTime: "0350" },
          { openingTime: "0400", closingTime: "2000" },
        ],
      })?.start
    ).toBe("2026-11-16T09:00:00.000Z");
  });

  it("spans split trading intervals and a separate after-hours window", () => {
    expect(
      place({
        sessions: [
          { openingTime: "0930", closingTime: "1200" },
          { openingTime: "1300", closingTime: "1600" },
        ],
        tradingtimes: [
          { openingTime: "0930", closingTime: "1200" },
          { openingTime: "1300", closingTime: "1600" },
          { openingTime: "1610", closingTime: "2000" },
        ],
      })
    ).toEqual({
      start: "2026-11-16T14:30:00.000Z",
      open: "2026-11-16T14:30:00.000Z",
      close: "2026-11-16T21:00:00.000Z",
      end: "2026-11-17T01:00:00.000Z",
    });
  });

  it("skips intervals with missing or impossible times", () => {
    expect(
      place({
        tradingtimes: [
          { openingTime: null, closingTime: "" },
          { openingTime: "0960", closingTime: "1600" },
          { closingTime: "1600" },
        ],
      })
    ).toBeUndefined();
  });

  it("reads 0000-0000 as shut, as IBKR marks weekends and holidays", () => {
    expect(
      place({ tradingtimes: [{ openingTime: "0000", closingTime: "0000" }] })
    ).toBeUndefined();
  });

  it("reads IBKR's real NASDAQ schedule: regular hours only, weekends shut", () => {
    const schedule = parseTradingSchedule(
      [
        {
          id: "p124448",
          exchange: "NASDAQ",
          timezone: "America/New_York",
          schedules: [
            ...["20000101", "20000102"].map((tradingScheduleDate) => ({
              tradingScheduleDate,
              sessions: [],
              tradingtimes: [
                {
                  openingTime: "0000",
                  closingTime: "0000",
                  cancelDayOrders: "N",
                },
              ],
            })),
            {
              tradingScheduleDate: "20000104",
              sessions: [],
              tradingtimes: [
                { openingTime: "0930", closingTime: "1600", prop: "LIQUID" },
              ],
            },
          ],
        },
      ],
      "NASDAQ"
    );
    const tuesday =
      schedule && scheduledSession(schedule, new CalendarDate(2026, 11, 17));
    expect(iso(tuesday?.start)).toBe("2026-11-17T14:30:00.000Z");
    expect(iso(tuesday?.end)).toBe("2026-11-17T21:00:00.000Z");
    expect(
      schedule && scheduledSession(schedule, new CalendarDate(2026, 11, 21))
    ).toBeUndefined();
  });

  it("counts a split day without liquid hours as regular throughout", () => {
    expect(
      place({
        tradingtimes: [
          { openingTime: "1300", closingTime: "1600" },
          { openingTime: "0930", closingTime: "1200" },
        ],
      })
    ).toEqual({
      start: "2026-11-16T14:30:00.000Z",
      open: "2026-11-16T14:30:00.000Z",
      close: "2026-11-16T21:00:00.000Z",
      end: "2026-11-16T21:00:00.000Z",
    });
  });
});

describe("the session a bar belongs to", () => {
  const futures = parseTradingSchedule({
    exchange: "CME",
    timezone: "America/Chicago",
    schedules: ["20000103", "20000104", "20000105", "20000106", "20000107"].map(
      (tradingScheduleDate) => ({
        tradingScheduleDate,
        tradingtimes: [{ openingTime: "1700", closingTime: "1600" }],
      })
    ),
  });
  const nyse = parseTradingSchedule(nasdaq, "NASDAQ");

  it("puts a Sunday-evening bar in Monday's session", () => {
    const session = futures && sessionAt(futures, Date.UTC(2026, 10, 16, 0, 0));
    expect(iso(session?.close)).toBe("2026-11-16T22:00:00.000Z");
  });

  it("keeps a late after-hours bar in its own day", () => {
    // 19:55 in New York on the 17th is 00:55 UTC on the 18th.
    const session = nyse && sessionAt(nyse, Date.UTC(2026, 10, 18, 0, 55));
    expect(iso(session?.open)).toBe("2026-11-17T14:30:00.000Z");
  });

  it("gives the last session before the market opens", () => {
    // 03:00 on Monday the 16th in New York: Friday's session.
    const session = nyse && sessionAt(nyse, Date.UTC(2026, 10, 16, 8, 0));
    expect(iso(session?.open)).toBe("2026-11-13T14:30:00.000Z");
  });
});

describe("the session a chart shows", () => {
  // Regular hours only, as a venue may list them: no pre-market.
  const regularOnly = parseTradingSchedule({
    exchange: "NASDAQ",
    timezone: "America/New_York",
    schedules: ["20000103", "20000104", "20000105", "20000106", "20000107"].map(
      (tradingScheduleDate) => ({
        tradingScheduleDate,
        tradingtimes: [{ openingTime: "0930", closingTime: "1600" }],
      })
    ),
  });

  it("gives that day's session to a pre-market bar before it opens", () => {
    // 05:20 on Wednesday the 18th in New York.
    const session =
      regularOnly &&
      chartSessionAt(regularOnly, Date.UTC(2026, 10, 18, 10, 20));
    expect(iso(session?.open)).toBe("2026-11-18T14:30:00.000Z");
  });

  it("keeps the day's session for an after-hours bar", () => {
    // 18:00 on the 18th.
    const session =
      regularOnly && chartSessionAt(regularOnly, Date.UTC(2026, 10, 18, 23, 0));
    expect(iso(session?.open)).toBe("2026-11-18T14:30:00.000Z");
  });

  it("gives Friday's session to a weekend bar", () => {
    // Saturday the 21st, noon.
    const session =
      regularOnly && chartSessionAt(regularOnly, Date.UTC(2026, 10, 21, 17, 0));
    expect(iso(session?.open)).toBe("2026-11-20T14:30:00.000Z");
  });
});
