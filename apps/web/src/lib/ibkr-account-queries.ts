import {
  IbkrAccountSummarySchema,
  IbkrLedgerSchema,
  IbkrPerformanceSchema,
  IbkrPnlSchema,
  IbkrPortfolioAccountSchema,
  IbkrPositionSchema,
  IbkrSsoValidateSchema,
} from "@nora/ibkr/api-schemas";
import type { IbkrPerformance } from "@nora/ibkr/api-schemas";
import { queryOptions } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { Schema } from "effect";

import { parseIbkrNewsSearch } from "@/lib/ibkr-asset-news";
import { requestIbkrNews, requestIbkrPortal } from "@/lib/ibkr-login-queries";

/*
 * The signed-in user and their account, for the dashboard. Only
 * `portfolio/*`, `pa/*`, `news2` and `sso/validate`, except where noted:
 * they don't need the brokerage session, so they load even while TWS or the
 * mobile app holds it. Keys sit under ["ibkr", "portal"], so signing out
 * drops them.
 */

const decodeSso = Schema.decodeUnknownSync(IbkrSsoValidateSchema);
const decodeAccounts = Schema.decodeUnknownSync(
  Schema.Array(IbkrPortfolioAccountSchema)
);
const decodeSummary = Schema.decodeUnknownSync(IbkrAccountSummarySchema);
const decodeLedger = Schema.decodeUnknownSync(IbkrLedgerSchema);
const decodePnl = Schema.decodeUnknownSync(IbkrPnlSchema);
const decodePositions = Schema.decodeUnknownSync(
  Schema.Array(IbkrPositionSchema)
);
const decodePerformance = Schema.decodeUnknownSync(IbkrPerformanceSchema);

/** Live or paper trading, as IBKR's web apps tell them apart. */
export type IbkrLoginType = "live" | "paper";

/** Who signed in: the username and whether it's a live or paper login. */
export const ibkrUserQuery = queryOptions({
  queryKey: ["ibkr", "portal", "user"],
  queryFn: async () => {
    const sso = decodeSso(await requestIbkrPortal("GET", "sso/validate"));
    const loginType: IbkrLoginType = sso.LOGIN_TYPE === 2 ? "paper" : "live";
    return { username: sso.USER_NAME ?? undefined, loginType };
  },
  retry: false,
  // Neither changes during a session.
  staleTime: "static",
});

/** The user's accounts; IBKR expects this call before other portfolio reads. */
export const ibkrAccountsQuery = queryOptions({
  queryKey: ["ibkr", "portal", "accounts"],
  queryFn: async () =>
    decodeAccounts(await requestIbkrPortal("GET", "portfolio/accounts")),
  retry: false,
  staleTime: 5 * 60_000,
});

/** Refreshed every minute, with the session's own /tickle. */
const accountRefresh = {
  retry: false,
  staleTime: 30_000,
  refetchInterval: 60_000,
} as const;

/** Totals such as `netliquidation` (total value) and `totalcashvalue`. */
export const ibkrAccountSummaryQuery = (accountId: string) =>
  queryOptions({
    queryKey: ["ibkr", "portal", "account", accountId, "summary"],
    queryFn: async () =>
      decodeSummary(
        await requestIbkrPortal("GET", `portfolio/${accountId}/summary`)
      ),
    ...accountRefresh,
  });

/** Cash and value per currency, plus `BASE`, the account's own currency. */
export const ibkrLedgerQuery = (accountId: string) =>
  queryOptions({
    queryKey: ["ibkr", "portal", "account", accountId, "ledger"],
    queryFn: async () =>
      decodeLedger(
        await requestIbkrPortal("GET", `portfolio/${accountId}/ledger`)
      ),
    ...accountRefresh,
  });

/**
 * What the account holds: the first page, up to 100 positions, as IBKR's
 * portal lists them. Prices and values are IBKR's, refreshed with the rest.
 */
