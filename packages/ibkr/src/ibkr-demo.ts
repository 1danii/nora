import { Option, Schema } from "effect";

import type {
  IbkrAccountSummary,
  IbkrLedger,
  IbkrPnl,
  IbkrPortfolioAccount,
  IbkrPosition,
} from "./ibkr-api-schemas";
import type {
  IbkrPortalResponse,
  IbkrResearchNamespace,
} from "./ibkr-browser-schemas";

/**
 * A made-up IBKR account for "Try demo". Responses use the same paths and
 * shapes as the Client Portal API, so the dashboard can't tell the difference.
 * The numbers are fixed rather than random, so the demo looks the same on
 * every visit and the totals add up.
 */

export const ibkrDemoUsername = "Demo";
const accountId = "U1234567";
const currency = "USD";

export const ibkrDemoAccounts = [
  {
    accountId,
    currency,
    desc: accountId,
    displayName: accountId,
    type: "INDIVIDUAL",
  },
] as const satisfies readonly IbkrPortfolioAccount[];

const holdings = [
  {
    conid: 265_598,
    ticker: "AAPL",
    name: "APPLE INC",
    isin: "US0378331005",
    listingExchange: "NASDAQ",
    position: 40,
    avgCost: 182.4,
    mktPrice: 231.85,
  },
  {
    conid: 272_093,
    ticker: "MSFT",
    name: "MICROSOFT CORP",
    isin: "US5949181045",
    listingExchange: "NASDAQ",
    position: 18,
    avgCost: 371.2,
    mktPrice: 428.6,
  },
  {
    conid: 4_815_747,
    ticker: "NVDA",
    name: "NVIDIA CORP",
    isin: "US67066G1040",
    listingExchange: "NASDAQ",
    position: 55,
    avgCost: 96.3,
    mktPrice: 141.2,
  },
  {
    conid: 208_813_719,
    ticker: "GOOGL",
    name: "ALPHABET INC-CL A",
    isin: "US02079K3059",
    listingExchange: "NASDAQ",
    position: 25,
    avgCost: 168.75,
    mktPrice: 162.3,
  },
  {
    conid: 136_155_102,
    ticker: "VOO",
    name: "VANGUARD S&P 500 ETF",
    isin: "US9229083632",
    listingExchange: "ARCA",
    position: 12,
    avgCost: 455.1,
    mktPrice: 538.4,
  },
] as const;

/**
 * Made-up company figures for the demo's statistics and contract details;
 * valuation ratios are worked out from them and the demo price. The ETF has
 * no earnings, beta or classification, as on IBKR.
 */
const demoCompanies = new Map<
  string,
  {
    industry?: string;
    category?: string;
    /** Earnings per share, trailing twelve months. */
    eps?: number;
    /** Dividends per share over the next twelve months. */
    dividend: number;
    beta?: number;
    shares?: number;
  }
>([
  [
    "AAPL",
    {
      industry: "Technology",
      category: "Computers",
      eps: 6.6,
      dividend: 1.04,
      beta: 1.24,
      shares: 15_000_000_000,
    },
  ],
  [
    "MSFT",
    {
      industry: "Technology",
      category: "Software",
      eps: 12.4,
      dividend: 3.32,
      beta: 0.9,
      shares: 7_430_000_000,
    },
  ],
  [
    "NVDA",
    {
      industry: "Technology",
      category: "Semiconductors",
      eps: 2.94,
      dividend: 0.04,
      beta: 1.7,
      shares: 24_400_000_000,
    },
  ],
  [
    "GOOGL",
    {
      industry: "Communications",
      category: "Internet",
      eps: 8.13,
      dividend: 0.8,
      beta: 1.02,
      shares: 12_200_000_000,
    },
  ],
  ["VOO", { dividend: 6.62 }],
]);

const cents = (value: number) => Math.round(value * 100) / 100;

/**
 * The demo's positions in the shape live accounts send them: no ticker or
 * name (`trsrv/secdef` has those), and today's gain or loss added when
 * they're read, from the day's bars.
 */
