import type { IbkrPosition } from "@nora/ibkr/api-schemas";
import NumberFlow, { NumberFlowElement } from "@number-flow/react";
import * as stylex from "@stylexjs/stylex";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";

import { summaryAmount } from "@/components/account-balance";
import { CurrencyFlag } from "@/components/currency-flag";
import { FactGrid } from "@/components/fact-grid";
import {
  ChangeFigures,
  changeSkeleton,
  Trend,
} from "@/components/price-change";
import type { ChartBar, HoveredBar } from "@/components/price-chart";
import { PriceChart } from "@/components/price-chart";
import { QueryBoundary } from "@/components/query-boundary";
import { RangePicker } from "@/components/range-picker";
import { TickerLogo, TickerLogoPlaceholder } from "@/components/ticker-logo";
import { listStyles } from "@/components/ui/list-styles";
import { InstantReveal } from "@/components/ui/skeleton";
import {
  formatMoney,
  formatSignedMoney,
  moneyOptions,
  percent,
  signedNumber,
} from "@/lib/format";
import type {
  AccountPerformance,
  PerformancePeriod,
} from "@/lib/ibkr-account-queries";
import {
  defaultPerformancePeriod,
  ibkrAccountSummaryQuery,
  ibkrAccountsQuery,
  ibkrLedgerQuery,
  ibkrPerformanceQuery,
  ibkrPositionsQuery,
  performancePeriods,
  portfolioNewsQuery,
} from "@/lib/ibkr-account-queries";
import { listingSlug } from "@/lib/ibkr-asset-queries";
import { useBrokerageAccess } from "@/lib/ibkr-brokerage";
import type { ExploreQuote, ScanRow } from "@/lib/ibkr-explore-queries";
import {
  exploreContractsQuery,
  exploreQuotesQuery,
  exploreScanQuery,
  exploreScans,
  scanCurrency,
} from "@/lib/ibkr-explore-queries";
import { headings, text } from "@/styles/text";
import { breakpoints, colors } from "@/styles/tokens.stylex";

const styles = stylex.create({
  // Room below the last section too, so the page doesn't end on it.
  page: {
    paddingBottom: stylex.env.spacing(24),
    paddingTop: stylex.env.spacing(8),
  },
  // As the asset page: twelve columns from lg up, the account across eight
  // and the market in four. Stacked below the large breakpoint.
  columns: {
    gap: stylex.env.spacing(10),
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      [breakpoints.lg]: "repeat(12, minmax(0, 1fr))",
    },
  },
  main: {
    gridColumn: {
      default: null,
      [breakpoints.lg]: "span 8",
    },
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  aside: {
    gap: stylex.env.spacing(10),
    gridColumn: {
      default: null,
      [breakpoints.lg]: "span 4",
    },
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  // "Total value" over the amount, then its move: the asset page's price
  // block, with a label.
  value: {
    gap: stylex.env.spacing(1),
    display: "flex",
    flexDirection: "column",
  },
  // The amount over its move, 10px apart as the asset page's price. Its own
  // box, as the boundary wraps it in one.
  figures: {
    gap: stylex.env.spacing(2.5),
    display: "flex",
    flexDirection: "column",
  },
  label: {
    color: colors.gray11,
  },
  // One heading line tall (1lh): NumberFlow pads its digits for the roll and
  // would otherwise push the layout.
  amount: {
    alignItems: "center",
    color: colors.gray12,
    display: "flex",
    fontVariantNumeric: "tabular-nums",
    height: "1lh",
  },
  move: {
    alignItems: "center",
    color: colors.gray11,
    display: "flex",
    fontVariantNumeric: "tabular-nums",
  },
  // A space's width from the numbers.
  period: {
    marginLeft: stylex.env.spacing(1),
  },
  // The timeframes, and on their right what the chart shows; the second
  // wraps below on a phone.
  controls: {
    gap: stylex.env.spacing(2),
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  // 24px below the value.
  history: {
    gap: stylex.env.spacing(4),
    display: "flex",
    flexDirection: "column",
    marginTop: stylex.env.spacing(6),
  },
  section: {
    gap: stylex.env.spacing(4),
    display: "flex",
    flexDirection: "column",
  },
  // Below the chart, 40px apart like the asset page's sections.
  spaced: {
    marginTop: stylex.env.spacing(10),
  },
  note: {
    margin: 0,
    color: colors.gray11,
  },
  // The cash by currency below the account's figures.
  account: {
    gap: stylex.env.spacing(6),
    display: "flex",
    flexDirection: "column",
  },
  group: {
    gap: stylex.env.spacing(3),
    display: "flex",
    flexDirection: "column",
  },
  articles: {
    margin: 0,
    padding: 0,
    gap: stylex.env.spacing(4),
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
  },
  article: {
    gap: stylex.env.spacing(1),
    display: "flex",
    flexDirection: "column",
  },
  articleTitle: {
    color: colors.gray12,
  },
  articleTicker: {
    color: colors.gray12,
    fontWeight: 550,
  },
});

/**
 * The holdings' figures in fixed widths, so they line up from row to row:
 * from lg up shares, from md up price, then value, today's move and the
 * total return, which every width keeps.
 */
const holdingColumns = stylex.create({
  columns: {
    gridTemplateColumns: {
      default: "96px 72px 72px",
      [breakpoints.md]: "96px 112px 72px 72px",
      [breakpoints.lg]: "64px 96px 112px 72px 72px",
    },
  },
});

/** A mover's price and today's move. */
const moverColumns = stylex.create({
  columns: {
    gridTemplateColumns: "80px 72px",
  },
});

// Figures

const bar = <span {...stylex.props(listStyles.bar)} />;

/** A held amount, up to four decimals for fractional shares. */
const shareCount = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
});

