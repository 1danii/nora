import { IbkrMarketSnapshotSchema } from "@nora/ibkr/api-schemas";
import type { IbkrMarketSnapshot } from "@nora/ibkr/api-schemas";
import { queryOptions } from "@tanstack/react-query";
import { Schema } from "effect";

import { parseIbkrNumber } from "@/lib/format";
import {
  IbkrPendingError,
  requireBrokerage,
  listingSlug,
  retryWhilePending,
} from "@/lib/ibkr-asset-queries";
import {
  requestIbkrImpact,
  requestIbkrPortal,
  requestIbkrScreener,
} from "@/lib/ibkr-login-queries";

/**
 * The lists the Explore page offers, each one of IBKR's market scanner scan
 * types. GlobalTrader's Explore tabs (Most Active, Gainers, Losers) come
 * first; the rest are standard scan types from `iserver/scanner/params`.
 * `id` is the page's `?scan=` value.
 */
export const exploreScans = [
  { id: "most-active", label: "Most active", code: "MOST_ACTIVE" },
  // The most individual trades rather than shares: closer to what retail
  // investors are buying than share volume, which large orders dominate.
  { id: "most-trades", label: "Most trades", code: "TOP_TRADE_COUNT" },
  { id: "gainers", label: "Gainers", code: "TOP_PERC_GAIN" },
  { id: "losers", label: "Losers", code: "TOP_PERC_LOSE" },
  { id: "hot-volume", label: "Hot by volume", code: "HOT_BY_VOLUME" },
  { id: "52w-highs", label: "52-week highs", code: "HIGH_VS_52W_HL" },
  { id: "52w-lows", label: "52-week lows", code: "LOW_VS_52W_HL" },
  { id: "dividend", label: "High dividend", code: "HIGH_DIVIDEND_YIELD_IB" },
] as const;

export type ExploreScan = (typeof exploreScans)[number];
export type ExploreScanId = ExploreScan["id"];

/**
 * Stocks listed on the major US exchanges, as GlobalTrader's US lists. The
 * scanner doesn't say what a contract trades in; these are all in USD.
 */
const scanLocation = "STK.US.MAJOR";
export const scanCurrency = "USD";

const ScanContractSchema = Schema.Struct({
  con_id: Schema.Union([Schema.Number, Schema.String]),
  symbol: Schema.String,
  company_name: Schema.optional(Schema.NullOr(Schema.String)),
  /** E.g. "NASDAQ.NMS": the exchange, then IBKR's market tier. */
  listing_exchange: Schema.optional(Schema.NullOr(Schema.String)),
});

/**
 * The OpenAPI document describes a bare array; the current reference wraps
 * it as `{ contracts, scan_data_column_name }`. Both are accepted.
 */
const decodeScanResult = Schema.decodeUnknownSync(
  Schema.Union([
    Schema.Array(ScanContractSchema),
    Schema.Struct({ contracts: Schema.Array(ScanContractSchema) }),
  ])
);

export interface ScanRow {
  conid: number;
  symbol: string;
  name: string;
  /** The asset page's slug, e.g. "nvda". */
  slug: string;
}

/**
 * One scan's contracts, in IBKR's order (best first). IBKR returns at most
 * 50. Shared by everyone, so cached for a minute.
 */
export const exploreScanQuery = (scan: ExploreScan) =>
  queryOptions({
    queryKey: ["ibkr", "portal", "explore", "scan", scan.code],
    queryFn: async ({ client }): Promise<ScanRow[]> => {
      await requireBrokerage(client);
      const result = decodeScanResult(
        await requestIbkrPortal(
          "POST",
          "iserver/scanner/run",
          JSON.stringify({
            instrument: "STK",
            type: scan.code,
            location: scanLocation,
            filter: [],
          })
        )
      );
      const contracts = "contracts" in result ? result.contracts : result;
      return contracts.flatMap((contract) => {
        const conid = Number(contract.con_id);
        if (!Number.isFinite(conid)) {
          return [];
        }
        const exchange = contract.listing_exchange?.split(".")[0];
        return [
          {
            conid,
            symbol: contract.symbol,
            name: contract.company_name?.trim() || contract.symbol,
            slug: listingSlug(contract.symbol, exchange),
          },
        ];
      });
    },
    retry: false,
    staleTime: 60_000,
  });