export const ibkrDemoPositions = holdings.map((holding): IbkrPosition => ({
  acctId: accountId,
  conid: holding.conid,
  contractDesc: holding.ticker,
  description: holding.ticker,
  position: holding.position,
  mktPrice: holding.mktPrice,
  mktValue: cents(holding.position * holding.mktPrice),
  currency,
  avgCost: holding.avgCost,
  avgPrice: holding.avgCost,
  realizedPnl: 0,
  unrealizedPnl: cents(holding.position * (holding.mktPrice - holding.avgCost)),
  assetClass: "STK",
  secType: "STK",
}));

const cash = 8420.55;
const stockValue = cents(
  ibkrDemoPositions.reduce(
    (total, position) => total + (position.mktValue ?? 0),
    0
  )
);
const netLiquidation = cents(cash + stockValue);

/** Fixed, so cached responses don't drift; IBKR sends milliseconds. */
const timestamp = 1_762_646_400_000;

const amount = (value: number) => ({
  amount: value,
  currency,
  isNull: false,
  timestamp,
  value: null,
});

export const ibkrDemoSummary = {
  accountcode: { value: accountId, isNull: false, timestamp },
  accounttype: { value: "INDIVIDUAL", isNull: false, timestamp },
  netliquidation: amount(netLiquidation),
  totalcashvalue: amount(cash),
  settledcash: amount(cash),
  grosspositionvalue: amount(stockValue),
  equitywithloanvalue: amount(netLiquidation),
  availablefunds: amount(cash),
  excessliquidity: amount(cash),
  buyingpower: amount(cents(cash * 4)),
  initmarginreq: amount(0),
  maintmarginreq: amount(0),
} satisfies IbkrAccountSummary;

const ledgerEntry = {
  currency,
  cashbalance: cash,
  settledcash: cash,
  netliquidationvalue: netLiquidation,
  stockmarketvalue: stockValue,
  exchangerate: 1,
  timestamp: timestamp / 1000,
};

export const ibkrDemoLedger = {
  USD: ledgerEntry,
  BASE: { ...ledgerEntry, currency: "BASE" },
} satisfies IbkrLedger;

const authStatus = {
  authenticated: true,
  competing: false,
  connected: true,
  message: "",
  MAC: "",
  serverInfo: { serverName: "Demo", serverVersion: "Demo" },
};

/** GET responses by path, relative to `/portal.proxy/v1/portal/`. */
const reads = new Map<string, Schema.Json>([
  [
    "sso/validate",
    {
      RESULT: true,
      USER_NAME: ibkrDemoUsername,
      AUTH_TIME: timestamp,
      SF_ENABLED: true,
      IS_FREETRIAL: false,
      LOGIN_TYPE: 1,
      EXPIRES: 1_800_000,
    },
  ],
  ["iserver/auth/status", authStatus],
  ["portfolio/accounts", ibkrDemoAccounts],
  [`portfolio/${accountId}/summary`, ibkrDemoSummary],
  [`portfolio/${accountId}/ledger`, ibkrDemoLedger],
]);

const notInDemo: IbkrPortalResponse = {
  status: 404,
  body: { error: "Not available in the demo." },
};

const holdingByConid = (value: string | null) =>
  holdings.find((holding) => String(holding.conid) === value);

/** The same numbers in [0, 1) on every run for a seed (a sine hash). */
const seededRandom = (seed: number) => {
  let step = seed;
  return () => {
    step += 1;
    const value = Math.sin(step) * 43_758.5453;
    return value - Math.floor(value);
  };
};

const dayMs = 86_400_000;

/** Milliseconds in an IBKR duration such as `5min`, `1h`, `3m` or `15y`. */
const durationMs = (value: string | null) => {
  const match = /^(?<count>\d+)(?<unit>min|h|d|w|m|y)$/u.exec(value ?? "");
  const unitMs = new Map([
    ["min", 60_000],
    ["h", 3_600_000],
    ["d", dayMs],
    ["w", 7 * dayMs],
    ["m", 30 * dayMs],
    ["y", 365 * dayMs],
  ]);
  const unit = unitMs.get(match?.groups?.unit ?? "");
  return unit ? Number(match?.groups?.count) * unit : undefined;
};