/** A day of the account's history, e.g. "Nov 7, 2025"; IBKR's dates are UTC. */
const dayDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const articleDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const { opacityTiming, transformTiming } = NumberFlowElement.defaultProps;

/**
 * Half NumberFlow's defaults (900ms / 450ms) on its own curves, so scrubbing
 * the chart keeps up.
 */
const valueTransform = { ...transformTiming, duration: 400 };
const valueOpacity = { ...opacityTiming, duration: 200 };

/** "▲ 1.23%": a move as a fraction, its sign as the triangle. */
const RatioChange = ({ ratio }: { ratio: number }) => (
  <>
    <Trend up={ratio >= 0} />
    {percent.format(Math.abs(ratio))}
  </>
);

// Total value and performance

/**
 * The account's total value, animated as it changes. `animated` off draws
 * plain text, for skeletons: skullet can't see into NumberFlow's shadow root.
 */
const ValueFigure = ({
  value,
  currency,
  signed = false,
  animated = true,
}: {
  value: number | undefined;
  currency: string | undefined;
  /** A gain or loss: "+" or "-" before it. */
  signed?: boolean;
  animated?: boolean;
}) => {
  let figure: ReactNode = "—";
  if (value !== undefined && !animated) {
    figure = signed
      ? formatSignedMoney(value, currency)
      : formatMoney(value, currency);
  } else if (value !== undefined) {
    figure = (
      <NumberFlow
        format={{
          ...moneyOptions(currency),
          signDisplay: signed ? "exceptZero" : "auto",
        }}
        locales="en-US"
        opacityTiming={valueOpacity}
        transformTiming={valueTransform}
        value={value}
      />
    );
  }
  return <span {...stylex.props(headings[36], styles.amount)}>{figure}</span>;
};

/** The hovered day's bar, else the latest. */
const barIndexOf = (
  performance: AccountPerformance,
  hovered: HoveredBar | null
) =>
  hovered
    ? performance.bars.findIndex((point) => point.t === hovered.time)
    : performance.bars.length - 1;

/**
 * What the chart shows: the account's value, or its profit and loss, which
 * leaves out deposits and withdrawals. P&L draws IBKR's time-weighted
 * return and names the money earned.
 */
const chartModes = [
  { id: "value", label: "Value", heading: "Total value" },
  { id: "pnl", label: "P&L", heading: "Profit and loss" },
] as const;

type ChartMode = (typeof chartModes)[number];

/**
 * The return from the period's start to the bar: IBKR's time-weighted
 * figure, so deposits and withdrawals don't count as gains.
 */
const returnAt = (performance: AccountPerformance, index: number) =>
  performance.returns[index];

/** "▲ 2.31% Past month", or to the hovered day. */
const PerformanceChange = ({
  accountId,
  period,
  hovered,
}: {
  accountId: string;
  period: PerformancePeriod;
  hovered: HoveredBar | null;
}) => {
  const { data: performance } = useSuspenseQuery(
    ibkrPerformanceQuery(accountId, period)
  );
  const ratio = returnAt(performance, barIndexOf(performance, hovered));
  return (
    <span {...stylex.props(text[12], styles.move)}>
      {ratio === undefined ? "—" : <RatioChange ratio={ratio} />}
      <span {...stylex.props(styles.period)}>
        {hovered ? dayDate.format(hovered.time) : period.changeLabel}
      </span>
    </span>
  );
};