/** An ID IBKR may send as a number or a string. */
const IdSchema = Schema.Union([Schema.String, Schema.Number]);

/**
 * `hmds/scanner/customSnapshot`, the Client Portal's Market Screener: the
 * top 200 matches, as bare conids, and how many matched in all.
 */
const decodeScreenerSnapshot = Schema.decodeUnknownOption(
  Schema.Struct({
    instruments: Schema.Array(Schema.Struct({ conid: IdSchema })),
    total: Schema.optional(Schema.NullOr(Schema.Number)),
  })
);

/**
 * The screener's sortable columns, each with the scanner IBKR ranks by, from
 * `hmds/scanner/metaData` (a column's `scanner_asc` / `scanner_desc`, which
 * are these plus `_ASC` / `_DESC`). Sorting is IBKR's: it ranks every
 * matching stock, then sends the top 200.
 */
export const screenerSorts = {
  price: "SCAN_price",
  volume: "SCAN_volume",
  marketCap: "SCAN_usdMarketCap",
  pe: "SCAN_peRatio",
  change: "SCAN_changePerc",
} as const;

export type ScreenerSortId = keyof typeof screenerSorts;

export const isScreenerSortId = (value: unknown): value is ScreenerSortId =>
  typeof value === "string" && Object.hasOwn(screenerSorts, value);

/**
 * The screener's range filters, each with IBKR's codes for its two ends
 * (a filter's `code` and `code2` in `hmds/scanner/metaData`). Values are in
 * the units people type; `toIbkr` converts them to IBKR's (market cap is
 * typed in billions, and IBKR takes millions).
 */
export const screenerRanges = {
  marketCap: {
    above: "marketCapAbove1e6",
    below: "marketCapBelow1e6",
    toIbkr: 1000,
  },
  price: { above: "priceAbove", below: "priceBelow", toIbkr: 1 },
  pe: { above: "minPeRatio", below: "maxPeRatio", toIbkr: 1 },
  dividendYield: {
    above: "dividendYieldFrdAbove",
    below: "dividendYieldFrdBelow",
    toIbkr: 1,
  },
} as const;

export type ScreenerRangeId = keyof typeof screenerRanges;

/** One end of a range, as the URL names it: `priceMin`, `peMax`. */
export type ScreenerBound = `${ScreenerRangeId}${"Min" | "Max"}`;

export const screenerBounds: readonly ScreenerBound[] = [
  "marketCapMin",
  "marketCapMax",
  "priceMin",
  "priceMax",
  "peMin",
  "peMax",
  "dividendYieldMin",
  "dividendYieldMax",
];

/** What the screener lists: its order, and optionally a sector and ranges. */
export interface ScreenerParams {
  sort: ScreenerSortId;
  descending: boolean;
  /**
   * IBKR's `industryLike` filter: a sector ("Technology") or one of its
   * industries ("Technology|Semiconductors"), as `predefinedMetaData` lists
   * them.
   */
  sector?: string;
  /** The ends of the ranges that are set. */
  bounds: Partial<Record<ScreenerBound, number>>;
}

/** The Client Portal screener's opening order: biggest company first. */
export const defaultScreenerParams: ScreenerParams = {
  sort: "marketCap",
  descending: true,
  bounds: {},
};

export const screenerRangeIds: readonly ScreenerRangeId[] = [
  "marketCap",
  "price",
  "pe",
  "dividendYield",
];

/** IBKR's filters for the ranges that are set. */
const rangeFilters = (bounds: ScreenerParams["bounds"]) =>
  screenerRangeIds.flatMap((id) => {
    const { above, below, toIbkr } = screenerRanges[id];
    const min = bounds[`${id}Min`];
    const max = bounds[`${id}Max`];
    const filters: { code: string; value: string }[] = [];
    if (min !== undefined) {
      filters.push({ code: above, value: String(min * toIbkr) });
    }
    if (max !== undefined) {
      filters.push({ code: below, value: String(max * toIbkr) });
    }
    return filters;
  });

