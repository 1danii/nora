import { fromAbsolute, today } from "@internationalized/date";
import {
  IbkrAuthStatusSchema,
  IbkrContractInfoSchema,
  IbkrContractSearchSchema,
  IbkrHistorySchema,
  IbkrMarketSnapshotSchema,
} from "@nora/ibkr/api-schemas";
import type { IbkrContractInfo, IbkrHistory } from "@nora/ibkr/api-schemas";
import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";
import { Option, Schema } from "effect";

import { parseIbkrNumber } from "@/lib/format";
import { parseIbkrNewsWidget } from "@/lib/ibkr-asset-news";
import {
  requestIbkrFundamentals,
  requestIbkrNews,
  requestIbkrPortal,
} from "@/lib/ibkr-login-queries";
import type { TradingSchedule } from "@/lib/ibkr-trading-schedule";
import {
  chartSessionAt,
  exchangeDate,
  parseTradingSchedule,
} from "@/lib/ibkr-trading-schedule";

/**
 * Asset URLs use the lowercase ticker, plus IBKR's exchange code when the
 * listing matters: `/dashboard/assets/aapl`, `/dashboard/assets/vwce.ibis`.
 */
export const assetSlug = (symbol: string, exchange?: string) =>
  (exchange ? `${symbol}.${exchange}` : symbol).toLowerCase();

export const parseAssetSlug = (slug: string) => {
  const dot = slug.lastIndexOf(".");
  return dot > 0
    ? {
        symbol: slug.slice(0, dot).toUpperCase(),
        exchange: slug.slice(dot + 1).toUpperCase(),
      }
    : { symbol: slug.toUpperCase(), exchange: undefined };
};

/** US listings are IBKR's default pick for a bare ticker, so their links skip the exchange. */
const usExchanges = new Set(["NASDAQ", "NYSE", "ARCA", "AMEX", "BATS", "IEX"]);

/** The link slug for a listing, e.g. a position's `ticker` and `listingExchange`. */
export const listingSlug = (symbol: string, exchange?: string | null) =>
  assetSlug(
    symbol,
    exchange && !usExchanges.has(exchange.toUpperCase()) ? exchange : undefined
  );

const decodeAuthStatus = Schema.decodeUnknownSync(IbkrAuthStatusSchema);

const isBrokerageOpen = async () =>
  decodeAuthStatus(await requestIbkrPortal("GET", "iserver/auth/status"))
    .authenticated === true;

/**
 * Thrown while IBKR is still getting something ready, such as the brokerage
 * session or a market data subscription. Its queries retry, a second apart,
 * until it is; the message is shown if it never is.
 */
export class IbkrPendingError extends Error {
  override name = "IbkrPendingError";
}

/** Retries a query `times` more while it throws `IbkrPendingError`. */
export const retryWhilePending = (times: number) => ({
  retry: (failureCount: number, error: Error) =>
    error instanceof IbkrPendingError && failureCount < times,
  retryDelay: 1000,
});

/** Checks once a second, a few times, while IBKR opens the session. */
const brokerageOpenedQuery = queryOptions({
  queryKey: ["ibkr", "portal", "brokerage", "opened"],
  queryFn: async () => {
    if (!(await isBrokerageOpen())) {
      throw new IbkrPendingError("IBKR didn't open the brokerage session.");
    }
    return true;
  },
  ...retryWhilePending(5),
  // Only asked right after opening the session, and always freshly.
  gcTime: 0,
});

/**
 * Opens the brokerage session that every `iserver/*` call needs, as IBKR's web
 * app does, then loads the account list IBKR expects before market data.
 * `compete` takes the session over from TWS or the mobile app.
 */
export const ibkrBrokerageQuery = queryOptions({
  queryKey: ["ibkr", "portal", "brokerage"],
  queryFn: async ({ client }) => {
    if (!(await isBrokerageOpen())) {
      await requestIbkrPortal(
        "POST",
        "iserver/auth/ssodh/init",
        JSON.stringify({ publish: true, compete: true })
      );
      await client.query({ ...brokerageOpenedQuery, staleTime: 0 });
    }
    return requestIbkrPortal("GET", "iserver/accounts");
  },
  retry: false,
  // /tickle keeps the session alive while the app is open.
  staleTime: 5 * 60_000,
});