/**
 * The money earned over the period, or by the hovered day: the amount's
 * place in P&L mode, from the same `pa/performance` as the chart.
 */
const EarnedFigure = ({
  accountId,
  currency,
  period,
  hovered,
}: {
  accountId: string;
  currency: string | undefined;
  period: PerformancePeriod;
  hovered: HoveredBar | null;
}) => {
  const { data: performance } = useSuspenseQuery(
    ibkrPerformanceQuery(accountId, period)
  );
  return (
    <ValueFigure
      signed
      value={performance.earned[barIndexOf(performance, hovered)]}
      currency={performance.currency ?? currency}
    />
  );
};

/** Profit and loss over the period, or to the hovered day, over its return. */
const AccountEarned = ({
  accountId,
  currency,
  period,
  hovered,
}: {
  accountId: string;
  currency: string | undefined;
  period: PerformancePeriod;
  hovered: HoveredBar | null;
}) => (
  <div {...stylex.props(styles.figures)}>
    <EarnedFigure
      accountId={accountId}
      currency={currency}
      period={period}
      hovered={hovered}
    />
    <PerformanceChange
      accountId={accountId}
      period={period}
      hovered={hovered}
    />
  </div>
);

/** Total value now, or on the hovered day, over its move. */
const AccountValue = ({
  accountId,
  currency,
  period,
  hovered,
}: {
  accountId: string;
  currency: string | undefined;
  period: PerformancePeriod;
  hovered: HoveredBar | null;
}) => {
  const { data: summary } = useSuspenseQuery(
    ibkrAccountSummaryQuery(accountId)
  );
  const total = summary.netliquidation;
  return (
    <div {...stylex.props(styles.figures)}>
      <ValueFigure
        value={hovered?.close ?? total?.amount ?? undefined}
        currency={total?.currency ?? currency}
      />
      <QueryBoundary label="Loading performance" skeleton={changeSkeleton}>
        <PerformanceChange
          accountId={accountId}
          period={period}
          hovered={hovered}
        />
      </QueryBoundary>
    </div>
  );
};

const accountValueSkeleton = (
  <div {...stylex.props(styles.figures)}>
    <ValueFigure value={10_000} currency="USD" animated={false} />
    {changeSkeleton}
  </div>
);

/**
 * The account's value at each day's close over the period, or in P&L mode
 * its return: growth since the start, so deposits leave no jump.
 */
const PerformanceChart = ({
  accountId,
  period,
  mode,
  onHoverChange,
}: {
  accountId: string;
  period: PerformancePeriod;
  mode: ChartMode;
  onHoverChange: (bar: HoveredBar | null) => void;
}) => {
  const { data: performance } = useSuspenseQuery(
    ibkrPerformanceQuery(accountId, period)
  );
  const ratio = returnAt(performance, performance.bars.length - 1) ?? 0;
  const pnl = mode.id === "pnl";
  // A dragged period's money earned and return, by the bars at its ends.
  const earnedBetween = (from: ChartBar, to: ChartBar) => {
    const start = performance.bars.findIndex((point) => point.t === from.t);
    const end = performance.bars.findIndex((point) => point.t === to.t);
    return (
      <ChangeFigures
        change={
          (performance.earned[end] ?? 0) - (performance.earned[start] ?? 0)
        }
        ratio={to.c / from.c - 1}
        formatChange={(change) =>
          formatSignedMoney(change, performance.currency)
        }
      />
    );
  };
  return (
    <PriceChart
      bars={
        pnl
          ? performance.bars.map((point, index) => ({
              t: point.t,
              c: 1 + (performance.returns[index] ?? 0),
            }))
          : performance.bars
      }
      formatSelection={pnl ? earnedBetween : undefined}
      label={period.label}
      trend={ratio < 0 ? "down" : "up"}
      formatDate={(date) => dayDate.format(date)}
      onHoverChange={onHoverChange}
    />
  );
};

// Holdings

/** A position as the holdings list shows it. */
interface Holding {
  conid: number;
  /** "CSG1", from IBKR's "CSG1 @AEB". */
  symbol: string;
  /** The listing's exchange when it isn't the primary US one, e.g. "AEB". */
  exchange: string | undefined;
  /** Only stocks and ETFs have asset pages. */
  linked: boolean;
  shares: number | undefined;
  price: number | undefined;
  value: number | undefined;
  currency: string | undefined;
  /** Today's gain or loss, in the position's currency. */
  todayReturn: number | undefined;
  /** As a fraction of the value at the prior close. */
  todayRatio: number | undefined;
  /** The unrealized gain or loss since it was bought. */
  totalReturn: number | undefined;
  /** As a fraction of what it cost. */
  totalRatio: number | undefined;
}