/** The demo's last trading session closes on the Friday before its date. */
const lastClose = timestamp - 27 * 3_600_000;

/** US regular hours, 14:30–21:00 UTC in winter: 390 minutes. */
const sessionMinutes = 390;
const sessionOpenMs = 14.5 * 3_600_000;
/** With extended hours, 04:00–20:00 ET: 09:00–01:00 UTC in winter. */
const extendedMinutes = 960;
const extendedOpenMs = sessionOpenMs - 330 * 60_000;
const timeOfDay = (time: number) => time % dayMs;
/** Whether `time` falls in a window opening at `openMs` UTC each day; it may run past midnight. */
const inWindow = (time: number, openMs: number, minutes: number) =>
  (timeOfDay(time) - openMs + dayMs) % dayMs < minutes * 60_000;

/** For a one-day view the session is still open: it has run 3h45m. */
const sessionNow =
  lastClose - timeOfDay(lastClose) + sessionOpenMs + 225 * 60_000;

const isWeekday = (time: number) => {
  const weekday = new Date(time).getUTCDay();
  return weekday !== 0 && weekday !== 6;
};

/**
 * Bars for the requested `period` and `bar` size, at most 1,000 like IBKR's.
 * Prices follow a random walk (about 2% a day) that ends at today's price and
 * reaches back towards the average cost a year ago, the same on every visit.
 */
const demoHistory = (
  holding: (typeof holdings)[number],
  query: URLSearchParams
) => {
  const periodMs = durationMs(query.get("period")) ?? 365 * dayMs;
  const barMs = durationMs(query.get("bar")) ?? dayMs;
  const intraday = barMs < dayMs;
  // `outsideRth=true` adds pre-market and after-hours bars, as on IBKR.
  const extended = intraday && query.get("outsideRth") === "true";
  const openMs = extended ? extendedOpenMs : sessionOpenMs;
  const minutes = extended ? extendedMinutes : sessionMinutes;
  const end = intraday && periodMs <= dayMs ? sessionNow : lastClose;
  const times = Array.from(
    { length: Math.floor(periodMs / barMs) },
    (_, index) => end - index * barMs
  )
    // Intraday bars only fall in trading hours, and a day is one session.
    .filter(
      (time) =>
        !intraday ||
        (inWindow(time, openMs, minutes) &&
          (periodMs > dayMs || time >= end - timeOfDay(end) + openMs))
    )
    // Markets are shut at weekends; weekly bars skip nothing.
    .filter((time) => barMs >= 7 * dayMs || isWeekday(time))
    .slice(0, 1000)
    .toReversed();
  const random = seededRandom(holding.conid + barMs);
  const volatility = 0.07 * Math.sqrt(barMs / dayMs);
  const walk = [0];
  for (const _ of times.slice(1)) {
    walk.push((walk.at(-1) ?? 0) + (random() - 0.5) * volatility);
  }
  // The walk is bent to end at today's price and to start where a steady
  // trend from the average cost a year ago would have been.
  const yearTrend = Math.log(holding.mktPrice / holding.avgCost);
  const start =
    Math.log(holding.mktPrice) - (yearTrend * periodMs) / (365 * dayMs);
  const last = Math.max(times.length - 1, 1);
  const drift = Math.log(holding.mktPrice) - start - (walk.at(-1) ?? 0);
  const closes = walk.map((step, index) =>
    cents(Math.exp(start + step + (drift * index) / last))
  );
  const data = times.map((time, index) => {
    const close = closes[index] ?? holding.mktPrice;
    const open = closes[index - 1] ?? close;
    const swing = cents(close * 0.01 * random());
    return {
      o: open,
      c: close,
      h: cents(Math.max(open, close) + swing),
      l: cents(Math.min(open, close) - swing),
      v: Math.round(10_000 + random() * 20_000),
      t: time,
    };
  });
  return {
    symbol: holding.ticker,
    text: holding.name,
    timePeriod: query.get("period") ?? "1y",
    barLength: barMs / 1000,
    tradingDayDuration: intraday ? minutes : 1440,
    mdAvailability: "D",
    points: data.length,
    data,
  };
};

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