const decodeContractSearch = Schema.decodeUnknownSync(IbkrContractSearchSchema);
const decodeContractInfo = Schema.decodeUnknownSync(IbkrContractInfoSchema);

/** A contract's details: its symbol, exchanges, currency and industry. */
const assetContractInfoQuery = (conid: number) =>
  queryOptions({
    queryKey: ["ibkr", "portal", "asset", conid, "info"],
    queryFn: async ({ client }) => {
      await client.query({ ...ibkrBrokerageQuery, staleTime: "static" });
      return decodeContractInfo(
        await requestIbkrPortal("GET", `iserver/contract/${conid}/info`)
      );
    },
    retry: false,
    staleTime: 60 * 60_000,
  });

const decodeSecdef = Schema.decodeUnknownOption(
  Schema.Struct({
    secdef: Schema.Array(
      Schema.Struct({
        listingExchange: Schema.optional(Schema.NullOr(Schema.String)),
      })
    ),
  })
);

/**
 * The primary listing's exchange (e.g. "NASDAQ") from `trsrv/secdef`: the
 * contract details only say "SMART". Undefined when IBKR doesn't say.
 */
const listingExchange = async (conid: number) => {
  const response = await requestIbkrPortal(
    "GET",
    `trsrv/secdef?conids=${conid}`
  ).catch(() => null);
  const secdef = Option.getOrUndefined(decodeSecdef(response));
  return secdef?.secdef[0]?.listingExchange?.trim() || undefined;
};

/**
 * The listing's trading hours, in its exchange's time zone; null when IBKR
 * has none, so charts fall back to the hours their bars show.
 */
export const assetScheduleQuery = (conid: number) =>
  queryOptions({
    queryKey: ["ibkr", "portal", "asset", conid, "schedule"],
    queryFn: async ({ client }): Promise<TradingSchedule | null> => {
      const info = await client.query({
        ...assetContractInfoQuery(conid),
        staleTime: "static",
      });
      if (!info.symbol) {
        return null;
      }
      const exchange =
        info.primary_exchange ?? (await listingExchange(conid)) ?? undefined;
      // The parameters IBKR's Portal sends (its `getSecdefSchedule`);
      // filtering on the primary listing is our choice, as Portal uses
      // `listingExchange` for the stock's exchange elsewhere.
      const query = new URLSearchParams({
        assetClass: info.instrument_type ?? "STK",
        symbol: info.symbol,
        ...(exchange && { exchangeFilter: exchange }),
      });
      return (
        parseTradingSchedule(
          await requestIbkrPortal("GET", `trsrv/secdef/schedule?${query}`),
          exchange
        ) ?? null
      );
    },
    retry: false,
    // Up to a month ahead, holidays included.
    staleTime: 6 * 60 * 60_000,
  });

/** The schedule, or null when it can't be had: charts work without it. */
const scheduleOrNull = async (client: QueryClient, conid: number) => {
  try {
    // The query's own expiry, so a long-open tab picks up a holiday or early
    // close announced since.
    return await client.query(assetScheduleQuery(conid));
  } catch {
    return null;
  }
};

/** The listing a slug names, with IBKR's search result and contract details. */
export const assetContractQuery = (slug: string) =>
  queryOptions({
    queryKey: ["ibkr", "portal", "asset", slug, "contract"],
    queryFn: async ({ client }) => {
      await client.query({ ...ibkrBrokerageQuery, staleTime: "static" });
      const { symbol, exchange } = parseAssetSlug(slug);
      const results = decodeContractSearch(
        await requestIbkrPortal(
          "GET",
          `iserver/secdef/search?symbol=${encodeURIComponent(symbol)}`
        )
      );
      // Search also returns fuzzy matches; IBKR lists the primary listing first.
      const match = results.find(
        (result) =>
          result.symbol?.toUpperCase() === symbol &&
          (exchange === undefined ||
            result.description?.toUpperCase() === exchange)
      );
      // The route's not-found page, not a retryable failure.
      if (!match) {
        throw notFound();
      }
      const conid = Number(match.conid);
      const info = await client.query({
        ...assetContractInfoQuery(conid),
        staleTime: "static",
      });
      return { conid, search: match, info };
    },
    retry: false,
    staleTime: 5 * 60_000,
  });