/** A gain as a fraction of where it started: the value before it. */
const ratioOf = (gain: number | undefined, value: number | undefined) => {
  if (gain === undefined || value === undefined) {
    return;
  }
  const start = Math.abs(value - gain);
  return start ? gain / start : undefined;
};

const holdingOf = (position: IbkrPosition): Holding => {
  // Live positions only describe the contract: "AVGO", or "CSG1 @AEB" for
  // a listing outside the US.
  const [symbol, exchange] = (
    position.ticker ??
    position.contractDesc ??
    ""
  ).split(" @");
  const value = position.mktValue ?? undefined;
  const todayReturn = position.dailyPnl ?? undefined;
  const totalReturn = position.unrealizedPnl ?? undefined;
  return {
    conid: position.conid,
    symbol: symbol?.trim() || String(position.conid),
    exchange: position.listingExchange ?? exchange?.trim(),
    linked:
      position.assetClass === undefined ||
      position.assetClass === null ||
      position.assetClass === "STK",
    shares: position.position,
    price: position.mktPrice ?? undefined,
    value,
    currency: position.currency ?? undefined,
    todayReturn,
    todayRatio: ratioOf(todayReturn, value),
    totalReturn,
    totalRatio: ratioOf(totalReturn, value),
  };
};

/** Open positions, biggest first, as IBKR Mobile orders them. */
const holdingsOf = (positions: readonly IbkrPosition[]) =>
  positions
    .filter((position) => position.position !== 0)
    .map(holdingOf)
    .toSorted((a, b) => Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0));

const HoldingsHeader = () => (
  <li
    aria-hidden="true"
    {...stylex.props(text[12], listStyles.row, listStyles.header)}
  >
    <span>Name</span>
    <span {...stylex.props(listStyles.quote, holdingColumns.columns)}>
      <span {...stylex.props(listStyles.fromLg)}>Shares</span>
      <span {...stylex.props(listStyles.fromMd)}>Price</span>
      <span>Value</span>
      <span>Today</span>
      <span>Total</span>
    </span>
  </li>
);

const money = (amount: number | undefined, currency: string | undefined) =>
  amount === undefined ? "—" : formatMoney(amount, currency);

/** "▲ 1.23%", with the amount on hover, e.g. "+12.40 USD". */
const GainCell = ({
  ratio,
  amount,
  currency,
}: {
  ratio: number | undefined;
  amount: number | undefined;
  currency: string | undefined;
}) => (
  <span
    title={
      amount === undefined
        ? undefined
        : `${signedNumber.format(amount)} ${currency ?? ""}`.trim()
    }
    {...stylex.props(listStyles.change)}
  >
    {ratio === undefined ? "—" : <RatioChange ratio={ratio} />}
  </span>
);

/** Logo, ticker and name, then the holding's figures. */
const HoldingCells = ({
  holding,
  name,
}: {
  holding: Holding;
  /** The company's name, a bar while it loads. */
  name: ReactNode;
}) => (
  <>
    <span {...stylex.props(text[14], listStyles.company)}>
      {holding.linked ? (
        <TickerLogo
          key={holding.conid}
          conid={holding.conid}
          symbol={holding.symbol}
          size={32}
        />
      ) : (
        <TickerLogoPlaceholder size={32} />
      )}
      <span {...stylex.props(listStyles.ticker)}>{holding.symbol}</span>
      <span {...stylex.props(listStyles.truncated)}>{name}</span>
    </span>
    <span {...stylex.props(text[14], listStyles.quote, holdingColumns.columns)}>
      <span {...stylex.props(listStyles.figure, listStyles.fromLg)}>
        {holding.shares === undefined ? "—" : shareCount.format(holding.shares)}
      </span>
      <span {...stylex.props(listStyles.figure, listStyles.fromMd)}>
        {money(holding.price, holding.currency)}
      </span>
      <span {...stylex.props(listStyles.figure)}>
        {money(holding.value, holding.currency)}
      </span>
      <GainCell
        ratio={holding.todayRatio}
        amount={holding.todayReturn}
        currency={holding.currency}
      />
      <GainCell
        ratio={holding.totalRatio}
        amount={holding.totalReturn}
        currency={holding.currency}
      />
    </span>
  </>
);