/**
 * Snapshot fields beyond the price, as strings like IBKR's, worked out from
 * the demo's own bars so they agree with its chart: the day's open, high,
 * low and volume from today's session, the 52-week range from a year of
 * daily bars. The prior close is the session's first price, where the chart
 * already measures the day's move from.
 */
const demoSnapshotStats = (holding: (typeof holdings)[number]) => {
  const day = demoHistory(
    holding,
    new URLSearchParams("period=1d&bar=5min")
  ).data;
  const extendedDay = demoHistory(
    holding,
    new URLSearchParams("period=1d&bar=5min&outsideRth=true")
  ).data;
  const year = [
    ...demoHistory(holding, new URLSearchParams("period=1y&bar=1d")).data,
    ...day,
  ];
  const company = demoCompanies.get(holding.ticker);
  const price = holding.mktPrice;
  const fields = {
    "70": String(Math.max(...day.map((bar) => bar.h))),
    "71": String(Math.min(...day.map((bar) => bar.l))),
    "7295": day[0] && String(day[0].o),
    "7741": extendedDay[0] && String(extendedDay[0].o),
    "87": compact.format(day.reduce((total, bar) => total + bar.v, 0)),
    "7293": String(Math.max(...year.map((bar) => bar.h))),
    "7294": String(Math.min(...year.map((bar) => bar.l))),
    "7289":
      company?.shares === undefined
        ? undefined
        : compact.format(price * company.shares),
    "7290":
      company?.eps === undefined ? undefined : (price / company.eps).toFixed(2),
    "7291": company?.eps?.toFixed(2),
    "7287": company && `${((company.dividend / price) * 100).toFixed(2)}%`,
    "7718": company?.beta?.toFixed(2),
  } satisfies Record<string, string | undefined>;
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  );
};

/**
 * A holding's gain or loss today, measured from the same prior close as its
 * day chart, so the dashboard's moves agree with the asset pages.
 */
const demoDailyPnl = (holding: (typeof holdings)[number]) => {
  const day = demoHistory(
    holding,
    new URLSearchParams("period=1d&bar=5min")
  ).data;
  const open = day[0]?.o;
  return open === undefined ? 0 : holding.position * (holding.mktPrice - open);
};

/** The positions with today's gain or loss, as IBKR sends them. */
const demoPositions = () =>
  ibkrDemoPositions.map((position, index) => {
    const holding = holdings[index];
    return holding
      ? { ...position, dailyPnl: cents(demoDailyPnl(holding)) }
      : position;
  });

/** Today's profit and loss across the holdings. */
const demoPnl = () => {
  let dpl = 0;
  for (const holding of holdings) {
    dpl += demoDailyPnl(holding);
  }
  let upl = 0;
  for (const position of ibkrDemoPositions) {
    upl += position.unrealizedPnl ?? 0;
  }
  return {
    upnl: {
      [`${accountId}.Core`]: {
        dpl: cents(dpl),
        nl: netLiquidation,
        upl: cents(upl),
      },
    },
  } satisfies IbkrPnl;
};

