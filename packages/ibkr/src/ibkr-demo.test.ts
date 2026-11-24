import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  IbkrAccountSummarySchema,
  IbkrAuthStatusSchema,
  IbkrContractSearchSchema,
  IbkrLedgerSchema,
  IbkrHistorySchema,
  IbkrMarketSnapshotSchema,
  IbkrPerformanceSchema,
  IbkrPnlSchema,
  IbkrPortfolioAccountSchema,
  IbkrPositionSchema,
} from "./ibkr-api-schemas";
import { ibkrDemoPortalResponse } from "./ibkr-demo";

const bodyOf = (path: string, method = "GET", body = "") => {
  const response = ibkrDemoPortalResponse(method, path, body);
  expect(response.status).toBe(200);
  return response.body;
};

/** The demo's `pa/performance` for a period, its one account's series. */
const demoPerformance = (period: string) => {
  const { nav, cps } = Schema.decodeUnknownSync(IbkrPerformanceSchema)(
    bodyOf(
      "pa/performance",
      "POST",
      JSON.stringify({ acctIds: ["U1234567"], period })
    )
  );
  const [values] = nav?.data ?? [];
  const [cumulative] = cps?.data ?? [];
  return {
    dates: nav?.dates ?? [],
    navs: values?.navs ?? [],
    start: values?.startNAV?.val ?? Number.NaN,
    returns: cumulative?.returns ?? [],
  };
};

describe("IBKR demo account", () => {
  it("answers the dashboard's calls in IBKR's response shapes", () => {
    const accounts = Schema.decodeUnknownSync(
      Schema.Array(IbkrPortfolioAccountSchema)
    )(bodyOf("portfolio/accounts"));
    const accountId = accounts[0]?.accountId;
    expect(accountId).toBeDefined();
    const positions = Schema.decodeUnknownSync(
      Schema.Array(IbkrPositionSchema)
    )(bodyOf(`portfolio/${accountId}/positions/0`));
    const summary = Schema.decodeUnknownSync(IbkrAccountSummarySchema)(
      bodyOf(`portfolio/${accountId}/summary`)
    );
    const ledger = Schema.decodeUnknownSync(IbkrLedgerSchema)(
      bodyOf(`portfolio/${accountId}/ledger`)
    );
    Schema.decodeUnknownSync(IbkrAuthStatusSchema)(
      bodyOf("iserver/auth/status")
    );
    expect(bodyOf("tickle", "POST")).toMatchObject({ session: "demo" });

    // The totals agree with each other, as they would in a real account.
    const stockValue = positions.reduce(
      (total, position) => total + (position.mktValue ?? 0),
      0
    );
    expect(summary.grosspositionvalue?.amount).toBeCloseTo(stockValue, 2);
    // Each position's move today adds up to the account's, as on IBKR.
    const dailyPnl = positions.reduce(
      (total, position) => total + (position.dailyPnl ?? Number.NaN),
      0
    );
    const pnl = Schema.decodeUnknownSync(IbkrPnlSchema)(
      bodyOf("iserver/account/pnl/partitioned")
    );
    expect(pnl.upnl?.[`${accountId}.Core`]?.dpl).toBeCloseTo(dailyPnl, 1);
    expect(ledger.BASE?.netliquidationvalue).toBe(
      summary.netliquidation?.amount
    );
  });

  it("answers the asset page's calls for a held stock", () => {
    const [match] = Schema.decodeUnknownSync(IbkrContractSearchSchema)(
      bodyOf("iserver/secdef/search?symbol=AAPL")
    );
    expect(match).toMatchObject({ symbol: "AAPL", description: "NASDAQ" });
    const conid = String(match?.conid);
    expect(bodyOf(`iserver/contract/${conid}/info`)).toMatchObject({
      symbol: "AAPL",
    });
    const [price] = Schema.decodeUnknownSync(IbkrMarketSnapshotSchema)(
      bodyOf(`iserver/marketdata/snapshot?conids=${conid}&fields=31,6509`)
    );
    expect(price?.["31"]).toBe("231.85");
    const history = Schema.decodeUnknownSync(IbkrHistorySchema)(
      bodyOf(`iserver/marketdata/history?conid=${conid}&period=1y&bar=1d`)
    );
    // A year of weekdays, ending on today's price.
    expect(history.data).toHaveLength(261);
    expect(history.data.at(-1)?.c).toBe(231.85);
    expect(bodyOf("iserver/secdef/search?symbol=ZZZZ")).toEqual([]);
  });

  it("answers statistics that agree with the demo's own bars", () => {
    const [stats] = Schema.decodeUnknownSync(IbkrMarketSnapshotSchema)(
      bodyOf("iserver/marketdata/snapshot?conids=265598&fields=7293,7294,7290")
    );
    // Only the requested fields, like IBKR.
    expect(stats).not.toHaveProperty("31");
    const high = Number(stats?.["7293"]);
    const low = Number(stats?.["7294"]);
    expect(low).toBeLessThan(231.85);
    expect(high).toBeGreaterThan(231.85);
    expect(stats?.["7290"]).toBe((231.85 / 6.6).toFixed(2));
    // The ETF has no earnings, so no P/E.
    const [etf] = Schema.decodeUnknownSync(IbkrMarketSnapshotSchema)(
      bodyOf("iserver/marketdata/snapshot?conids=136155102&fields=7290,7287")
    );
    expect(etf).not.toHaveProperty("7290");
    expect(etf?.["7287"]).toMatch(/%$/u);
  });

  it("answers the account's performance for the period in the body", () => {
    const summary = Schema.decodeUnknownSync(IbkrAccountSummarySchema)(
      bodyOf("portfolio/U1234567/summary")
    );
    const month = demoPerformance("1M");
    // Weekdays, oldest first, ending on today's total.
    expect(month.dates).toHaveLength(month.navs.length);
    expect(month.dates[0]).toMatch(/^\d{8}$/u);
    expect(month.navs.at(-1)).toBe(summary.netliquidation?.amount);
    expect(month.returns.at(-1)).toBeCloseTo(
      (month.navs.at(-1) ?? 0) / month.start - 1,
      5
    );
    // Longer periods reach further back through the same series.
    const year = demoPerformance("12M");
    expect(year.dates.length).toBeGreaterThan(month.dates.length);
    expect(year.navs.at(-1)).toBe(month.navs.at(-1));
    expect(
      ibkrDemoPortalResponse("POST", "pa/performance", '{"period":"5Y"}').status
    ).toBe(400);
    expect(ibkrDemoPortalResponse("POST", "pa/performance").status).toBe(400);
  });

  it("returns IBKR's error shape for calls the demo doesn't cover", () => {
    expect(ibkrDemoPortalResponse("POST", "iserver/account/orders")).toEqual({
      status: 404,
      body: { error: "Not available in the demo." },
    });
  });
});