/** A holding linking to its asset page, when it has one. */
const HoldingRow = ({
  holding,
  contract,
  naming,
}: {
  holding: Holding;
  /** Its name and asset page, from `trsrv/secdef`. */
  contract: ScanRow | undefined;
  /** Whether the names are still loading. */
  naming: boolean;
}) => {
  const cells = (
    <HoldingCells
      holding={holding}
      name={naming ? bar : (contract?.name ?? "")}
    />
  );
  return (
    <li>
      {holding.linked ? (
        <Link
          to="/dashboard/assets/$symbol"
          params={{
            symbol:
              contract?.slug ?? listingSlug(holding.symbol, holding.exchange),
          }}
          {...stylex.props(listStyles.row, listStyles.link)}
        >
          {cells}
        </Link>
      ) : (
        <div {...stylex.props(listStyles.row)}>{cells}</div>
      )}
    </li>
  );
};

/**
 * The account's positions with today's and the total gain, both from
 * IBKR's positions: no market data, so no brokerage session. Names come
 * from one `trsrv/secdef` call, filled in when it answers.
 */
const Holdings = ({ accountId }: { accountId: string }) => {
  const { data: holdings } = useSuspenseQuery({
    ...ibkrPositionsQuery(accountId),
    select: holdingsOf,
  });
  const contracts = useQuery({
    ...exploreContractsQuery(holdings.map((holding) => holding.conid)),
    enabled: holdings.length > 0,
    select: (rows) => new Map(rows.map((row) => [row.conid, row])),
  });
  if (holdings.length === 0) {
    return (
      <p {...stylex.props(text[14], styles.note)}>
        This account holds nothing yet.
      </p>
    );
  }
  return (
    <ul {...stylex.props(listStyles.list)}>
      <HoldingsHeader />
      {holdings.map((holding) => (
        <HoldingRow
          key={holding.conid}
          holding={holding}
          contract={contracts.data?.get(holding.conid)}
          naming={contracts.isPending}
        />
      ))}
    </ul>
  );
};

const sampleHolding: Holding = {
  conid: 0,
  symbol: "AAPL",
  exchange: undefined,
  linked: false,
  shares: 10,
  price: 100,
  value: 10_000,
  currency: "USD",
  todayReturn: 100,
  todayRatio: 0.01,
  totalReturn: 1000,
  totalRatio: 0.1,
};

/** The header and five rows from sample data. */
const holdingsSkeleton = (
  <ul {...stylex.props(listStyles.list)}>
    <HoldingsHeader />
    {[1, 2, 3, 4, 5].map((id) => (
      <li key={id} {...stylex.props(listStyles.row)}>
        <HoldingCells holding={sampleHolding} name="Sample Company Inc." />
      </li>
    ))}
  </ul>
);

// Account

/** Cash in each currency the account holds, from the ledger. */
const CashByCurrency = ({ accountId }: { accountId: string }) => {
  const { data: ledger } = useSuspenseQuery(ibkrLedgerQuery(accountId));
  const entries = Object.entries(ledger).filter(
    ([currency, entry]) => currency !== "BASE" && entry.cashbalance
  );
  if (entries.length === 0) {
    return null;
  }
  return (
    <section aria-label="Cash by currency" {...stylex.props(styles.group)}>
      <h3 {...stylex.props(text[12], styles.note)}>Cash by currency</h3>
      <FactGrid
        facts={entries.map(([currency, entry]) => ({
          label: currency,
          icon: <CurrencyFlag currency={currency} />,
          value: formatMoney(entry.cashbalance ?? 0, currency),
        }))}
      />
    </section>
  );
};

/** What the header's balance shows on click, laid out on the page. */
const accountFigures = [
  { key: "totalcashvalue", label: "Cash" },
  { key: "grosspositionvalue", label: "Stocks" },
  { key: "buyingpower", label: "Buying power" },
  { key: "availablefunds", label: "Available funds" },
  { key: "excessliquidity", label: "Excess liquidity" },
] as const;

const AccountFigures = ({
  accountId,
  currency,
}: {
  accountId: string;
  currency: string | undefined;
}) => {
  const { data: summary } = useSuspenseQuery(
    ibkrAccountSummaryQuery(accountId)
  );
  return (
    <div {...stylex.props(styles.account)}>
      <FactGrid
        facts={accountFigures.map(({ key, label }) => ({
          label,
          value: summaryAmount(summary, key, currency) ?? "—",
        }))}
      />
      <QueryBoundary label="Loading cash by currency">
        <CashByCurrency accountId={accountId} />
      </QueryBoundary>
    </div>
  );
};