/** GET responses whose body depends on the path's IDs or query parameters. */
const dynamicReads: readonly (readonly [
  RegExp,
  (match: RegExpExecArray, query: URLSearchParams) => Schema.Json | undefined,
])[] = [
  [/^iserver\/account\/pnl\/partitioned$/u, demoPnl],
  [new RegExp(`^portfolio/${accountId}/positions/0$`, "u"), demoPositions],
  [
    /^iserver\/accounts$/u,
    () => ({
      accounts: [accountId],
      selectedAccount: accountId,
      sessionId: "demo-session",
    }),
  ],
  [
    /^iserver\/secdef\/search$/u,
    (_, query) => {
      const symbol = query.get("symbol")?.toUpperCase() ?? "";
      // `pattern=true` is the type-ahead search: tickers or names starting
      // with what's typed. Otherwise the ticker exactly.
      const pattern = query.get("pattern") === "true";
      return holdings
        .filter((holding) =>
          pattern
            ? symbol !== "" &&
              (holding.ticker.startsWith(symbol) ||
                holding.name.toUpperCase().startsWith(symbol))
            : holding.ticker === symbol
        )
        .map((holding) => ({
          conid: String(holding.conid),
          companyHeader: `${holding.name} - ${holding.listingExchange}`,
          companyName: holding.name,
          symbol: holding.ticker,
          description: holding.listingExchange,
          restricted: null,
          secType: "STK",
          sections: [{ secType: "STK", conid: String(holding.conid) }],
        }));
    },
  ],
  [
    /^iserver\/contract\/(?<conid>\d+)\/info$/u,
    (match) => {
      const holding = holdingByConid(match.groups?.conid ?? null);
      return (
        holding && {
          con_id: holding.conid,
          symbol: holding.ticker,
          local_symbol: holding.ticker,
          company_name: holding.name,
          instrument_type: "STK",
          exchange: "SMART",
          primary_exchange: holding.listingExchange,
          currency,
          valid_exchanges: `SMART,${holding.listingExchange}`,
          industry: demoCompanies.get(holding.ticker)?.industry ?? null,
          category: demoCompanies.get(holding.ticker)?.category ?? null,
        }
      );
    },
  ],
  [
    /^trsrv\/secdef$/u,
    (_, query) => {
      const conids = new Set(query.get("conids")?.split(","));
      return {
        secdef: holdings
          .filter((holding) => conids.has(String(holding.conid)))
          .map((holding) => ({
            conid: holding.conid,
            ticker: holding.ticker,
            name: holding.name,
            listingExchange: holding.listingExchange,
            currency,
            assetClass: "STK",
          })),
      };
    },
  ],
  [
    /^trsrv\/secdef\/schedule$/u,
    (_, query) => {
      const holding = holdings.find(
        (candidate) => candidate.ticker === query.get("symbol")?.toUpperCase()
      );
      const weekday = {
        sessions: [
          { openingTime: "0930", closingTime: "1600", prop: "LIQUID" },
        ],
        tradingtimes: [
          { openingTime: "0400", closingTime: "2000", cancelDayOrders: "Y" },
        ],
      };
      return (
        holding && [
          {
            id: "p0",
            tradeVenueId: "v0",
            exchange: holding.listingExchange,
            description: holding.listingExchange,
            // The demo's bars keep winter's UTC offset all year, so its
            // hours do too: New York without daylight saving.
            timezone: "Etc/GMT+5",
            schedules: [
              // Saturday and Sunday shut, Monday to Friday trading.
              {
                tradingScheduleDate: "20000101",
                sessions: [],
                tradingtimes: [],
              },
              {
                tradingScheduleDate: "20000102",
                sessions: [],
                tradingtimes: [],
              },
              ...[
                "20000103",
                "20000104",
                "20000105",
                "20000106",
                "20000107",
              ].map((tradingScheduleDate) => ({
                tradingScheduleDate,
                ...weekday,
              })),
            ],
          },
        ]
      );
    },
  ],
  [
    /^iserver\/marketdata\/snapshot$/u,
    (_, query) => {
      // Like IBKR, only the requested fields; all of them without `fields`.
      const requested = query.get("fields")?.split(",");
      return (query.get("conids") ?? "").split(",").flatMap((conid) => {
        const holding = holdingByConid(conid);
        if (!holding) {
          return [];
        }
        const fields = Object.entries({
          "31": String(holding.mktPrice),
          "55": holding.ticker,
          "7051": holding.name,
          "6509": "DPB",
          ...demoSnapshotStats(holding),
        }).filter(([field]) => !requested || requested.includes(field));
        return [
          {
            conid: holding.conid,
            conidEx: conid,
            _updated: timestamp,
            ...Object.fromEntries(fields),
          },
        ];
      });
    },
  ],
  [
    /^iserver\/marketdata\/history$/u,
    (_, query) => {
      const holding = holdingByConid(query.get("conid"));
      return holding && demoHistory(holding, query);
    },
  ],
];