/**
 * Last, symbol, name, change, change %, bid, ask, open, high, low, prior
 * close, `6509` market data availability (delayed, real time…), and the
 * listing's location: `7986` its flag's icon key and `7988` its country.
 */
const snapshotFields = [
  "31",
  "55",
  "7051",
  "82",
  "83",
  "84",
  "86",
  "7295",
  "70",
  "71",
  "7741",
  "6509",
  // Fields IBKR's own apps request, not in the Web API reference.
  "7986",
  "7988",
];

const decodeSnapshot = Schema.decodeUnknownSync(IbkrMarketSnapshotSchema);

/** Snapshot values are documented as strings; some arrive as numbers. */
const decodeSnapshotValue = Schema.decodeUnknownOption(
  Schema.Union([Schema.String, Schema.Number])
);

/**
 * The snapshot. IBKR's first request for a conid only subscribes, and its
 * reply has none of `fields`: that throws `IbkrPendingError` to ask again.
 */
const requestSnapshot = async (conid: number, fields: readonly string[]) => {
  const snapshot = await requestIbkrPortal(
    "GET",
    `iserver/marketdata/snapshot?conids=${conid}&fields=${fields.join(",")}`
  );
  const row = decodeSnapshot(snapshot)[0] ?? {};
  if (!fields.some((field) => field in row)) {
    throw new IbkrPendingError("IBKR didn't send market data.");
  }
  return snapshot;
};

/**
 * How often the header polls its quote while the live stream is down (or,
 * in the demo, absent): well under the snapshot's 10 requests a second.
 */
export const quotePollInterval = 2000;

/**
 * Current price. Free: without a subscription IBKR returns delayed data.
 * Loaded once as a snapshot; the header then keeps it current from IBKR's
 * live stream (see `useLiveQuote`), polling only while that's down.
 */
export const assetPriceQuery = (conid: number) =>
  queryOptions({
    queryKey: ["ibkr", "portal", "asset", conid, "price"],
    queryFn: async ({ client }) => {
      await client.query({ ...ibkrBrokerageQuery, staleTime: "static" });
      return requestSnapshot(conid, snapshotFields);
    },
    ...retryWhilePending(3),
    staleTime: quotePollInterval,
  });

/**
 * A snapshot with a live push's changed `fields` applied: IBKR streams
 * only what changed, so each push updates the last known values.
 */
export const withQuoteFields = (
  snapshot: Schema.Json | null | undefined,
  fields: Readonly<Record<string, string | number>>
): Schema.Json => {
  const [row] = snapshot ? decodeSnapshot(snapshot) : [];
  const known: Record<string, Schema.Json> = {};
  for (const [field, value] of Object.entries(row ?? {})) {
    const json = Option.getOrUndefined(decodeSnapshotValue(value));
    if (json !== undefined) {
      known[field] = json;
    }
  }
  return [{ ...known, ...fields }];
};

/**
 * Whether `time` falls in IBKR's US overnight session: 20:00 to 03:50 New
 * York time, Sunday evening to Friday morning.
 */
export const inUsOvernightSession = (time: number) => {
  const local = fromAbsolute(time, "America/New_York");
  const minutes = local.hour * 60 + local.minute;
  // 0 is Sunday.
  const weekday = new Date(
    Date.UTC(local.year, local.month - 1, local.day)
  ).getUTCDay();
  return minutes >= 20 * 60
    ? weekday <= 4
    : minutes < 3 * 60 + 50 && weekday >= 1 && weekday <= 5;
};