/**
 * The Client Portal screener's opening query, US stocks without ETFs or
 * stocks trading under $100K a day, in the given order and sector.
 */
const screenerBody = ({
  sort,
  descending,
  sector,
  bounds,
}: ScreenerParams) => ({
  selector: "STK",
  locations: ["STK.US"],
  scanner: `${screenerSorts[sort]}_${descending ? "DESC" : "ASC"}`,
  filters: [
    { code: "stkTypes", value: "exc:ETF" },
    { code: "avgUsdVolumeAbove", value: "100000" },
    ...(sector ? [{ code: "industryLike", value: sector }] : []),
    ...rangeFilters(bounds),
  ],
});

export interface ScreenerResult {
  /** The matches IBKR sent, in its order: at most 200. */
  conids: number[];
  /** How many stocks matched, usually far more than IBKR sent. */
  total: number;
}

/**
 * US stocks from the Client Portal's Market Screener, sorted and filtered by
 * IBKR: 200 of them rather than a scan's 50, so the list can be paged
 * through. Shared by everyone, so cached for a minute.
 */
export const exploreScreenerQuery = (params: ScreenerParams) =>
  queryOptions({
    queryKey: [
      "ibkr",
      "hmds",
      "explore",
      "screener",
      params.sort,
      params.descending,
      params.sector ?? "",
      screenerBounds.map((bound) => params.bounds[bound] ?? null),
    ],
    queryFn: async ({ client }): Promise<ScreenerResult> => {
      // The screener needs the brokerage session's ID, which Bread's server
      // reads once the session is open.
      await requireBrokerage(client);
      const body = await requestIbkrScreener(
        "POST",
        "scanner/customSnapshot",
        JSON.stringify(screenerBody(params))
      );
      const snapshot = decodeScreenerSnapshot(body);
      if (snapshot._tag === "None") {
        // Raw, so it can be read and the decoding fixed.
        throw new Error(
          `Unexpected screener response: ${JSON.stringify(body).slice(0, 2000)}`
        );
      }
      const { instruments, total } = snapshot.value;
      const conids = instruments
        .map((instrument) => Number(instrument.conid))
        .filter((conid) => Number.isFinite(conid));
      return { conids, total: Math.max(total ?? 0, conids.length) };
    },
    retry: false,
    staleTime: 60_000,
  });

/** `hmds/scanner/predefinedMetaData`'s sectors, each with its industries. */
const decodePredefinedMetaData = Schema.decodeUnknownSync(
  Schema.Struct({
    sectors: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        value: Schema.String,
        industries: Schema.Array(
          Schema.Struct({ name: Schema.String, value: Schema.String })
        ),
      })
    ),
  })
);

export interface ScreenerSector {
  name: string;
  /** The `industryLike` value for the whole sector. */
  value: string;
  industries: readonly { name: string; value: string }[];
}

/**
 * The sectors and industries the screener can filter by. They change about
 * never, so read once per session.
 */
export const exploreSectorsQuery = queryOptions({
  queryKey: ["ibkr", "hmds", "explore", "sectors"],
  queryFn: async (): Promise<readonly ScreenerSector[]> =>
    decodePredefinedMetaData(
      await requestIbkrScreener("GET", "scanner/predefinedMetaData?lang=en")
    ).sectors,
  retry: false,
  staleTime: "static",
});

/** `trsrv/secdef`: each contract's ticker, name and listing exchange. */
const decodeSecdef = Schema.decodeUnknownSync(
  Schema.Struct({
    secdef: Schema.Array(
      Schema.Struct({
        conid: IdSchema,
        ticker: Schema.optional(Schema.NullOr(Schema.String)),
        name: Schema.optional(Schema.NullOr(Schema.String)),
        listingExchange: Schema.optional(Schema.NullOr(Schema.String)),
      })
    ),
  })
);

