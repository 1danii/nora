import { Schema } from "effect";

/**
 * Deliberately loose decoders for IBKR Web API responses. Unknown keys are
 * ignored and most fields are optional; tighten them as real responses confirm
 * which fields IBKR always sends.
 */

const optionalNumber = Schema.optional(Schema.NullOr(Schema.Number));
const optionalString = Schema.optional(Schema.NullOr(Schema.String));

export const IbkrPortfolioAccountSchema = Schema.Struct({
  accountId: Schema.String,
  currency: optionalString,
  desc: optionalString,
  displayName: optionalString,
  type: optionalString,
});
export type IbkrPortfolioAccount = typeof IbkrPortfolioAccountSchema.Type;

export const IbkrPositionSchema = Schema.Struct({
  acctId: optionalString,
  conid: Schema.Number,
  /**
   * The symbol, with " @EXCHANGE" after it when the position isn't on the
   * primary US listing, e.g. "CSG1 @AEB". Live positions carry no `ticker`
   * or `name`; `trsrv/secdef` has those.
   */
  contractDesc: optionalString,
  description: optionalString,
  position: Schema.Number,
  mktPrice: optionalNumber,
  mktValue: optionalNumber,
  currency: optionalString,
  avgCost: optionalNumber,
  avgPrice: optionalNumber,
  realizedPnl: optionalNumber,
  unrealizedPnl: optionalNumber,
  /** Today's gain or loss, in the position's currency. */
  dailyPnl: optionalNumber,
  assetClass: optionalString,
  secType: optionalString,
  ticker: optionalString,
  name: optionalString,
  fullName: optionalString,
  listingExchange: optionalString,
  isin: optionalString,
});
export type IbkrPosition = typeof IbkrPositionSchema.Type;

/** `portfolio/{accountId}/ledger`: one entry per currency plus `BASE`. */
export const IbkrLedgerSchema = Schema.Record(
  Schema.String,
  Schema.Struct({
    currency: optionalString,
    cashbalance: optionalNumber,
    settledcash: optionalNumber,
    netliquidationvalue: optionalNumber,
    stockmarketvalue: optionalNumber,
    exchangerate: optionalNumber,
    timestamp: optionalNumber,
  })
);
export type IbkrLedger = typeof IbkrLedgerSchema.Type;

/** `portfolio/{accountId}/summary`: keyed metrics such as `netliquidation`. */
export const IbkrAccountSummarySchema = Schema.Record(
  Schema.String,
  Schema.Struct({
    amount: optionalNumber,
    currency: optionalString,
    value: optionalString,
    timestamp: optionalNumber,
    isNull: Schema.optional(Schema.NullOr(Schema.Boolean)),
  })
);
export type IbkrAccountSummary = typeof IbkrAccountSummarySchema.Type;

/**
 * `sso/validate`: who signed in. `LOGIN_TYPE` is 1 for a live account and 2
 * for paper trading, as IBKR's web apps read it.
 */
export const IbkrSsoValidateSchema = Schema.Struct({
  USER_NAME: optionalString,
  LOGIN_TYPE: optionalNumber,
});
export type IbkrSsoValidate = typeof IbkrSsoValidateSchema.Type;

/**
 * `iserver/account/pnl/partitioned`: profit and loss keyed by
 * `{accountId}.Core`. `dpl` is today's, `nl` the net liquidation value.
 */
export const IbkrPnlSchema = Schema.Struct({
  upnl: Schema.optional(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        dpl: optionalNumber,
        nl: optionalNumber,
        upl: optionalNumber,
      })
    )
  ),
});
export type IbkrPnl = typeof IbkrPnlSchema.Type;

/** One series of `pa/performance`, a value per date in `dates`. */
const IbkrPerformanceSeriesSchema = Schema.Struct({
  /** `yyyyMMdd`, oldest first. */
  dates: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  /** `D`, `W` or `M`: how far apart the dates are. */
  freq: optionalString,
  data: Schema.optional(
    Schema.NullOr(
      Schema.Array(
        Schema.Struct({
          id: optionalString,
          baseCurrency: optionalString,
          /** The account's value at each date's close (`nav` only). */
          navs: Schema.optional(
            Schema.NullOr(Schema.Array(Schema.NullOr(Schema.Number)))
          ),
          /** The return since the period's start, as a fraction (`cps` only). */
          returns: Schema.optional(
            Schema.NullOr(Schema.Array(Schema.NullOr(Schema.Number)))
          ),
          /** The value before the first date. */
          startNAV: Schema.optional(
            Schema.NullOr(
              Schema.Struct({ date: optionalString, val: optionalNumber })
            )
          ),
        })
      )
    )
  ),
});