/** Whether IBKR lists the overnight venue among the contract's exchanges. */
export const tradesOvernight = (info: { valid_exchanges?: string | null }) =>
  (info.valid_exchanges ?? "")
    .split(",")
    .some((exchange) => exchange.trim().toUpperCase() === "OVERNIGHT");

const overnightFields = ["31", "82", "83"];

/**
 * The snapshot on IBKR's overnight venue (`conid@OVERNIGHT`), as IBKR's
 * apps show it between the US evening and the next pre-market. Null when
 * IBKR has no overnight quote for it: the header then keeps the regular
 * quote. Only asked for during the overnight session.
 */
export const assetOvernightQuoteQuery = (conid: number) =>
  queryOptions({
    queryKey: ["ibkr", "portal", "asset", conid, "overnight"],
    queryFn: async ({ client }): Promise<Schema.Json | null> => {
      await client.query({ ...ibkrBrokerageQuery, staleTime: "static" });
      try {
        return await requestIbkrPortal(
          "GET",
          `iserver/marketdata/snapshot?conids=${conid}%40OVERNIGHT&fields=${overnightFields.join(",")}`
        );
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: quotePollInterval,
  });

/** A snapshot field as text, undefined when IBKR didn't send it. */
const snapshotText = (snapshot: Schema.Json, field: string) => {
  const value = Option.getOrUndefined(
    decodeSnapshotValue(decodeSnapshot(snapshot)[0]?.[field])
  );
  return value === undefined ? undefined : String(value).trim() || undefined;
};

/**
 * A price field from a snapshot. IBKR prefixes the last price (`31`) with "C"
 * when it's the previous close (market shut) and "H" when trading is halted.
 */
const snapshotPrice = (snapshot: Schema.Json, field: string) =>
  parseIbkrNumber(snapshotText(snapshot, field));

/**
 * The header's prices from one snapshot, each missing when IBKR has none:
 * the last trade, IBKR's own change since the prior close (`82`, and `83`
 * in percent, here a fraction), and the prior session's close.
 */
export const quoteOf = (snapshot: Schema.Json) => {
  const percentChange = snapshotPrice(snapshot, "83");
  return {
    last: snapshotPrice(snapshot, "31"),
    change: snapshotPrice(snapshot, "82"),
    changeRatio: percentChange === undefined ? undefined : percentChange / 100,
    priorClose: snapshotPrice(snapshot, "7741"),
  };
};

/**
 * Where the listing is, as IBKR Mobile shows it: `iconKey` names its flag
 * (e.g. "TP_US") and `location` its country (e.g. "United States").
 */
export const listingOf = (snapshot: Schema.Json) => ({
  iconKey: snapshotText(snapshot, "7986"),
  location: snapshotText(snapshot, "7988"),
});

/**
 * The asset page's price and valuation statistics, by snapshot field ID.
 * IDs from IBKR's Web API reference ("Market Data Fields") and its OpenAPI
 * document (https://www.interactivebrokers.com/api/doc.json), which still
 * lists 7287–7291 and 7718 after the newer reference dropped them.
 */
export const assetStatFields = [
  { field: "7295", label: "Open", kind: "price" },
  { field: "70", label: "Day high", kind: "price" },
  { field: "71", label: "Day low", kind: "price" },
  { field: "7741", label: "Prior close", kind: "price" },
  { field: "7293", label: "52-week high", kind: "price" },
  { field: "7294", label: "52-week low", kind: "price" },
  // Sent by IBKR with K/M.
  { field: "87", label: "Volume", kind: "count" },
  // Often missing (and never in the demo), so the skeleton leaves them out.
  { field: "7282", label: "Avg. volume (90d)", kind: "count", often: false },
  { field: "7289", label: "Market cap", kind: "bigMoney" },
  { field: "7290", label: "P/E", kind: "ratio" },
  { field: "7291", label: "EPS", kind: "price" },
  { field: "7287", label: "Dividend yield", kind: "percent" },
  { field: "7288", label: "Ex-dividend date", kind: "text", often: false },
  { field: "7718", label: "Beta", kind: "ratio" },
] as const;

/**
 * How a statistic is shown: `price` and `bigMoney` in the asset's currency,
 * `count` compact, `ratio` to two decimals, `percent` as a share and `text`
 * as IBKR sends it.
 */
export type AssetStatKind = (typeof assetStatFields)[number]["kind"];

export interface AssetStat {
  field: string;
  label: string;
  kind: AssetStatKind;
  /** The number, a percent as a fraction; undefined for text, or text IBKR didn't send as a number. */
  amount: number | undefined;
  /** IBKR's own text, shown when there's no `amount`. */
  text: string;
}

/** Snapshot values are documented as strings; some arrive as numbers. */
const decodeStatValue = Schema.decodeUnknownOption(
  Schema.Union([Schema.String, Schema.Number])
);

/** Open, day high and day low: 0 until the day's first trade. */
const dayPriceFields = new Set(["7295", "70", "71"]);

/**
 * The statistics a snapshot has, as numbers where they are. Fields IBKR
 * doesn't send (no data, an ETF's P/E, a missing subscription) are left out.
 */
const statsOf = (snapshot: Schema.Json): AssetStat[] => {
  const row = decodeSnapshot(snapshot)[0] ?? {};
  return assetStatFields.flatMap(({ field, label, kind }) => {
    const text = Option.match(decodeStatValue(row[field]), {
      onNone: () => "",
      onSome: (raw) => String(raw).trim(),
    });
    if (text === "") {
      return [];
    }
    const parsed = kind === "text" ? undefined : parseIbkrNumber(text);
    // Between sessions IBKR sends 0 for the day's open, high and low until
    // trading starts: no price yet, shown as a dash, not a price of 0.
    if (parsed === 0 && dayPriceFields.has(field)) {
      return [{ field, label, kind, amount: undefined, text: "—" }];
    }
    const amount =
      kind === "percent" && parsed !== undefined ? parsed / 100 : parsed;
    return [{ field, label, kind, amount, text }];
  });
};

/** Price and valuation statistics. */
export const assetStatsQuery = (conid: number) =>
  queryOptions({
    queryKey: ["ibkr", "portal", "asset", conid, "stats"],
    queryFn: async ({ client }) => {
      await client.query({ ...ibkrBrokerageQuery, staleTime: "static" });
      return statsOf(
        await requestSnapshot(
          conid,
          assetStatFields.map(({ field }) => field)
        )
      );
    },
    ...retryWhilePending(3),
    staleTime: 60_000,
  });

/**
 * The company's details from its contract. IBKR's Web API has no company
 * description, headcount or sector beyond `industry` and `category`.
 */
export const companyInfoOf = (
  info: IbkrContractInfo,
  primaryExchange: string | undefined
) =>
  [
    { label: "Industry", value: info.industry },
    { label: "Category", value: info.category },
    { label: "Primary exchange", value: primaryExchange },
    { label: "Currency", value: info.currency },
    { label: "Asset type", value: info.instrument_type },
  ].flatMap(({ label, value }) =>
    value?.trim() ? [{ label, value: value.trim() }] : []
  );

const decodeHistory = Schema.decodeUnknownSync(IbkrHistorySchema);

/** A time of day, in the viewer's time zone: "2:35 PM". */
const timeOfDay: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
};
/**
 * Intraday bars with their date, "Nov 18, 1:55 AM": for 1M and 3M, and
 * for 1D, as in the viewer's time zone a session can cross midnight.
 */
const dateAndTime: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  ...timeOfDay,
};
/** A week of intraday bars: "Mon, Nov 3, 2:15 PM". */
const dayAndTime: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
  ...timeOfDay,
};
/**
 * Daily and weekly bars: "Nov 3, 2026". In UTC, where IBKR stamps them, so a
 * viewer west of it doesn't see the day before.
 */