/**
 * The rows for some of the screener's conids, in the same order: one
 * `trsrv/secdef` call for all of them. Contracts IBKR doesn't describe are
 * left out. Names rarely change, so cached for an hour.
 */
export const exploreContractsQuery = (conids: readonly number[]) =>
  queryOptions({
    queryKey: ["ibkr", "portal", "explore", "contracts", conids],
    queryFn: async (): Promise<ScanRow[]> => {
      const { secdef } = decodeSecdef(
        await requestIbkrPortal(
          "GET",
          `trsrv/secdef?conids=${conids.join(",")}`
        )
      );
      const byConid = new Map(
        secdef.map((contract) => [Number(contract.conid), contract])
      );
      return conids.flatMap((conid) => {
        const contract = byConid.get(conid);
        const symbol = contract?.ticker?.trim();
        if (!symbol) {
          return [];
        }
        return [
          {
            conid,
            symbol,
            name: contract?.name?.trim() || symbol,
            slug: listingSlug(symbol, contract?.listingExchange ?? undefined),
          },
        ];
      });
    },
    retry: false,
    staleTime: 60 * 60_000,
  });

const decodeSnapshot = Schema.decodeUnknownSync(IbkrMarketSnapshotSchema);

/** Snapshot values are documented as strings; some arrive as numbers. */
const decodeSnapshotValue = Schema.decodeUnknownOption(
  Schema.Union([Schema.String, Schema.Number])
);

/**
 * Last price, change and its percentage, prior close, volume and its 90-day
 * average, market cap, P/E, 52-week high and low, dividend yield and
 * ex-dividend date, and IBKR's industry and category (e.g. "Technology" and
 * "Semiconductors"). IDs as on the asset page.
 */
const quoteFields = [
  "31",
  "82",
  "83",
  "7741",
  "87",
  "7282",
  "7289",
  "7290",
  "7293",
  "7294",
  "7287",
  "7288",
  "7280",
  "7281",
];

export interface ExploreQuote {
  last: number | undefined;
  /**
   * The decimals IBKR wrote the last price with, at least two: it sends
   * sub-dollar prices to four ("0.0178"), so they aren't rounded to "$0.02".
   */
  lastDecimals: number;
  /** Today's move, in the price's currency. */
  change: number | undefined;
  /** Today's move as a fraction of the prior close. */
  changeRatio: number | undefined;
  volume: number | undefined;
  /** The 90-day average volume. */
  averageVolume: number | undefined;
  marketCap: number | undefined;
  pe: number | undefined;
  yearHigh: number | undefined;
  yearLow: number | undefined;
  /** As a fraction, e.g. 0.0312. */
  dividendYield: number | undefined;
  /** As IBKR writes it. */
  exDividend: string | undefined;
  /** The most specific classification IBKR has, e.g. "Semiconductors". */
  industry: string | undefined;
}

const quoteOfRow = (row: IbkrMarketSnapshot[number]): ExploreQuote => {
  const textOf = (field: string) => {
    const value = decodeSnapshotValue(row[field]);
    const text = value._tag === "Some" ? String(value.value).trim() : "";
    return text === "" ? undefined : text;
  };
  const numberOf = (field: string) => parseIbkrNumber(textOf(field));
  const lastText = textOf("31");
  const last = parseIbkrNumber(lastText);
  const priorClose = numberOf("7741");
  const percentChange = numberOf("83");
  let changeRatio: number | undefined;
  if (percentChange !== undefined) {
    changeRatio = percentChange / 100;
  } else if (last !== undefined && priorClose) {
    changeRatio = (last - priorClose) / priorClose;
  }
  const pe = numberOf("7290");
  const dividendYield = numberOf("7287");
  return {
    last,
    lastDecimals: Math.max(2, lastText?.split(".")[1]?.length ?? 0),
    change:
      numberOf("82") ??
      (last !== undefined && priorClose ? last - priorClose : undefined),
    changeRatio,
    volume: numberOf("87"),
    averageVolume: numberOf("7282"),
    marketCap: numberOf("7289"),
    // IBKR sends a P/E of 0 or below for a company without earnings.
    pe: pe !== undefined && pe > 0 ? pe : undefined,
    yearHigh: numberOf("7293"),
    yearLow: numberOf("7294"),
    dividendYield:
      dividendYield === undefined ? undefined : dividendYield / 100,
    exDividend: textOf("7288"),
    industry: textOf("7281") ?? textOf("7280"),
  };
};