/**
 * `POST pa/performance` with `{ acctIds, period }`: the account's value over
 * the period (`nav`) and its time-weighted return (`cps`, cumulative), so
 * deposits and withdrawals don't count as gains. A portal call: no
 * brokerage session needed.
 */
export const IbkrPerformanceSchema = Schema.Struct({
  currencyType: optionalString,
  nav: Schema.optional(Schema.NullOr(IbkrPerformanceSeriesSchema)),
  cps: Schema.optional(Schema.NullOr(IbkrPerformanceSeriesSchema)),
  /** The return method, e.g. "TWR". */
  pm: optionalString,
});
export type IbkrPerformance = typeof IbkrPerformanceSchema.Type;

/** `iserver/marketdata/snapshot`: field IDs (e.g. "31" last price) map to strings. */
export const IbkrMarketSnapshotSchema = Schema.Array(
  Schema.Record(Schema.String, Schema.Unknown)
);
export type IbkrMarketSnapshot = typeof IbkrMarketSnapshotSchema.Type;

export const IbkrAuthStatusSchema = Schema.Struct({
  authenticated: Schema.optional(Schema.NullOr(Schema.Boolean)),
  competing: Schema.optional(Schema.NullOr(Schema.Boolean)),
  connected: Schema.optional(Schema.NullOr(Schema.Boolean)),
});

/**
 * `iserver/secdef/search?symbol=`: the contracts IBKR's search box offers for
 * a symbol, primary listing first. `description` is the primary exchange.
 */
export const IbkrContractSearchSchema = Schema.Array(
  Schema.Struct({
    conid: Schema.Union([Schema.String, Schema.Number]),
    symbol: optionalString,
    companyName: optionalString,
    description: optionalString,
    secType: optionalString,
    // The label IBKR's search shows, e.g. "APPLE INC (NASDAQ)".
    companyHeader: optionalString,
    // What trades under the result: the stock, its options, warrants, etc.
    // The section whose conid is the result's is the result's own type.
    sections: Schema.optional(
      Schema.NullOr(
        Schema.Array(
          Schema.Struct({
            secType: optionalString,
            conid: Schema.optional(
              Schema.NullOr(Schema.Union([Schema.String, Schema.Number]))
            ),
            exchange: optionalString,
          })
        )
      )
    ),
  })
);
export type IbkrContractSearch = typeof IbkrContractSearchSchema.Type;

/**
 * `iserver/contract/{conid}/info`: the contract's details, as documented in
 * IBKR's Web API reference ("Instrument Attributes Detail"). `industry` and
 * `category` classify the company; IBKR has no description or headcount here.
 */
export const IbkrContractInfoSchema = Schema.Struct({
  con_id: optionalNumber,
  symbol: optionalString,
  company_name: optionalString,
  instrument_type: optionalString,
  // "SMART" for most; the listing's own exchange is `primary_exchange`.
  exchange: optionalString,
  primary_exchange: optionalString,
  // Every venue it trades on, comma separated: "OVERNIGHT" among them when
  // it trades in IBKR's US overnight session.
  valid_exchanges: optionalString,
  currency: optionalString,
  industry: optionalString,
  category: optionalString,
});
export type IbkrContractInfo = typeof IbkrContractInfoSchema.Type;

/**
 * `iserver/marketdata/history`: bars for the requested `period` and `bar`
 * size, oldest first, at most 1,000. `t` is the bar's start in epoch ms;
 * `o`/`h`/`l`/`c` are prices and `v` volume.
 */
export const IbkrHistorySchema = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      t: Schema.Number,
      o: Schema.Number,
      h: Schema.Number,
      l: Schema.Number,
      c: Schema.Number,
      v: Schema.Number,
    })
  ),
  mdAvailability: optionalString,
  /** Minutes in the trading day the bars cover, e.g. 390 for US regular hours. */
  tradingDayDuration: optionalNumber,
});
export type IbkrHistory = typeof IbkrHistorySchema.Type;