const calendarDay: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
};

/**
 * The asset page's timeframes. Each pairs an IBKR `period` with a `bar` size
 * that period allows, keeping every request under IBKR's 1,000 bars.
 * `changeLabel` names the period after the price change; `barDate` formats a
 * hovered bar's time.
 */
// Bar sizes as the IBKR app's TradingView chart defaults them: 5 minutes
// for 1D, 15 for 1W, an hour for 1M, two for 3M, then days and weeks.
export const historyRanges = [
  // One session, drawn across its full trading hours as it fills up.
  {
    id: "1d",
    label: "1D",
    changeLabel: "Today",
    period: "1d",
    bar: "5min",
    barDate: dateAndTime,
    session: true,
  },
  {
    id: "1w",
    label: "1W",
    changeLabel: "Past week",
    period: "1w",
    bar: "15min",
    barDate: dayAndTime,
  },
  {
    id: "1m",
    label: "1M",
    changeLabel: "Past month",
    period: "1m",
    bar: "1h",
    barDate: dateAndTime,
  },
  {
    id: "3m",
    label: "3M",
    changeLabel: "Past 3 months",
    period: "3m",
    bar: "2h",
    barDate: dateAndTime,
  },
  {
    id: "6m",
    label: "6M",
    changeLabel: "Past 6 months",
    period: "6m",
    bar: "1d",
    barDate: calendarDay,
  },
  // A year of bars, cut back to 1 January in `assetHistoryQuery`.
  {
    id: "ytd",
    label: "YTD",
    changeLabel: "Year to date",
    period: "1y",
    bar: "1d",
    barDate: calendarDay,
    yearToDate: true,
  },
  {
    id: "1y",
    label: "1Y",
    changeLabel: "Past year",
    period: "1y",
    bar: "1d",
    barDate: calendarDay,
  },
  // Weekly: five years of daily bars would pass IBKR's 1,000.
  {
    id: "5y",
    label: "5Y",
    changeLabel: "Past 5 years",
    period: "5y",
    bar: "1w",
    barDate: calendarDay,
  },
] as const;