const dynamicRead = (route: string, query: URLSearchParams) =>
  dynamicReads.flatMap(([pattern, read]) => {
    const match = pattern.exec(route);
    return match ? [read(match, query)] : [];
  })[0];

/** Session calls the web app makes; they change nothing in the demo. */
const writes = new Map<string, Schema.Json>([
  [
    "tickle",
    {
      session: "demo",
      ssoExpires: 1_800_000,
      collission: false,
      userId: 0,
      iserver: { authStatus },
    },
  ],
  ["iserver/auth/ssodh/init", authStatus],
  // Every scan finds the demo's holdings, in the shape of IBKR's reply.
  [
    "iserver/scanner/run",
    {
      contracts: holdings.map((holding, index) => ({
        server_id: `scan_${index}`,
        con_id: holding.conid,
        conidex: String(holding.conid),
        symbol: holding.ticker,
        company_name: holding.name,
        listing_exchange: holding.listingExchange,
        sec_type: "STK",
      })),
      scan_data_column_name: "Chg%",
    },
  ],
]);

/** `yyyyMMdd`, as `pa/performance` writes dates. */
const performanceDate = (time: number) =>
  new Date(time).toISOString().slice(0, 10).replaceAll("-", "");

/**
 * The account's value at each weekday's close for about the past 400
 * trading days, newest first: a random walk (about 1% a day, drifting up)
 * that ends at today's total, the same on every visit. Every period is cut
 * from this one series, so they agree on any date they share.
 */
const demoNavHistory = (() => {
  const random = seededRandom(7);
  const days: { time: number; nav: number }[] = [];
  let nav = netLiquidation;
  for (let time = lastClose; days.length < 400; time -= dayMs) {
    if (isWeekday(time)) {
      days.push({ time, nav: cents(nav) });
      nav /= 1 + 0.0007 + (random() - 0.5) * 0.02;
    }
  }
  return days;
})();

/** Where a `pa/performance` period starts: its first date is after this. */
const performanceStart = (period: string) => {
  const end = new Date(lastClose);
  if (period === "MTD") {
    return Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1) - 1;
  }
  if (period === "YTD") {
    return Date.UTC(end.getUTCFullYear(), 0, 1) - 1;
  }
  const days = new Map([
    ["1D", 1],
    ["7D", 7],
    ["1M", 30],
    ["3M", 91],
    ["6M", 182],
    ["12M", 365],
    ["1Y", 365],
  ]).get(period);
  return days === undefined ? undefined : lastClose - days * dayMs;
};

const decodePerformanceRequest = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ period: Schema.String }))
);

/**
 * `POST pa/performance`: the demo account's value and return over the
 * period in the request's body, in IBKR's shape. Nothing is deposited or
 * withdrawn, so the return is the value's own change.
 */
const demoPerformance = (body: string): IbkrPortalResponse => {
  const request = Option.getOrUndefined(decodePerformanceRequest(body));
  const start = request && performanceStart(request.period);
  if (start === undefined) {
    return { status: 400, body: { error: "Unknown period." } };
  }
  // Newest first, so the days after `start` come first.
  const included = demoNavHistory
    .filter((day) => day.time > start)
    .toReversed();
  const before = demoNavHistory[included.length] ?? included[0];
  const dates = included.map((day) => performanceDate(day.time));
  const startValue = before?.nav ?? netLiquidation;
  return {
    status: 200,
    body: {
      currencyType: "base",
      rc: 0,
      pm: "TWR",
      nav: {
        dates,
        freq: "D",
        data: [
          {
            id: accountId,
            idType: "acct",
            baseCurrency: currency,
            navs: included.map((day) => day.nav),
            startNAV: {
              date: before ? performanceDate(before.time) : "",
              val: startValue,
            },
          },
        ],
      },
      cps: {
        dates,
        freq: "D",
        data: [
          {
            id: accountId,
            idType: "acct",
            baseCurrency: currency,
            returns: included.map(
              (day) => Math.round((day.nav / startValue - 1) * 1e6) / 1e6
            ),
          },
        ],
      },
    },
  };
};