/**
 * The rows' quotes, one snapshot for the whole list, by conid. IBKR's first
 * request only subscribes, with no fields yet: that retries until they come.
 */
export const exploreQuotesQuery = (conids: readonly number[]) =>
  queryOptions({
    queryKey: ["ibkr", "portal", "explore", "quotes", conids],
    queryFn: async () => {
      const rows = decodeSnapshot(
        await requestIbkrPortal(
          "GET",
          `iserver/marketdata/snapshot?conids=${conids.join(",")}&fields=${quoteFields.join(",")}`
        )
      );
      if (!rows.some((row) => "31" in row)) {
        throw new IbkrPendingError("IBKR didn't send market data.");
      }
      return new Map(rows.map((row) => [Number(row.conid), quoteOfRow(row)]));
    },
    ...retryWhilePending(5),
    staleTime: 5000,
  });

const PopularListSummarySchema = Schema.Struct({
  id: IdSchema,
  name: Schema.String,
});

const PopularListsSchema = Schema.Array(PopularListSummarySchema);

/**
 * `impact/popular/list`: IBKR's popular lists. Its shape isn't known yet (no
 * live capture), so a bare array is read, or one wrapped in `lists`,
 * `items` or `data`.
 */
const decodeBarePopularLists = Schema.decodeUnknownOption(PopularListsSchema);
const decodeWrappedPopularLists = Schema.decodeUnknownSync(
  Schema.Struct({
    lists: Schema.optional(PopularListsSchema),
    items: Schema.optional(PopularListsSchema),
    data: Schema.optional(PopularListsSchema),
  })
);

const popularListsOf = (body: Schema.Json) => {
  const bare = decodeBarePopularLists(body);
  if (bare._tag === "Some") {
    return bare.value;
  }
  const wrapped = decodeWrappedPopularLists(body);
  return wrapped.lists ?? wrapped.items ?? wrapped.data ?? [];
};

export interface PopularList {
  id: string;
  name: string;
}

/**
 * The popular lists GlobalTrader's Explore shows, e.g. "Popular with IBKR
 * clients" and "Brands you may know". Named by IBKR, so they change rarely.
 */
export const popularListsQuery = queryOptions({
  queryKey: ["ibkr", "impact", "popular", "lists"],
  queryFn: async (): Promise<PopularList[]> => {
    const lists = popularListsOf(await requestIbkrImpact("popular/list"));
    return lists.map(({ id, name }) => ({ id: String(id), name }));
  },
  retry: false,
  staleTime: 60 * 60_000,
});

/** `impact/popular/get?id=`: one list, as GlobalTrader reads it. */
const decodePopularList = Schema.decodeUnknownSync(
  Schema.Struct({
    instruments: Schema.Array(
      Schema.Struct({
        conid: IdSchema,
        symbol: Schema.String,
        company_name: Schema.optional(Schema.NullOr(Schema.String)),
      })
    ),
  })
);

/** One popular list's contracts, in IBKR's order. */
export const popularListQuery = (id: string) =>
  queryOptions({
    queryKey: ["ibkr", "impact", "popular", "list", id],
    queryFn: async (): Promise<ScanRow[]> => {
      const { instruments } = decodePopularList(
        await requestIbkrImpact(`popular/get?id=${encodeURIComponent(id)}`)
      );
      return instruments.flatMap((instrument) => {
        const conid = Number(instrument.conid);
        return Number.isFinite(conid)
          ? [
              {
                conid,
                symbol: instrument.symbol,
                name: instrument.company_name?.trim() || instrument.symbol,
                // No exchange in the list: IBKR's pick for the bare ticker.
                slug: listingSlug(instrument.symbol),
              },
            ]
          : [];
      });
    },
    retry: false,
    staleTime: 10 * 60_000,
  });