export type HistoryRange = (typeof historyRanges)[number];

/** US regular hours, for a history that doesn't say how long its day is. */
const defaultSessionMinutes = 390;

/**
 * US after-hours run four hours past the close (16:00–20:00 ET). IBKR doesn't
 * say how long a listing's extended hours are, so a day with any is drawn
 * this far past its close, as other stock apps do.
 */
const afterHoursMs = 4 * 3_600_000;

const dayMs = 86_400_000;

/**
 * One trading day, extended hours included, in epoch ms: the chart spans
 * `start` to `end`, and bars from `open` until `close` are regular hours.
 */
export interface TradingSession {
  start: number;
  open: number;
  close: number;
  end: number;
}

export type SessionPhase = "pre" | "regular" | "after";

export const sessionPhase = (session: TradingSession, time: number) => {
  if (time < session.open) {
    return "pre";
  }
  return time < session.close ? "regular" : "after";
};

/** A history's bars, and for a one-session range, the day they cover. */
export type AssetHistory = IbkrHistory & { session?: TradingSession };

/**
 * The day's bars from `extended` (in and outside regular hours), with the
 * session they belong to: the schedule's for the exchange's date of the
 * latest bar, as IBKR's Android chart takes its sessions from the listing's
 * hours. Bars from before it (the previous session's, just after the new
 * one starts) are dropped; later bars stretch it.
 *
 * Without a schedule (or on a day it has shut), the session is inferred
 * from `regular` (regular hours only): before the open it still holds the
 * previous session, so the open is taken at the same time of day, an hour
 * out the morning after a clock change.
 */