/**
 * Answers a Client Portal call for the demo account. Anything else gets a 404
 * in IBKR's error shape; nothing is ever sent to IBKR.
 */
export const ibkrDemoPortalResponse = (
  method: string,
  path: string,
  requestBody = ""
): IbkrPortalResponse => {
  // Same normalisation as a URL would apply: no query, no leading slash.
  const [route = "", query = ""] = path.replace(/^\/+/u, "").split("?");
  if (method === "POST" && route === "pa/performance") {
    return demoPerformance(requestBody);
  }
  const body =
    method === "GET"
      ? (reads.get(route) ?? dynamicRead(route, new URLSearchParams(query)))
      : writes.get(route);
  return body === undefined ? notInDemo : { status: 200, body };
};

const lorem =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.";

const demoHeadlines = [
  "{name} shares climb after quarterly results beat estimates",
  "Analysts raise {ticker} price targets on stronger guidance",
  "{name} announces new product line at annual event",
  "What the latest rate decision means for {ticker}",
  "{ticker} added to a major index rebalance",
  "{name} expands buyback programme",
];

/**
 * GET responses from IBKR's fundamentals app, relative to
 * `/tws.proxy/fundamentals/`. Shaped after what that app reads; IBKR doesn't
 * document them.
 */
const fundamentalsReads: readonly (readonly [
  RegExp,
  (holding: (typeof holdings)[number]) => Schema.Json,
])[] = [
  [
    /^profile\/(?<conid>\d+)$/u,
    () => ({
      businessSummary: { name: "Business Summary", value: lorem },
    }),
  ],
  [
    /^ratings\/(?<conid>\d+)$/u,
    (holding) => ({
      summary: {
        buy: 31,
        hold: 7,
        sell: 1,
        targets: [
          {
            kind: "Mean",
            abs: cents(holding.mktPrice * 1.12),
            formatted_abs: (holding.mktPrice * 1.12).toFixed(2),
            rel: 12,
            formatted_rel: "+12.00%",
          },
          {
            kind: "High",
            abs: cents(holding.mktPrice * 1.35),
            formatted_abs: (holding.mktPrice * 1.35).toFixed(2),
            rel: 35,
            formatted_rel: "+35.00%",
          },
          {
            kind: "Low",
            abs: cents(holding.mktPrice * 0.85),
            formatted_abs: (holding.mktPrice * 0.85).toFixed(2),
            rel: -15,
            formatted_rel: "-15.00%",
          },
        ],
      },
    }),
  ],
];

const newsReads: typeof fundamentalsReads = [
  [
    /^landing\/(?<conid>\d+)$/u,
    (holding) => ({
      news: {
        content: demoHeadlines.map((headline, index) => ({
          newsId: `demo-${holding.conid}-${index}`,
          headlineContent: headline
            .replace("{name}", holding.name)
            .replace("{ticker}", holding.ticker),
          source: index % 2 === 0 ? "Reuters" : "Dow Jones",
          time: timestamp - index * 5 * 3_600_000,
        })),
      },
    }),
  ],
];

/**
 * `news2/search2?type=PORTFOLIO`: the latest headlines across the holdings,
 * newest first, in the shape the Client Portal's search results take
 * (`headLineContent` as HTML, `main_conid` the contract it's about). Other searches find nothing.
 */
const demoNewsSearch = (query: URLSearchParams): IbkrPortalResponse => ({
  status: 200,
  body: {
    results:
      query.get("type") === "PORTFOLIO"
        ? Array.from({ length: 10 }, (_, index) => {
            const holding = holdings[index % holdings.length];
            const headline =
              demoHeadlines[(index * 5) % demoHeadlines.length] ?? "";
            return holding
              ? [
                  {
                    newsId: `demo-portfolio-${index}`,
                    headLineContent: headline
                      .replace("{name}", holding.name)
                      .replace("{ticker}", holding.ticker)
                      .replaceAll("&", "&amp;"),
                    source: index % 3 === 0 ? "DJ-GL" : "REUTERS",
                    provider_name:
                      index % 3 === 0
                        ? "Dow Jones Global News"
                        : "Reuters News",
                    time: timestamp - (index * 3 + 1) * 3_600_000,
                    main_conid: holding.conid,
                  },
                ]
              : [];
          }).flat()
        : [],
  },
});