const accountSkeleton = (
  <FactGrid
    facts={accountFigures.map(({ label }) => ({
      label,
      value: "$00,000.00",
    }))}
  />
);

// Market movers

const moverScans = exploreScans.filter(
  (scan) =>
    scan.id === "gainers" || scan.id === "losers" || scan.id === "most-active"
);

type MoverScan = (typeof moverScans)[number];

/** How often the movers' quotes refresh while the page is open, as Explore's. */
const quotesPollInterval = 5000;

/** How many of a scan's 50 the rail shows. */
const moverCount = 5;

const MoverCells = ({
  row,
  quote,
  loading = false,
}: {
  row: ScanRow;
  quote: ExploreQuote | undefined;
  loading?: boolean;
}) => (
  <>
    <span {...stylex.props(text[14], listStyles.company)}>
      <TickerLogo
        key={row.conid}
        conid={row.conid}
        symbol={row.symbol}
        size={32}
      />
      <span {...stylex.props(listStyles.ticker)}>{row.symbol}</span>
      <span {...stylex.props(listStyles.truncated)}>{row.name}</span>
    </span>
    <span {...stylex.props(text[14], listStyles.quote, moverColumns.columns)}>
      <span {...stylex.props(listStyles.figure)}>
        {loading ? bar : money(quote?.last, scanCurrency)}
      </span>
      <span {...stylex.props(listStyles.change)}>
        {loading && bar}
        {!loading && quote?.changeRatio === undefined && "—"}
        {!loading && quote?.changeRatio !== undefined && (
          <RatioChange ratio={quote.changeRatio} />
        )}
      </span>
    </span>
  </>
);

/** The scan's top rows, each linking to its asset page, with quotes. */
const MoverRows = ({ scan }: { scan: MoverScan }) => {
  const { data: rows } = useSuspenseQuery({
    ...exploreScanQuery(scan),
    select: (scanRows) => scanRows.slice(0, moverCount),
  });
  const quotes = useQuery({
    ...exploreQuotesQuery(rows.map((row) => row.conid)),
    enabled: rows.length > 0,
    refetchInterval: quotesPollInterval,
  });
  if (rows.length === 0) {
    return (
      <p {...stylex.props(text[14], styles.note)}>
        IBKR found nothing for this list right now.
      </p>
    );
  }
  return (
    <ul {...stylex.props(listStyles.list)}>
      {rows.map((row) => (
        <li key={row.conid}>
          <Link
            to="/dashboard/assets/$symbol"
            params={{ symbol: row.slug }}
            {...stylex.props(listStyles.row, listStyles.link)}
          >
            <MoverCells
              row={row}
              quote={quotes.data?.get(row.conid)}
              loading={quotes.isPending && !quotes.isError}
            />
          </Link>
        </li>
      ))}
    </ul>
  );
};

const moversSkeleton = (
  <ul {...stylex.props(listStyles.list)}>
    {[1, 2, 3, 4, 5].map((id) => (
      <li key={id} {...stylex.props(listStyles.row)}>
        <span {...stylex.props(text[14], listStyles.company)}>
          <TickerLogoPlaceholder size={32} />
          <span {...stylex.props(listStyles.ticker)}>SMPL</span>
          <span {...stylex.props(listStyles.truncated)}>Sample Company</span>
        </span>
        <span
          {...stylex.props(text[14], listStyles.quote, moverColumns.columns)}
        >
          <span>$100.00</span>
          <span>0.00%</span>
        </span>
      </li>
    ))}
  </ul>
);

/** Today's biggest movers on US exchanges, from IBKR's market scanner. */
const MarketMovers = () => {
  const brokerage = useBrokerageAccess();
  // The first tab.
  const [scanId, setScanId] = useState<MoverScan["id"]>("most-active");
  const scan = moverScans.find((option) => option.id === scanId);
  return (
    <>
      <RangePicker
        fit
        label="Market list"
        options={moverScans}
        value={scanId}
        onValueChange={setScanId}
      />
      {brokerage.expected && scan ? (
        <QueryBoundary
          // A fresh skeleton per list, as the chart's timeframes.
          key={scan.id}
          label="Loading market movers"
          skeleton={moversSkeleton}
        >
          <MoverRows scan={scan} />
        </QueryBoundary>
      ) : (
        <p {...stylex.props(text[14], styles.note)}>
          IBKR&rsquo;s trading session is in use on another platform. Nora
          reconnects when you come back to it.
        </p>
      )}
    </>
  );
};