const tradingDay = (
  regular: IbkrHistory,
  extended: IbkrHistory,
  schedule: TradingSchedule | null
): AssetHistory => {
  const [first] = extended.data;
  const last = extended.data.at(-1);
  if (!first || !last) {
    return extended;
  }
  const scheduled = schedule && chartSessionAt(schedule, last.t);
  if (scheduled) {
    // Only the session's bars, and that day's from before it opens: the
    // response can still hold the previous session's.
    const day = exchangeDate(schedule, scheduled.open).toString();
    const ours = extended.data.filter(
      (bar) =>
        bar.t >= scheduled.start ||
        exchangeDate(schedule, bar.t).toString() === day
    );
    const data = ours.length > 0 ? ours : extended.data;
    // IBKR's schedule can list only regular hours (US stocks do). With
    // extended bars, the day then runs from the first bar to four hours
    // after the close, as without a schedule.
    const listsExtended =
      scheduled.start < scheduled.open || scheduled.end > scheduled.close;
    const hasExtendedHours = data.some(
      (bar) => bar.t < scheduled.open || bar.t >= scheduled.close
    );
    const end =
      !listsExtended && hasExtendedHours
        ? scheduled.close + afterHoursMs
        : scheduled.end;
    return {
      ...extended,
      data,
      session: {
        ...scheduled,
        start: Math.min(scheduled.start, data[0]?.t ?? scheduled.start),
        end: Math.max(end, last.t),
      },
    };
  }
  const [regularFirst] = regular.data;
  if (!regularFirst) {
    return extended;
  }
  const open =
    first.t + ((((regularFirst.t - first.t) % dayMs) + dayMs) % dayMs);
  const close =
    open + (regular.tradingDayDuration ?? defaultSessionMinutes) * 60_000;
  const hasExtendedHours = extended.data.some(
    (bar) => bar.t < open || bar.t >= close
  );
  return {
    ...extended,
    session: {
      start: first.t,
      open,
      close,
      end: Math.max(hasExtendedHours ? close + afterHoursMs : close, last.t),
    },
  };
};

/**
 * The bars since 1 January of this year at the exchange (UTC without its
 * schedule); IBKR has no year-to-date period. Daily bars are stamped at UTC
 * midnight of their trading date, so that's where the year starts.
 */
const yearToDate = (
  history: IbkrHistory,
  schedule: TradingSchedule | null
): IbkrHistory => {
  const { year } = today(schedule?.timeZone ?? "UTC");
  const start = Date.UTC(year, 0, 1);
  return { ...history, data: history.data.filter((bar) => bar.t >= start) };
};

export const defaultHistoryRange: HistoryRange = historyRanges[0];

/**
 * The past year, before analysts' 12-month price targets: as much history
 * as the targets look ahead, as TipRanks and MarketBeat chart them.
 */
export const targetHistoryRange: HistoryRange = historyRanges[6];

/**
 * Bars for one of `historyRanges`. A one-session range also has pre-market
 * and after-hours bars, with the session saying which are which; the two
 * requests run side by side.
 */
export const assetHistoryQuery = (conid: number, range: HistoryRange) =>
  queryOptions({
    queryKey: ["ibkr", "portal", "asset", conid, "history", range.id],
    queryFn: async ({ client }): Promise<AssetHistory> => {
      await client.query({ ...ibkrBrokerageQuery, staleTime: "static" });
      const path = `iserver/marketdata/history?conid=${conid}&period=${range.period}&bar=${range.bar}`;
      if ("yearToDate" in range) {
        const [history, schedule] = await Promise.all([
          requestIbkrPortal("GET", path),
          scheduleOrNull(client, conid),
        ]);
        return yearToDate(decodeHistory(history), schedule);
      }
      if (!("session" in range)) {
        return decodeHistory(await requestIbkrPortal("GET", path));
      }
      const [regular, extended, schedule] = await Promise.all([
        requestIbkrPortal("GET", path),
        requestIbkrPortal("GET", `${path}&outsideRth=true`),
        scheduleOrNull(client, conid),
      ]);
      return tradingDay(
        decodeHistory(regular),
        decodeHistory(extended),
        schedule
      );
    },
    retry: false,
    staleTime: 5 * 60_000,
  });

/*
 * IBKR's fundamentals app, undocumented: the schemas only take what its own
 * app reads, everything optional. The news query keeps the raw response so
 * the page can show what came back.
 */

/** A string or a number, as fundamentals values arrive either way. */
const LooseText = Schema.optional(Schema.Union([Schema.String, Schema.Number]));

/** A loose value as text, or undefined when it's missing or empty. */
const looseText = (value: string | number | undefined) =>
  value === undefined ? undefined : String(value).trim() || undefined;

const decodeProfile = Schema.decodeUnknownSync(
  Schema.Struct({
    businessSummary: Schema.optional(Schema.Struct({ value: LooseText })),
  })
);