export const ibkrPositionsQuery = (accountId: string) =>
  queryOptions({
    queryKey: ["ibkr", "portal", "account", accountId, "positions"],
    queryFn: async () =>
      decodePositions(
        await requestIbkrPortal("GET", `portfolio/${accountId}/positions/0`)
      ),
    ...accountRefresh,
  });

/**
 * The periods `pa/performance` takes that the dashboard offers, with the
 * label its picker shows and how the change line names it.
 */
export const performancePeriods = [
  { id: "7D", label: "1W", changeLabel: "Past week" },
  { id: "1M", label: "1M", changeLabel: "Past month" },
  { id: "3M", label: "3M", changeLabel: "Past 3 months" },
  { id: "6M", label: "6M", changeLabel: "Past 6 months" },
  { id: "YTD", label: "YTD", changeLabel: "Year to date" },
  { id: "12M", label: "1Y", changeLabel: "Past year" },
] as const;

export type PerformancePeriod = (typeof performancePeriods)[number];

export const defaultPerformancePeriod: PerformancePeriod =
  performancePeriods[1];

/** `yyyyMMdd` as the UTC midnight it names; undefined when it isn't one. */
const performanceTime = (date: string) => {
  const match = /^(?<year>\d{4})(?<month>\d{2})(?<day>\d{2})$/u.exec(date);
  return match?.groups
    ? Date.UTC(
        Number(match.groups.year),
        Number(match.groups.month) - 1,
        Number(match.groups.day)
      )
    : undefined;
};

/** The account's value over a period, as the chart and change line read it. */
export interface AccountPerformance {
  /** Each day's closing value, oldest first: `t` in ms, `c` the value. */
  bars: { t: number; c: number }[];
  /**
   * The time-weighted return since the start at each bar, so deposits and
   * withdrawals don't count as gains.
   */
  returns: number[];
  /**
   * The money gained or lost since the start at each bar: each day's return
   * on the value the day before, added up. IBKR gives no daily P&L or cash
   * flows here, so this is worked out from `nav` and `cps`; on a day with a
   * deposit it's off by about the deposit times that day's return.
   */
  earned: number[];
  /** The value before the first bar, which the change is measured from. */
  startValue: number | undefined;
  currency: string | undefined;
}

/** The account's own row of a `pa/performance` series, else the first. */
const seriesRow = (
  series: IbkrPerformance["nav"] | IbkrPerformance["cps"],
  accountId: string
) => series?.data?.find((row) => row.id === accountId) ?? series?.data?.[0];

/** The cumulative return at `index`, if `cps` gives it for `date`. */
const returnOn = (
  dates: readonly string[] | null | undefined,
  returns: readonly (number | null)[] | null | undefined,
  index: number,
  date: string
) => (dates?.[index] === date ? (returns?.[index] ?? undefined) : undefined);

/** Where a day leaves off: its value, growth since the start, money earned. */
interface PerformanceDay {
  value: number;
  /** 1 + the time-weighted return since the start. */
  growth: number;
  earned: number;
}

/**
 * The day after `previous`, closing at `value`. Its return is the step in
 * `cps`; where `cps` has none for the date, the value's own change, as if
 * nothing was deposited that day. The money it earned is that return on
 * the day before's value.
 */
const nextDay = (
  previous: PerformanceDay,
  value: number,
  since: number | undefined
): PerformanceDay => {
  const growth =
    since === undefined
      ? previous.growth * (previous.value ? value / previous.value : 1)
      : 1 + since;
  const dayReturn = previous.growth ? growth / previous.growth - 1 : 0;
  return {
    value,
    growth,
    earned: previous.earned + previous.value * dayReturn,
  };
};

/**
 * Reads `pa/performance` as the chart does: one bar per date that has a
 * value, with the return IBKR gives for the same date and the money earned
 * by then.
 */