// News

/**
 * The latest headlines on the account's holdings, each tagged with its
 * ticker when IBKR says which contract it's about.
 */
const PortfolioNews = ({ accountId }: { accountId: string }) => {
  const { data: news } = useSuspenseQuery(portfolioNewsQuery(accountId));
  // Already loaded for the holdings. Only an article whose main contract is
  // one of them gets its ticker: IBKR's `main_conid` is often another
  // listing, or a contract the headline isn't obviously about.
  const { data: tickers } = useQuery({
    ...ibkrPositionsQuery(accountId),
    select: (positions) =>
      new Map(
        holdingsOf(positions).map((holding) => [holding.conid, holding.symbol])
      ),
  });
  return news.length > 0 ? (
    <ul {...stylex.props(styles.articles)}>
      {news.slice(0, 8).map((article) => {
        const ticker = article.conids
          .map((conid) => tickers?.get(conid))
          .find(Boolean);
        const meta = [
          article.source,
          article.time instanceof Date
            ? articleDate.format(article.time)
            : article.time,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <li key={article.id} {...stylex.props(styles.article)}>
            <span {...stylex.props(text[14], styles.articleTitle)}>
              {article.title}
            </span>
            <span {...stylex.props(text[12], styles.note)}>
              {ticker ? (
                <span {...stylex.props(styles.articleTicker)}>
                  {ticker}
                  {meta ? " · " : ""}
                </span>
              ) : null}
              {meta}
            </span>
          </li>
        );
      })}
    </ul>
  ) : (
    <p {...stylex.props(text[14], styles.note)}>
      IBKR has no news on your holdings right now.
    </p>
  );
};

const newsSkeleton = (
  <ul {...stylex.props(styles.articles)}>
    {[1, 2, 3, 4, 5].map((id) => (
      <li key={id} {...stylex.props(styles.article)}>
        <span {...stylex.props(text[14], styles.articleTitle)}>
          A sample headline about one of your holdings that runs on
        </span>
        <span {...stylex.props(text[12], styles.note)}>
          AAPL · Source · Jan 1, 12:00 PM
        </span>
      </li>
    ))}
  </ul>
);

// Page

/** A titled block: below the chart, 40px down; in the rail, as it stacks. */
const Section = ({
  title,
  spaced = false,
  children,
}: {
  title: string;
  spaced?: boolean;
  children: ReactNode;
}) => (
  <section
    aria-label={title}
    {...stylex.props(styles.section, spaced && styles.spaced)}
  >
    <h2 {...stylex.props(headings[16])}>{title}</h2>
    {children}
  </section>
);

/**
 * The account: its total value and performance chart, holdings and balances
 * on the left; the market's movers and news on the holdings on the right.
 * Each part loads and fails on its own.
 */
const AccountOverview = ({
  accountId,
  currency,
}: {
  accountId: string;
  currency: string | undefined;
}) => {
  // Shared by the chart, which reports it, and the value, which shows it.
  const [hovered, setHovered] = useState<HoveredBar | null>(null);
  const [period, setPeriod] = useState(defaultPerformancePeriod);
  const [mode, setMode] = useState<ChartMode>(chartModes[0]);
  const figureProps = { accountId, currency, period, hovered };
  return (
    <div {...stylex.props(styles.columns)}>
      <div {...stylex.props(styles.main)}>
        <section aria-label={mode.heading} {...stylex.props(styles.value)}>
          <span {...stylex.props(text[14], styles.label)}>{mode.heading}</span>
          <QueryBoundary
            label={`Loading ${mode.heading.toLowerCase()}`}
            skeleton={accountValueSkeleton}
          >
            {mode.id === "pnl" ? (
              <AccountEarned {...figureProps} />
            ) : (
              <AccountValue {...figureProps} />
            )}
          </QueryBoundary>
        </section>
        <section aria-label="Performance" {...stylex.props(styles.history)}>
          {/* The line loader is swapped for the chart without a transition. */}
          <InstantReveal>
            <QueryBoundary
              // A fresh boundary per period, as the asset page's timeframes.
              key={period.id}
              label="Loading performance"
              skeleton={<PriceChart bars={[]} label={period.label} />}
            >
              <PerformanceChart
                accountId={accountId}
                period={period}
                mode={mode}
                onHoverChange={setHovered}
              />
            </QueryBoundary>
          </InstantReveal>
          <div {...stylex.props(styles.controls)}>
            <RangePicker
              label="Timeframe"
              options={performancePeriods}
              value={period.id}
              onValueChange={(id) => {
                const next = performancePeriods.find(
                  (option) => option.id === id
                );
                if (next) {
                  // The old chart unmounts with its hover.
                  setHovered(null);
                  setPeriod(next);
                }
              }}
            />
            <RangePicker
              fit
              label="Chart"
              options={chartModes}
              value={mode.id}
              onValueChange={(id) => {
                const next = chartModes.find((option) => option.id === id);
                if (next) {
                  setMode(next);
                }
              }}
            />
          </div>
        </section>
        <Section spaced title="Holdings">
          <QueryBoundary label="Loading holdings" skeleton={holdingsSkeleton}>
            <Holdings accountId={accountId} />
          </QueryBoundary>
        </Section>
        <Section spaced title="Account">
          <QueryBoundary label="Loading account" skeleton={accountSkeleton}>
            <AccountFigures accountId={accountId} currency={currency} />
          </QueryBoundary>
        </Section>
      </div>
      <aside {...stylex.props(styles.aside)}>
        <Section title="Market movers">
          <MarketMovers />
        </Section>
        <Section title="News on your holdings">
          <QueryBoundary label="Loading news" skeleton={newsSkeleton}>
            <PortfolioNews accountId={accountId} />
          </QueryBoundary>
        </Section>
      </aside>
    </div>
  );
};