/**
 * The demo's popular lists, as GlobalTrader reads one (`id`, `name`,
 * `description`, `source`, `image` and `instruments`). What IBKR's index of
 * lists looks like isn't known; the demo answers it with the lists
 * themselves, minus their instruments.
 */
const demoPopularLists = [
  {
    id: "demo-popular",
    name: "Popular with IBKR clients",
    tickers: ["NVDA", "AAPL", "VOO"],
  },
  {
    id: "demo-brands",
    name: "Brands you may know",
    tickers: ["MSFT", "GOOGL", "AAPL"],
  },
].map(({ id, name, tickers }) => ({
  id,
  name,
  description: lorem.slice(0, 80),
  source: "IBKR",
  image: "",
  instruments: tickers.flatMap((ticker) =>
    holdings
      .filter((holding) => holding.ticker === ticker)
      .map((holding) => ({
        conid: holding.conid,
        symbol: holding.ticker,
        company_name: holding.name,
      }))
  ),
}));

const demoImpactResponse = (
  route: string,
  query: URLSearchParams
): IbkrPortalResponse => {
  if (route === "popular/list") {
    return {
      status: 200,
      body: demoPopularLists.map(
        ({ id, name, description, source, image }) => ({
          id,
          name,
          description,
          source,
          image,
        })
      ),
    };
  }
  const list = demoPopularLists.find(({ id }) => id === query.get("id"));
  return route === "popular/get" && list
    ? { status: 200, body: list }
    : notInDemo;
};

/**
 * The Market Screener's results, as `hmds/scanner/customSnapshot` sends them
 * (bare conids): the demo's holdings, biggest position first, standing in for
 * market cap.
 */
const demoScreenerSnapshot = (): IbkrPortalResponse => {
  const ranked = holdings.toSorted(
    (left, right) =>
      right.position * right.mktPrice - left.position * left.mktPrice
  );
  return {
    status: 200,
    body: {
      instruments: ranked.map((holding) => ({ conid: holding.conid })),
      total: ranked.length,
    },
  };
};

/**
 * A few of the Market Screener's sectors, as `predefinedMetaData` lists
 * them. The demo's screener doesn't filter by them; it always sends the
 * holdings.
 */
const demoSectors = Object.entries({
  Communications: ["Internet", "Media", "Telecommunications"],
  "Consumer, Cyclical": ["Auto Manufacturers", "Retail"],
  Financial: ["Banks", "Diversified Finan Serv", "Insurance"],
  Technology: ["Computers", "Semiconductors", "Software"],
}).map(([name, industries]) => ({
  name,
  value: name,
  industries: industries.map((industry) => ({
    name: industry,
    value: `${name}|${industry}`,
  })),
}));

export const ibkrDemoResearchResponse = (
  namespace: IbkrResearchNamespace,
  path: string,
  method: "GET" | "POST" = "GET"
): IbkrPortalResponse => {
  const [route = "", query = ""] = path.replace(/^\/+/u, "").split("?");
  if (namespace === "hmds") {
    if (method === "POST" && route === "scanner/customSnapshot") {
      return demoScreenerSnapshot();
    }
    if (method === "GET" && route === "scanner/predefinedMetaData") {
      return { status: 200, body: { sectors: demoSectors } };
    }
    return notInDemo;
  }
  if (method !== "GET") {
    return notInDemo;
  }
  if (namespace === "impact") {
    return demoImpactResponse(route, new URLSearchParams(query));
  }
  if (namespace === "news2" && route === "search2") {
    return demoNewsSearch(new URLSearchParams(query));
  }
  for (const [pattern, read] of namespace === "news2"
    ? newsReads
    : fundamentalsReads) {
    const match = pattern.exec(route);
    const holding = holdingByConid(match?.groups?.conid ?? null);
    if (holding) {
      return { status: 200, body: read(holding) };
    }
  }
  return notInDemo;
};