export const performanceOf = (
  accountId: string,
  { nav, cps }: IbkrPerformance
): AccountPerformance => {
  const values = seriesRow(nav, accountId);
  const cumulative = seriesRow(cps, accountId);
  const navs = values?.navs ?? [];
  const startValue =
    values?.startNAV?.val ?? navs.find((value) => value !== null) ?? undefined;
  const performance: AccountPerformance = {
    bars: [],
    returns: [],
    earned: [],
    startValue,
    currency: values?.baseCurrency ?? undefined,
  };
  let previous: PerformanceDay = {
    value: startValue ?? 0,
    growth: 1,
    earned: 0,
  };
  for (const [index, date] of (nav?.dates ?? []).entries()) {
    const t = performanceTime(date);
    const c = navs[index];
    if (t !== undefined && c !== undefined && c !== null) {
      // `cps` normally lists the same dates; a return for another date is
      // left out rather than misplaced.
      const since = returnOn(cps?.dates, cumulative?.returns, index, date);
      previous = nextDay(previous, c, since);
      performance.bars.push({ t, c });
      performance.returns.push(since ?? previous.growth - 1);
      performance.earned.push(previous.earned);
    }
  }
  return performance;
};

/**
 * The account's value at each day's close over `period`, from IBKR's
 * portfolio analyst (`pa/performance`), with its time-weighted return:
 * what IBKR's apps show as performance. Closing values change once a day,
 * so they're kept for five minutes.
 */
export const ibkrPerformanceQuery = (
  accountId: string,
  period: PerformancePeriod
) =>
  queryOptions({
    queryKey: [
      "ibkr",
      "portal",
      "account",
      accountId,
      "performance",
      period.id,
    ],
    queryFn: async () =>
      performanceOf(
        accountId,
        decodePerformance(
          await requestIbkrPortal(
            "POST",
            "pa/performance",
            JSON.stringify({ acctIds: [accountId], period: period.id })
          )
        )
      ),
    retry: false,
    staleTime: 5 * 60_000,
  });

/** The browser's time zone, which IBKR's news times are given in. */
const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * The latest news on the account's holdings: the Client Portal's
 * Portfolio news tab (`news2/search2?type=PORTFOLIO`), one request for the
 * whole account.
 */
export const portfolioNewsQuery = (accountId: string) =>
  queryOptions({
    queryKey: ["ibkr", "portal", "account", accountId, "news"],
    queryFn: async () =>
      parseIbkrNewsSearch(
        await requestIbkrNews(
          `search2?type=PORTFOLIO&account=${encodeURIComponent(accountId)}&lang=en_US&tzone=${encodeURIComponent(timeZone())}`
        )
      ),
    retry: false,
    staleTime: 5 * 60_000,
  });

/**
 * Today's profit and loss. An `iserver` call, so it needs the brokerage
 * session open: only enable it once something else opened it.
 */
export const ibkrPnlQuery = (accountId: string) =>
  queryOptions({
    queryKey: ["ibkr", "portal", "account", accountId, "pnl"],
    queryFn: async () => {
      const { upnl = {} } = decodePnl(
        await requestIbkrPortal("GET", "iserver/account/pnl/partitioned")
      );
      // Keyed `{accountId}.Core`; IBKR's apps read the account's own row.
      const [, row] =
        Object.entries(upnl).find(([key]) => key.startsWith(`${accountId}.`)) ??
        [];
      return row?.dpl ?? null;
    },
    ...accountRefresh,
  });

/**
 * Starts the header's reads without waiting for them, so navigation never
 * waits on the balance: who's signed in, the account list, then its summary.
 */
export const prefetchAccountHeader = (queryClient: QueryClient) => {
  void queryClient.prefetchQuery(ibkrUserQuery);
  const prefetchSummary = async () => {
    // `prefetchQuery` doesn't throw, and leaves a failure in the cache for
    // the header's own boundary to show with its retry.
    await queryClient.prefetchQuery(ibkrAccountsQuery);
    const [account] =
      queryClient.getQueryData(ibkrAccountsQuery.queryKey) ?? [];
    if (account) {
      await queryClient.prefetchQuery(
        ibkrAccountSummaryQuery(account.accountId)
      );
    }
  };
  void prefetchSummary();
};