/** The company profile; `about` is IBKR's business summary. */
export const assetProfileQuery = (conid: number) =>
  queryOptions({
    queryKey: ["ibkr", "fundamentals", "profile", conid],
    queryFn: async ({ client }) => {
      await client.query({ ...ibkrBrokerageQuery, staleTime: "static" });
      const profile = await requestIbkrFundamentals(`profile/${conid}`);
      return {
        about: looseText(decodeProfile(profile).businessSummary?.value),
      };
    },
    retry: false,
    staleTime: 60 * 60_000,
  });

/** The latest articles about the company. */
export const assetNewsQuery = (conid: number) =>
  queryOptions({
    queryKey: ["ibkr", "fundamentals", "news", conid],
    queryFn: async ({ client }) => {
      await client.query({ ...ibkrBrokerageQuery, staleTime: "static" });
      // Current IBKR clients request headlines from news2, outside fundamentals.
      const raw = await requestIbkrNews(
        `landing/${conid}?widgets=news&lang=en`
      );
      const articles = parseIbkrNewsWidget(raw);
      return { articles, raw };
    },
    retry: false,
    staleTime: 5 * 60_000,
  });

const decodeRatings = Schema.decodeUnknownSync(
  Schema.Struct({
    summary: Schema.optional(
      Schema.Struct({
        buy: LooseText,
        hold: LooseText,
        sell: LooseText,
        targets: Schema.optional(
          Schema.Array(
            Schema.Struct({
              kind: LooseText,
              abs: LooseText,
              formatted_abs: LooseText,
              formatted_rel: LooseText,
            })
          )
        ),
      })
    ),
  })
);

/**
 * Analysts' recommendations, best to worst, as they're listed: IBKR's
 * summary counts these three.
 */
export const ratingLevels = [
  { key: "buy", label: "Buy" },
  { key: "hold", label: "Hold" },
  { key: "sell", label: "Sell" },
] as const;

export type RatingLevel = (typeof ratingLevels)[number]["key"];

/**
 * A price target in the level it leans to: the high target with buy, the
 * low with sell, the mean (or anything else) with hold.
 */
const targetLevel = (kind: string): RatingLevel => {
  const name = kind.toLowerCase();
  if (name.includes("high")) {
    return "buy";
  }
  return name.includes("low") ? "sell" : "hold";
};

/**
 * Analyst ratings: how many recommend each level, and 12-month price
 * targets.
 */
export const assetRatingsQuery = (conid: number) =>
  queryOptions({
    queryKey: ["ibkr", "fundamentals", "ratings", conid],
    queryFn: async ({ client }) => {
      await client.query({ ...ibkrBrokerageQuery, staleTime: "static" });
      const { summary } = decodeRatings(
        await requestIbkrFundamentals(`ratings/${conid}?price=true`)
      );
      // Every level, even with none, so each keeps its row.
      const consensus = ratingLevels.map(({ key, label }) => {
        const count = Number(summary?.[key] ?? 0);
        return { key, label, count: Number.isFinite(count) ? count : 0 };
      });
      const targets = (summary?.targets ?? [])
        .flatMap((target) => {
          const kind = looseText(target.kind);
          // The number IBKR sends, else its text, e.g. "1,234.50".
          const price =
            parseIbkrNumber(looseText(target.abs)) ??
            parseIbkrNumber(looseText(target.formatted_abs));
          if (!kind || price === undefined) {
            return [];
          }
          // From today's price, as a fraction: "+12.00%" → 0.12. Undefined
          // without it.
          const rel = parseIbkrNumber(looseText(target.formatted_rel));
          return [
            {
              key: kind,
              label: `${kind} target`,
              price,
              change: rel === undefined ? undefined : rel / 100,
              level: targetLevel(kind),
            },
          ];
        })
        // Highest first, as they sit on the chart.
        .toSorted((a, b) => b.price - a.price);
      return { consensus, targets };
    },
    retry: false,
    staleTime: 60 * 60_000,
  });