/** The page from sample data, while the account list loads. */
const OverviewSkeleton = () => (
  <div {...stylex.props(styles.columns)}>
    <div {...stylex.props(styles.main)}>
      <section {...stylex.props(styles.value)}>
        <span {...stylex.props(text[14], styles.label)}>Total value</span>
        {accountValueSkeleton}
      </section>
      <section {...stylex.props(styles.history)}>
        {/* Named directly: skullet only swaps a component for its
            `Skeleton` where it can see it, not inside another component. */}
        <PriceChart.Skeleton />
        <div {...stylex.props(styles.controls)}>
          <RangePicker
            label="Timeframe"
            options={performancePeriods}
            value={defaultPerformancePeriod.id}
          />
          <RangePicker
            fit
            label="Chart"
            options={chartModes}
            value={chartModes[0].id}
          />
        </div>
      </section>
      <Section spaced title="Holdings">
        {holdingsSkeleton}
      </Section>
      <Section spaced title="Account">
        {accountSkeleton}
      </Section>
    </div>
    <aside {...stylex.props(styles.aside)}>
      <Section title="Market movers">{moversSkeleton}</Section>
      <Section title="News on your holdings">{newsSkeleton}</Section>
    </aside>
  </div>
);

/** The first account, as the header's balance; IBKR Mobile shows the selected one. */
const Overview = () => {
  const { data: accounts } = useSuspenseQuery(ibkrAccountsQuery);
  const [account] = accounts;
  return account ? (
    <AccountOverview
      accountId={account.accountId}
      currency={account.currency ?? undefined}
    />
  ) : (
    <p {...stylex.props(text[14], styles.note)}>
      IBKR has no accounts for this login.
    </p>
  );
};

const OverviewPage = () => (
  <main {...stylex.props(styles.page)}>
    <QueryBoundary skeleton={<OverviewSkeleton />}>
      <Overview />
    </QueryBoundary>
  </main>
);

export const Route = createFileRoute("/_app/dashboard/")({
  head: () => ({ meta: [{ title: "Overview – Nora" }] }),
  // The dashboard layout has already checked the session and started the
  // account list and summary.
  loader: ({ context }) => {
    // Not awaited, so navigation is immediate; each section's skeleton
    // shows while it loads. `prefetchQuery` doesn't throw: failures are
    // left for the sections' own boundaries to show with their retry.
    const prefetch = async () => {
      const { queryClient } = context;
      await queryClient.prefetchQuery(ibkrAccountsQuery);
      const [account] =
        queryClient.getQueryData(ibkrAccountsQuery.queryKey) ?? [];
      if (!account) {
        return;
      }
      const { accountId } = account;
      await Promise.all([
        queryClient.prefetchQuery(ibkrPositionsQuery(accountId)),
        queryClient.prefetchQuery(
          ibkrPerformanceQuery(accountId, defaultPerformancePeriod)
        ),
        queryClient.prefetchQuery(ibkrLedgerQuery(accountId)),
        queryClient.prefetchQuery(portfolioNewsQuery(accountId)),
      ]);
    };
    void prefetch();
  },
  component: OverviewPage,
});
