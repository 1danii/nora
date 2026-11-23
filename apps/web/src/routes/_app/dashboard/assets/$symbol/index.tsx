import { Button } from "@base-ui/react/button";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import NumberFlow, { NumberFlowElement } from "@number-flow/react";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import * as stylex from "@stylexjs/stylex";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import type { Schema } from "effect";
import { MotionConfig, motion } from "motion/react";
import type { ReactNode, Ref } from "react";
import { useState } from "react";

import { ListingExchange } from "@/components/listing-exchange";
import { changeSkeleton, PriceChange, Trend } from "@/components/price-change";
import type { HoveredBar } from "@/components/price-chart";
import { PriceChart } from "@/components/price-chart";
import { PriceTargetChart } from "@/components/price-target-chart";
import { QueryBoundary } from "@/components/query-boundary";
import { TickerLogo, TickerLogoPlaceholder } from "@/components/ticker-logo";
import { InstantReveal } from "@/components/ui/skeleton";
import {
  compactNumber,
  decimalNumber,
  formatCompactMoney,
  formatMoney,
  moneyOptions,
  percent,
} from "@/lib/format";
import type {
  AssetHistory as AssetBars,
  AssetStat,
  HistoryRange,
  RatingLevel,
  SessionPhase,
  TradingSession,
} from "@/lib/ibkr-asset-queries";
import {
  assetContractQuery,
  assetHistoryQuery,
  assetOvernightQuoteQuery,
  assetNewsQuery,
  assetPriceQuery,
  assetProfileQuery,
  assetRatingsQuery,
  assetStatFields,
  assetStatsQuery,
  companyInfoOf,
  defaultHistoryRange,
  historyRanges,
  parseAssetSlug,
  quoteOf,
  quotePollInterval,
  sessionPhase,
  targetHistoryRange,
  tradesOvernight,
} from "@/lib/ibkr-asset-queries";
import { useInUsOvernightSession, useLiveQuote } from "@/lib/ibkr-live-quote";
import { headings, text } from "@/styles/text";
import { breakpoints, colors, radius } from "@/styles/tokens.stylex";

/** Four targets: each a 16px label, 4px gap and 20px value, 16px apart. */
const targetListMinHeight = 4 * (16 + 4 + 20) + 3 * 16;

/** The price targets' chart: the list's height, less its 0.5px border. */
const targetChartMinHeight = targetListMinHeight - 0.5;

const styles = stylex.create({
  // Room below the last section too, so the page doesn't end on it.
  page: {
    paddingBottom: stylex.env.spacing(24),
    paddingTop: stylex.env.spacing(8),
  },
  // Both the skeleton and the content: the boundary wraps them in a div.
  details: {
    display: "flex",
    flexDirection: "column",
  },
  // Below the divider: the price and chart, and articles on the right.
  // Twelve columns from lg up: the main column across eight, articles in
  // four. Stacked below the large breakpoint.
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
  identity: {
    gap: stylex.env.spacing(4),
    alignItems: "center",
    display: "flex",
  },
  title: {
    gap: stylex.env.spacing(2),
    alignItems: "start",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  // Trimmed to the cap height and baseline, so spacing is measured from the
  // visible letters rather than the line box.
  ticker: {
    textBox: "trim-both cap alphabetic",
    color: colors.gray12,
  },
  name: {
    textBox: "trim-both cap alphabetic",
    color: colors.gray11,
  },
  // Same colour and weight as the input outline.
  divider: {
    marginInline: 0,
    borderTopColor: colors.whiteA2,
    borderTopStyle: "solid",
    borderTopWidth: "0.5px",
    height: 0,
    marginBottom: stylex.env.spacing(10),
    marginTop: stylex.env.spacing(6),
  },
  // 24px below the price.
  history: {
    gap: stylex.env.spacing(4),
    display: "flex",
    flexDirection: "column",
    marginTop: stylex.env.spacing(6),
  },

  // Isolated as a whole, so the sliding pill stays under every label, not
  // just its own. The first pill starts at the container's edge.
  ranges: {
    display: "flex",
    isolation: "isolate",
  },
  // A small outline button's height, 48px wide; only the selected one has a
  // pill behind.
  range: {
    borderRadius: radius.full,
    borderStyle: "none",
    paddingBlock: 0,
    paddingInline: 0,
    alignItems: "center",
    appearance: "none",
    backgroundColor: "transparent",
    color: {
      "[data-pressed]": colors.gray12,
      default: colors.gray11,
      ":hover": colors.gray12,
    },
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: "inherit",
    // As the buttons.
    fontWeight: 550,
    // Equal widths, so the pill keeps one size as it slides.
    justifyContent: "center",
    position: "relative",
    transitionDuration: {
      default: "100ms",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionProperty: "color",
    transitionTimingFunction: "ease",
    height: stylex.env.spacing(7),
    width: stylex.env.spacing(12),
  },
  // The outline button's background, sliding to the selected timeframe.
  rangePill: {
    inset: 0,
    borderRadius: radius.full,
    backgroundColor: colors.gray2,
    position: "absolute",
    zIndex: -1,
  },
  // The price on the left, the listing's exchange on the right.
  quoteRow: {
    gap: stylex.env.spacing(4),
    alignItems: "flex-start",
    display: "flex",
    justifyContent: "space-between",
  },
  // 10px from the price's line box to the change below it.
  quote: {
    gap: stylex.env.spacing(2.5),
    display: "flex",
    flexDirection: "column",
  },
  // The day's move over the after-hours move.
  changes: {
    gap: stylex.env.spacing(1),
    display: "flex",
    flexDirection: "column",
  },
  // Room for the day's move and the after-hours move, whichever show.
  changeSlot: {
    display: "grid",
  },
  // Overlaid in the slot's one cell.
  stacked: {
    gridColumnStart: "1",
    gridRowStart: "1",
  },
  // Holds space without showing it.
  reserved: {
    visibility: "hidden",
  },
  // One heading line tall (1lh), however tall what's inside is: NumberFlow
  // pads its digits for the roll and would otherwise push the layout. It's
  // centred in the line and spills over it.
  price: {
    alignItems: "center",
    color: colors.gray12,
    display: "flex",
    // Equal-width digits, so the price doesn't shift as it changes.
    fontVariantNumeric: "tabular-nums",
    height: "1lh",
  },
  // Below the chart: statistics, description and company details.
  section: {
    gap: stylex.env.spacing(4),
    display: "flex",
    flexDirection: "column",
    marginTop: stylex.env.spacing(10),
  },
  facts: {
    margin: 0,
    gap: stylex.env.spacing(4),
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
  },
  fact: {
    gap: stylex.env.spacing(1),
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  factLabel: {
    color: colors.gray11,
  },
  factValue: {
    margin: 0,
    color: colors.gray12,
    fontVariantNumeric: "tabular-nums",
  },
  note: {
    color: colors.gray11,
  },
  aside: {
    gap: stylex.env.spacing(4),
    gridColumn: {
      default: null,
      [breakpoints.lg]: "span 4",
    },
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
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
  // Four columns from md up: the targets in the first, their chart across
  // the other three.
  priceTargets: {
    gap: stylex.env.spacing(4),
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      [breakpoints.md]: "repeat(4, minmax(0, 1fr))",
    },
  },
  // At least four targets' height (IBKR usually sends high, average,
  // median and low), so fewer, or the skeleton, don't move the page.
  // Its own height, not the row's: the chart beside it takes its height from
  // this list, so stretching to the row would grow both without end.
  targets: {
    margin: 0,
    gap: stylex.env.spacing(4),
    alignSelf: "start",
    display: "flex",
    flexDirection: "column",
    minHeight: targetListMinHeight,
  },
  targetLabel: {
    gap: stylex.env.spacing(1.5),
    alignItems: "center",
    color: colors.gray11,
    display: "flex",
  },
  targetValue: {
    alignItems: "center",
    display: "flex",
  },
  targetSwatch: {
    borderRadius: radius.full,
    flexShrink: 0,
    height: stylex.env.spacing(2),
    width: stylex.env.spacing(2),
  },
  // Down at the row's bottom, its baseline level with the end of the
  // first column.
  targetChart: {
    gridColumn: {
      default: null,
      [breakpoints.md]: "span 3",
    },
    alignSelf: "end",
  },
  // The verdict's circle, then a row per level: label and share, and a bar.
  consensus: {
    gap: {
      default: stylex.env.spacing(6),
      [breakpoints.md]: stylex.env.spacing(10),
    },
    alignItems: "center",
    display: "flex",
  },
  verdict: {
    borderRadius: radius.full,
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    justifyContent: "center",
    height: {
      default: stylex.env.spacing(24),
      [breakpoints.md]: stylex.env.spacing(32),
    },
    width: {
      default: stylex.env.spacing(24),
      [breakpoints.md]: stylex.env.spacing(32),
    },
  },
  // Labels right-aligned in one column, so the bars all start together.
  consensusRows: {
    margin: 0,
    alignItems: "center",
    columnGap: stylex.env.spacing(3),
    display: "grid",
    flexGrow: 1,
    gridTemplateColumns: "auto minmax(0, 1fr)",
    rowGap: stylex.env.spacing(3),
    minWidth: 0,
  },
  consensusRow: {
    display: "contents",
  },
  consensusLabel: {
    color: colors.gray11,
    fontVariantNumeric: "tabular-nums",
    textAlign: "end",
    whiteSpace: "nowrap",
  },
  consensusTrack: {
    margin: 0,
    borderRadius: radius.full,
    overflow: "hidden",
    // The outline button's background.
    backgroundColor: colors.gray2,
    height: stylex.env.spacing(2),
  },
  consensusFill: (share: number) => ({
    borderRadius: radius.full,
    height: "100%",
    width: `${share * 100}%`,
  }),
  articleTitle: {
    color: colors.gray12,
  },
  raw: {
    color: colors.gray11,
    cursor: "pointer",
  },
  rawJson: {
    overflow: "auto",
    whiteSpace: "pre",
    maxHeight: 320,
  },
  about: {
    margin: 0,
    color: colors.gray11,
    lineHeight: 1.75,
  },
  aboutClamped: {
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
    display: "-webkit-box",
  },
  aboutToggle: {
    padding: 0,
    borderWidth: 0,
    gap: stylex.env.spacing(1),
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "transparent",
    color: colors.gray12,
    cursor: "pointer",
    display: "inline-flex",
    fontWeight: 550,
    lineHeight: 1.75,
  },
  aboutBody: {
    gap: stylex.env.spacing(2),
    display: "flex",
    flexDirection: "column",
  },
  // Clips the text to the animated height; set in the description's type
  // so its closed height, 3.5em, is two lines at the 1.75 line height.
  aboutFrame: {
    overflow: "hidden",
  },
  // Turning between down and up is the trend triangle's flip: a quick
  // vertical mirror with a slight overshoot.
  aboutChevron: {
    flexShrink: 0,
    transitionDuration: {
      default: "150ms",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionProperty: "scale, translate",
    transitionTimingFunction: "cubic-bezier(0.175, 0.885, 0.32, 1.1)",
    height: stylex.env.spacing(4),
    width: stylex.env.spacing(4),
  },
  // Radix's chevron spans y 6–10.75 of a 15 tall box, its middle 0.875
  // below the box's; mirrored it lands that far above, so 1.75 of 15
  // (1.87px at 16px) down puts it back where the down one sits.
  aboutChevronUp: {
    scale: "1 -1",
    translate: "0 1.87px",
  },
});

/** Logo, ticker (e.g. "NVDA") and, below it, the company's full name. */
const AssetIdentity = ({
  logo,
  name,
  symbol,
}: {
  logo: ReactNode;
  name: string;
  symbol: string;
}) => (
  <header {...stylex.props(styles.identity)}>
    {logo}
    <div {...stylex.props(styles.title)}>
      <h1 {...stylex.props(headings[20], styles.ticker)}>{symbol}</h1>
      <span {...stylex.props(text[14], styles.name)}>{name}</span>
    </div>
  </header>
);

const { opacityTiming, transformTiming } = NumberFlowElement.defaultProps;

/**
 * Half NumberFlow's defaults (900ms / 450ms) on its own curves, so scrubbing
 * the chart keeps up.
 */
const priceTransform = { ...transformTiming, duration: 400 };
const priceOpacity = { ...opacityTiming, duration: 200 };

/**
 * The price, in the asset's currency, and its move over the selected
 * timeframe. The price animates as it changes.
 *
 * `animated` off draws plain text: skullet reads the skeleton's text to draw
 * its bones, and NumberFlow's digits sit in a shadow root it can't see.
 */
const AssetQuote = ({
  price,
  currency,
  change,
  animated = true,
}: {
  price: number | undefined;
  currency: string | undefined;
  change: ReactNode;
  animated?: boolean;
}) => {
  let priceText: ReactNode = "—";
  if (price !== undefined) {
    priceText = animated ? (
      <NumberFlow
        format={moneyOptions(currency)}
        locales="en-US"
        opacityTiming={priceOpacity}
        transformTiming={priceTransform}
        value={price}
      />
    ) : (
      formatMoney(price, currency)
    );
  }
  return (
    <section aria-label="Price" {...stylex.props(styles.quote)}>
      <span {...stylex.props(headings[36], styles.price)}>{priceText}</span>
      {/* Always two lines tall, so a timeframe or hover with only one line
          doesn't shift the layout below. */}
      <span {...stylex.props(styles.changeSlot)}>
        <span
          aria-hidden="true"
          {...stylex.props(styles.changes, styles.stacked, styles.reserved)}
        >
          {changeSkeleton}
          {changeSkeleton}
        </span>
        <span {...stylex.props(styles.stacked)}>{change}</span>
      </span>
    </section>
  );
};

/** How the price change names each part of a trading day. */
const phaseLabels: Record<SessionPhase, string> = {
  pre: "Pre-market",
  regular: "Today",
  after: "After hours",
};

/** The last regular-hours bar's close: the session's closing price. */
const regularClose = (
  bars: readonly { t: number; c: number }[],
  session: TradingSession
) => bars.findLast((bar) => bar.t >= session.open && bar.t < session.close)?.c;

/** Where the timeframe's move is measured from; see `RangeChange`. */
const rangeBase = (
  history: AssetBars,
  range: HistoryRange,
  priorClose: number | undefined
) => {
  const [first] = history.data;
  return "session" in range ? (priorClose ?? first?.o) : first?.c;
};

/**
 * The move the change line leads with, at `price` and `time`: within a
 * session after the close, the day's move up to the closing price.
 */
const leadingMove = (
  history: AssetBars,
  range: HistoryRange,
  priorClose: number | undefined,
  price: number | undefined,
  time: number | undefined
) => {
  const base = rangeBase(history, range, priorClose);
  const current = price ?? history.data.at(-1)?.c;
  if (!base || current === undefined) {
    return;
  }
  const { session } = history;
  const closing = session && regularClose(history.data, session);
  return session &&
    time !== undefined &&
    sessionPhase(session, time) === "after" &&
    closing !== undefined
    ? closing - base
    : current - base;
};

/**
 * The move from the start of the timeframe to `price`: the prior close for a
 * single session, as other stock apps do, otherwise the first bar's close.
 *
 * Within a session, `time` (the hovered bar's, else the latest) picks the
 * part of the day: before the open the move is "Pre-market", and after the
 * close the day's move stops at the closing price, with the move since on
 * a second line, "After hours". Hovering an after-hours bar shows only that
 * second line.
 */
const RangeChange = ({
  conid,
  range,
  price,
  hoveredTime,
  priorClose,
}: {
  conid: number;
  range: HistoryRange;
  price: number | undefined;
  hoveredTime: number | undefined;
  priorClose: number | undefined;
}) => {
  const { data: history } = useSuspenseQuery(assetHistoryQuery(conid, range));
  const latest = history.data.at(-1);
  const base = rangeBase(history, range, priorClose);
  const current = price ?? latest?.c;
  if (!base || current === undefined) {
    return null;
  }
  const { session } = history;
  const time = hoveredTime ?? latest?.t;
  const phase =
    session && time !== undefined ? sessionPhase(session, time) : "regular";
  const closing = session && regularClose(history.data, session);
  const afterHours = closing !== undefined && (
    <PriceChange
      change={current - closing}
      ratio={(current - closing) / closing}
      period={phaseLabels.after}
    />
  );
  if (phase === "after" && afterHours && hoveredTime === undefined) {
    return (
      <span {...stylex.props(styles.changes)}>
        <PriceChange
          change={closing - base}
          ratio={(closing - base) / base}
          period={range.changeLabel}
        />
        {afterHours}
      </span>
    );
  }
  // While hovering, a single line: a hovered after-hours bar shows only its
  // move since the close.
  return phase === "after" && afterHours ? (
    afterHours
  ) : (
    <PriceChange
      change={current - base}
      ratio={(current - base) / base}
      period={phase === "pre" ? phaseLabels.pre : range.changeLabel}
    />
  );
};

/**
 * IBKR's own move since the prior close (`82`/`83`), else worked out from
 * the prior close. Undefined when there's neither.
 */
const dayChange = (
  quote: ReturnType<typeof quoteOf>,
  priorClose: number | undefined
) => {
  if (quote.change !== undefined && quote.changeRatio !== undefined) {
    return { change: quote.change, ratio: quote.changeRatio };
  }
  if (quote.last === undefined || !priorClose) {
    return;
  }
  const change = quote.last - priorClose;
  return { change, ratio: change / priorClose };
};

/**
 * The latest price, or the hovered point's close while the chart is hovered,
 * and its move.
 *
 * As IBKR's GlobalTrader app shows it: unhovered on 1D, the price is the
 * latest trade from any session, overnight included, with one line of
 * IBKR's own change since the prior close, labelled "Today". Hovering the
 * chart, or another timeframe, shows the move worked out from the bars.
 */
const LiveQuote = ({
  conid,
  currency,
  range,
  hovered,
  overnight,
}: {
  conid: number;
  currency: string | undefined;
  range: HistoryRange;
  hovered: HoveredBar | null;
  /** Whether it trades in IBKR's US overnight session. */
  overnight: boolean;
}) => {
  const inOvernightSession = useInUsOvernightSession();
  const overnightNow = overnight && inOvernightSession;
  const live = useLiveQuote(conid, overnightNow);
  const { data: quote } = useSuspenseQuery({
    ...assetPriceQuery(conid),
    select: quoteOf,
    // Polled only while the live stream is down.
    refetchInterval: live ? false : quotePollInterval,
  });
  // Not suspended on: until it answers, the regular quote shows. Without
  // an overnight trade, IBKR sends no last price and the regular one stays.
  const { data: overnightQuote } = useQuery({
    ...assetOvernightQuoteQuery(conid),
    enabled: overnightNow,
    refetchInterval: live ? false : quotePollInterval,
    select: (snapshot) => {
      const parsed = snapshot === null ? undefined : quoteOf(snapshot);
      return parsed?.last === undefined ? undefined : parsed;
    },
  });
  const latest = (overnightNow && overnightQuote) || quote;
  const price = hovered?.close ?? latest.last;
  const day =
    hovered || !("session" in range)
      ? undefined
      : dayChange(latest, quote.priorClose);
  return (
    <AssetQuote
      price={price}
      currency={currency}
      change={
        day ? (
          <PriceChange
            change={day.change}
            ratio={day.ratio}
            period={range.changeLabel}
          />
        ) : (
          // Swapped in without a fade, like the chart, when the timeframe
          // changes.
          <InstantReveal>
            <QueryBoundary
              key={range.id}
              label="Loading price change"
              skeleton={changeSkeleton}
            >
              <RangeChange
                conid={conid}
                range={range}
                price={price}
                hoveredTime={hovered?.time}
                priorClose={quote.priorClose}
              />
            </QueryBoundary>
          </InstantReveal>
        )
      }
    />
  );
};

const quoteSkeleton = (
  <AssetQuote
    price={100}
    currency="USD"
    change={changeSkeleton}
    animated={false}
  />
);

/** Closing prices for one timeframe. */
const HistoryChart = ({
  conid,
  range,
  onHoverChange,
}: {
  conid: number;
  range: HistoryRange;
  onHoverChange: (bar: HoveredBar | null) => void;
}) => {
  const { data: history } = useSuspenseQuery(assetHistoryQuery(conid, range));
  // Prefetched with the history; its prior close and latest price colour
  // the chart.
  const { data: quote } = useSuspenseQuery({
    ...assetPriceQuery(conid),
    select: quoteOf,
  });
  const { session } = history;
  const barDate = new Intl.DateTimeFormat("en-US", range.barDate);
  return (
    <PriceChart
      bars={history.data}
      label={range.label}
      // A session spans its whole day, so it fills from the left.
      timeDomain={session && [new Date(session.start), new Date(session.end)]}
      // The timeframe's move to the latest price, as the change line shows
      // when nothing is hovered.
      trend={
        (leadingMove(
          history,
          range,
          quote.priorClose,
          quote.last,
          history.data.at(-1)?.t
        ) ?? 0) < 0
          ? "down"
          : "up"
      }
      extendedHours={
        session && [
          { from: new Date(session.start), to: new Date(session.open) },
          { from: new Date(session.close), to: new Date(session.end) },
        ]
      }
      formatDate={(date) => barDate.format(date)}
      onHoverChange={onHoverChange}
    />
  );
};

/** The timeframe buttons under the chart; the selected one's pill slides. */
const TimeframePicker = ({
  range,
  onRangeChange,
}: {
  range: HistoryRange;
  onRangeChange?: (range: HistoryRange) => void;
}) => (
  // With reduced motion, the pill jumps instead of sliding.
  <MotionConfig reducedMotion="user">
    <ToggleGroup
      aria-label="Timeframe"
      value={[range.id]}
      onValueChange={([id]) => {
        // Pressing the selected timeframe again would clear the group.
        const next = historyRanges.find((option) => option.id === id);
        if (next) {
          onRangeChange?.(next);
        }
      }}
      {...stylex.props(styles.ranges)}
    >
      {historyRanges.map((option) => (
        <Toggle
          key={option.id}
          value={option.id}
          {...stylex.props(text[12], styles.range)}
        >
          {option.id === range.id ? (
            <motion.span
              aria-hidden="true"
              layoutId="timeframe-pill"
              transition={pillTransition}
              {...stylex.props(styles.rangePill)}
            />
          ) : null}
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  </MotionConfig>
);

/**
 * The price chart with its timeframe picker. Only the chart suspends, so the
 * buttons stay put and a switch shows the same skeleton as the first load.
 */
const AssetHistory = ({
  conid,
  range,
  onRangeChange,
  onHoverChange,
}: {
  conid: number;
  range: HistoryRange;
  onRangeChange: (range: HistoryRange) => void;
  onHoverChange: (bar: HoveredBar | null) => void;
}) => (
  <section aria-label="Price history" {...stylex.props(styles.history)}>
    {/* The line loader is swapped for the chart without a transition. */}
    <InstantReveal>
      <QueryBoundary
        // A fresh boundary per timeframe: skullet only applies the reveal
        // mode when content mounts, so a reused one would fade instead.
        key={range.id}
        label="Loading price history"
        // Drawn as PriceChart.Skeleton: no data needed.
        skeleton={<PriceChart bars={[]} label={range.label} />}
      >
        <HistoryChart
          conid={conid}
          range={range}
          onHoverChange={onHoverChange}
        />
      </QueryBoundary>
    </InstantReveal>
    <TimeframePicker range={range} onRangeChange={onRangeChange} />
  </section>
);

/** Slides in the same 100ms as the label's colour. */
const pillTransition = { duration: 0.1, ease: "easeInOut" } as const;

/** Labelled values in a grid, e.g. "P/E" over "35.12". */
const FactGrid = ({
  facts,
}: {
  facts: readonly { label: string; value: string }[];
}) => (
  <dl {...stylex.props(styles.facts)}>
    {facts.map(({ label, value }) => (
      <div key={label} {...stylex.props(styles.fact)}>
        <dt {...stylex.props(text[12], styles.factLabel)}>{label}</dt>
        <dd {...stylex.props(text[14], styles.factValue)}>{value}</dd>
      </div>
    ))}
  </dl>
);

/** A titled block below the chart. */
const AssetSection = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section aria-label={title} {...stylex.props(styles.section)}>
    <h2 {...stylex.props(headings[16])}>{title}</h2>
    {children}
  </section>
);

/** How each kind of statistic is shown, prices in the asset's currency. */
const statFormats: Record<
  AssetStat["kind"],
  (amount: number, currency: string | undefined) => string
> = {
  price: formatMoney,
  bigMoney: formatCompactMoney,
  count: (amount) => compactNumber.format(amount),
  percent: (amount) => percent.format(amount),
  ratio: (amount) => decimalNumber.format(amount),
  text: String,
};

/** A statistic as shown: IBKR's own text when it isn't a number. */
const formatStat = (stat: AssetStat, currency: string | undefined) =>
  stat.amount === undefined
    ? stat.text
    : statFormats[stat.kind](stat.amount, currency);

/** IBKR's price and valuation statistics. */
const AssetStats = ({
  conid,
  currency,
}: {
  conid: number;
  currency: string | undefined;
}) => {
  const { data: stats } = useSuspenseQuery(assetStatsQuery(conid));
  return stats.length > 0 ? (
    <FactGrid
      facts={stats.map((stat) => ({
        label: stat.label,
        value: formatStat(stat, currency),
      }))}
    />
  ) : (
    <p {...stylex.props(text[14], styles.note)}>
      IBKR has no statistics for this asset.
    </p>
  );
};

/**
 * The statistics IBKR usually sends (12), with sample values. When more
 * arrive the grid just grows by a row.
 */
const statsSkeleton = (
  <FactGrid
    facts={assetStatFields
      .filter((stat) => !("often" in stat))
      .map(({ label }) => ({ label, value: "000.00" }))}
  />
);

/** A company description, clamped to two lines with its "Show more". */
const aboutSkeleton = (
  <div {...stylex.props(styles.aboutBody)}>
    <p {...stylex.props(text[14], styles.about, styles.aboutClamped)}>
      {"Sample Company Inc. designs, manufactures and sells products and services to customers around the world. ".repeat(
        4
      )}
    </p>
    <span {...stylex.props(text[14], styles.aboutToggle)}>
      Show more
      <ChevronDownIcon
        aria-hidden="true"
        {...stylex.props(styles.aboutChevron)}
      />
    </span>
  </div>
);

/** A few articles, each a two-line headline over its source and time. */
const articlesSkeleton = (
  <ul {...stylex.props(styles.articles)}>
    {[1, 2, 3, 4, 5].map((id) => (
      <li key={id} {...stylex.props(styles.article)}>
        <span {...stylex.props(text[14], styles.articleTitle)}>
          A sample headline about the company that runs on to a second line
        </span>
        <span {...stylex.props(text[12], styles.note)}>
          Source · Jan 1, 12:00 PM
        </span>
      </li>
    ))}
  </ul>
);

/**
 * The page from sample data, drawn as a skeleton until the contract loads:
 * the identity, quote, chart and timeframes, statistics, description and
 * articles, so the page's shape is there from the start. Ratings and company
 * details, further down and not always there, wait for their own.
 */
const AssetDetailsSkeleton = ({ symbol }: { symbol: string }) => (
  <div {...stylex.props(styles.details)}>
    <AssetIdentity
      logo={<TickerLogoPlaceholder />}
      name="Sample Company Inc."
      symbol={symbol}
    />
    <hr {...stylex.props(styles.divider)} />
    <div {...stylex.props(styles.columns)}>
      <div {...stylex.props(styles.main)}>
        {quoteSkeleton}
        <section {...stylex.props(styles.history)}>
          {/* Named directly: skullet only swaps a component for its
              `Skeleton` where it can see it, not inside another component. */}
          <PriceChart.Skeleton />
          <TimeframePicker range={defaultHistoryRange} />
        </section>
        <AssetSection title="Statistics">{statsSkeleton}</AssetSection>
        <AssetSection title="About">{aboutSkeleton}</AssetSection>
      </div>
      <aside {...stylex.props(styles.aside)}>
        <h2 {...stylex.props(headings[16])}>Articles</h2>
        {articlesSkeleton}
      </aside>
    </div>
  </div>
);

/**
 * What IBKR sent, as JSON, folded away. The fundamentals responses are
 * undocumented, so the page shows them while we learn their shape.
 */
const RawData = ({ data }: { data: Schema.Json }) => (
  <details {...stylex.props(text[12], styles.raw)}>
    <summary>Raw data</summary>
    <pre {...stylex.props(styles.rawJson)}>{JSON.stringify(data, null, 2)}</pre>
  </details>
);

/** IBKR's business summary for the company. */
const AssetAbout = ({ conid }: { conid: number }) => {
  const { data: profile } = useSuspenseQuery(assetProfileQuery(conid));
  return profile.about ? (
    <AboutText about={profile.about} />
  ) : (
    <p {...stylex.props(text[14], styles.note)}>
      IBKR has no description for this company.
    </p>
  );
};

/**
 * The description's height opening and closing: a strong ease-out, so it
 * moves the moment it's pressed, then settles. No overshoot, so the
 * content below never bounces.
 */
const aboutTransition = {
  duration: 0.3,
  ease: [0.19, 1, 0.22, 1],
} as const;

/**
 * The description clamped to two lines, with a button to show the rest.
 * The button only appears when the clamp actually cuts text off. The
 * height animates between two lines and the full text; the clamp's
 * ellipsis comes back only once closing has finished, so the lines
 * past the second stay visible while they slide out of view.
 */
const AboutText = ({ about }: { about: string }) => {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(true);
  // Assumed, like the skeleton, until measuring says the text fits.
  const [overflows, setOverflows] = useState(true);

  const measure = (node: HTMLParagraphElement | null) => {
    if (!node) {
      return;
    }
    const check = () => setOverflows(node.scrollHeight > node.clientHeight + 1);
    // Measured during commit, so the button is there in the first painted
    // frame: the skeleton swaps to a section that already has its final
    // height instead of one that grows a frame later.
    check();
    const observer = new ResizeObserver(check);
    observer.observe(node);
    return () => observer.disconnect();
  };

  const toggle = () => {
    if (!expanded) {
      setClamped(false);
    }
    setExpanded(!expanded);
  };

  return (
    <div {...stylex.props(styles.aboutBody)}>
      {/* With reduced motion, the height jumps instead of sliding. */}
      <MotionConfig reducedMotion="user">
        <motion.div
          id="asset-about"
          initial={false}
          animate={{ height: expanded || !overflows ? "auto" : "3.5em" }}
          transition={aboutTransition}
          onAnimationComplete={() => setClamped(!expanded)}
          {...stylex.props(text[14], styles.aboutFrame)}
        >
          <p
            ref={clamped ? measure : undefined}
            {...stylex.props(
              text[14],
              styles.about,
              clamped && styles.aboutClamped
            )}
          >
            {about}
          </p>
        </motion.div>
      </MotionConfig>
      {overflows || !clamped ? (
        <Button
          aria-controls="asset-about"
          aria-expanded={expanded}
          onClick={toggle}
          {...stylex.props(text[14], styles.aboutToggle)}
        >
          Show more
          <ChevronDownIcon
            aria-hidden="true"
            {...stylex.props(
              styles.aboutChevron,
              expanded && styles.aboutChevronUp
            )}
          />
        </Button>
      ) : null}
    </div>
  );
};

/** Green for buy, gray for hold, red for sell. */
const ratingColors = stylex.create({
  buy: { backgroundColor: colors.green9 },
  hold: { backgroundColor: colors.gray9 },
  sell: { backgroundColor: colors.red9 },
});

/** The verdict's circle: a faint tint of its level, the word in its ink. */
const verdictColors = stylex.create({
  buy: { backgroundColor: colors.greenA3, color: colors.green11 },
  hold: { backgroundColor: colors.grayA3, color: colors.gray12 },
  sell: { backgroundColor: colors.redA3, color: colors.red11 },
});

const share = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
});

/**
 * How many analysts recommend each level: the most-recommended one in a
 * circle, then each level's share of analysts as a bar of its own.
 */
const Consensus = ({
  consensus,
}: {
  consensus: readonly { key: RatingLevel; label: string; count: number }[];
}) => {
  let total = 0;
  // Best first, so a tie goes to the more bullish level.
  let [verdict] = consensus;
  for (const level of consensus) {
    total += level.count;
    if (!verdict || level.count > verdict.count) {
      verdict = level;
    }
  }
  if (!verdict) {
    return null;
  }
  return (
    <div {...stylex.props(styles.consensus)}>
      <div {...stylex.props(styles.verdict, verdictColors[verdict.key])}>
        <span {...stylex.props(headings[24])}>{verdict.label}</span>
      </div>
      <dl {...stylex.props(styles.consensusRows)}>
        {consensus.map(({ key, label, count }) => (
          <div key={key} {...stylex.props(styles.consensusRow)}>
            <dt {...stylex.props(text[14], styles.consensusLabel)}>
              {label} {share.format(count / total)}
            </dt>
            <dd
              aria-label={`${count} of ${total} analysts`}
              {...stylex.props(styles.consensusTrack)}
            >
              <div
                {...stylex.props(
                  styles.consensusFill(count / total),
                  ratingColors[key]
                )}
              />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

/** As `ratingColors`, for drawing on the chart. */
const ratingTokens = {
  sell: colors.red9,
  hold: colors.gray9,
  buy: colors.green9,
} satisfies Record<RatingLevel, string>;

type PriceTarget = Awaited<
  ReturnType<NonNullable<ReturnType<typeof assetRatingsQuery>["queryFn"]>>
>["targets"][number];

/** The past year's price running into the targets, a year ahead. */
const TargetChart = ({
  conid,
  currency,
  targets,
  height,
}: {
  conid: number;
  currency: string | undefined;
  targets: readonly PriceTarget[];
  height?: number;
}) => {
  const { data: history } = useSuspenseQuery(
    assetHistoryQuery(conid, targetHistoryRange)
  );
  return (
    <PriceTargetChart
      bars={history.data}
      height={height}
      targets={targets.map(({ key, price, level }) => ({
        key,
        price,
        label: formatMoney(price, currency),
        color: ratingTokens[level],
      }))}
    />
  );
};

/** Each target's value: its colour, name, price and distance from today's. */
const TargetList = ({
  targets,
  currency,
  ref,
}: {
  targets: readonly PriceTarget[];
  currency: string | undefined;
  ref?: Ref<HTMLDListElement>;
}) => (
  <dl ref={ref} {...stylex.props(styles.targets)}>
    {targets.map((target) => (
      <div key={target.key} {...stylex.props(styles.fact)}>
        <dt {...stylex.props(text[12], styles.targetLabel)}>
          <span
            aria-hidden="true"
            {...stylex.props(styles.targetSwatch, ratingColors[target.level])}
          />
          {target.label}
        </dt>
        <dd {...stylex.props(text[14], styles.factValue, styles.targetValue)}>
          {/* "▲ $870.00 (66.07%)": the triangle gives the direction,
              as on the price's change line. */}
          {target.change !== undefined && <Trend up={target.change >= 0} />}
          {formatMoney(target.price, currency)}
          {target.change !== undefined &&
            ` (${percent.format(Math.abs(target.change))})`}
        </dd>
      </div>
    ))}
  </dl>
);

/** Usual analyst numbers: mostly buy; a high, average, median and low target. */
const ratingsSkeleton = (
  <Consensus
    consensus={[
      { key: "buy", label: "Buy", count: 12 },
      { key: "hold", label: "Hold", count: 6 },
      { key: "sell", label: "Sell", count: 2 },
    ]}
  />
);

const priceTargetsSkeleton = (
  <div {...stylex.props(styles.priceTargets)}>
    <TargetList
      currency="USD"
      targets={[
        {
          key: "High",
          label: "High target",
          price: 250,
          change: 0.25,
          level: "buy",
        },
        {
          key: "Average",
          label: "Average target",
          price: 210,
          change: 0.05,
          level: "hold",
        },
        {
          key: "Median",
          label: "Median target",
          price: 205,
          change: 0.03,
          level: "hold",
        },
        {
          key: "Low",
          label: "Low target",
          price: 160,
          change: -0.2,
          level: "sell",
        },
      ]}
    />
    <div {...stylex.props(styles.targetChart)}>
      {/* Named directly, so skullet swaps in the chart's own skeleton. */}
      <PriceTargetChart.Skeleton height={targetChartMinHeight} />
    </div>
  </div>
);

/** Analysts' recommendations: how many pick each level. */
const AssetRatings = ({ conid }: { conid: number }) => {
  const { data: ratings } = useSuspenseQuery(assetRatingsQuery(conid));
  if (!ratings.consensus.some(({ count }) => count > 0)) {
    return (
      <p {...stylex.props(text[14], styles.note)}>
        IBKR has no analyst ratings for this company.
      </p>
    );
  }
  return <Consensus consensus={ratings.consensus} />;
};

/**
 * Analysts' 12-month price targets: each target's value in the first
 * column, and the targets charted across the other three.
 */
const AssetPriceTargets = ({
  conid,
  currency,
}: {
  conid: number;
  currency: string | undefined;
}) => {
  const { data: ratings } = useSuspenseQuery(assetRatingsQuery(conid));
  // The first column's height while the chart sits beside it (from md up),
  // so the chart starts and ends with it; less its 0.5px bottom border.
  // Before it's measured, and when stacked, four targets' height.
  const [sideHeight, setSideHeight] = useState<number>();
  const measureSide = (side: HTMLDListElement | null) => {
    if (!side) {
      return;
    }
    const beside = window.matchMedia("(width >= 768px)");
    const observer = new ResizeObserver(([entry]) => {
      const height = entry?.borderBoxSize[0]?.blockSize;
      setSideHeight(beside.matches && height ? height - 0.5 : undefined);
    });
    observer.observe(side);
    return () => observer.disconnect();
  };
  if (ratings.targets.length === 0) {
    return (
      <p {...stylex.props(text[14], styles.note)}>
        IBKR has no price targets for this company.
      </p>
    );
  }
  return (
    <div {...stylex.props(styles.priceTargets)}>
      <TargetList
        ref={measureSide}
        targets={ratings.targets}
        currency={currency}
      />
      <div {...stylex.props(styles.targetChart)}>
        <QueryBoundary
          label="Loading price targets"
          skeleton={
            <PriceTargetChart.Skeleton
              height={sideHeight ?? targetChartMinHeight}
            />
          }
        >
          <TargetChart
            conid={conid}
            currency={currency}
            height={sideHeight ?? targetChartMinHeight}
            targets={ratings.targets}
          />
        </QueryBoundary>
      </div>
    </div>
  );
};

const articleDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** The latest articles about the company: headline, source and time. */
const AssetArticles = ({ conid }: { conid: number }) => {
  const { data: news } = useSuspenseQuery(assetNewsQuery(conid));
  return (
    <>
      {news.articles.length > 0 ? (
        <ul {...stylex.props(styles.articles)}>
          {news.articles.map((article) => (
            <li key={article.id} {...stylex.props(styles.article)}>
              <span {...stylex.props(text[14], styles.articleTitle)}>
                {article.title}
              </span>
              <span {...stylex.props(text[12], styles.note)}>
                {[
                  article.source,
                  article.time instanceof Date
                    ? articleDate.format(article.time)
                    : article.time,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p {...stylex.props(text[14], styles.note)}>
          IBKR has no articles about this company.
        </p>
      )}
      <RawData data={news.raw} />
    </>
  );
};

/** The asset once its contract has loaded. */
const AssetDetails = ({ slug }: { slug: string }) => {
  const { data: contract } = useSuspenseQuery(assetContractQuery(slug));
  const { symbol: slugSymbol, exchange } = parseAssetSlug(slug);
  const symbol = contract.search.symbol ?? slugSymbol;
  // Shared by the chart, which reports it, and the quote, which shows it.
  const [hovered, setHovered] = useState<HoveredBar | null>(null);
  // Shared by the chart and the price change, which is measured over it.
  const [range, setRange] = useState(defaultHistoryRange);
  // Search's description is the primary exchange, e.g. "NASDAQ".
  const primaryExchange = contract.search.description ?? exchange;
  const companyInfo = companyInfoOf(contract.info, primaryExchange);
  // What the listing trades in, e.g. "EUR": every price on the page is in it.
  const currency = contract.info.currency ?? undefined;
  return (
    <div {...stylex.props(styles.details)}>
      <AssetIdentity
        logo={
          <TickerLogo
            conid={contract.conid}
            key={contract.conid}
            symbol={symbol}
          />
        }
        name={contract.search.companyName ?? symbol}
        symbol={symbol}
      />
      <hr {...stylex.props(styles.divider)} />
      <div {...stylex.props(styles.columns)}>
        <div {...stylex.props(styles.main)}>
          <div {...stylex.props(styles.quoteRow)}>
            <QueryBoundary label="Loading price" skeleton={quoteSkeleton}>
              <LiveQuote
                conid={contract.conid}
                currency={currency}
                range={range}
                hovered={hovered}
                overnight={tradesOvernight(contract.info)}
              />
            </QueryBoundary>
            {/* From the contract, so it shows while the price loads. */}
            <ListingExchange
              conid={contract.conid}
              exchange={primaryExchange}
            />
          </div>
          <AssetHistory
            conid={contract.conid}
            range={range}
            onRangeChange={(next) => {
              // The old chart unmounts with its hover.
              setHovered(null);
              setRange(next);
            }}
            onHoverChange={setHovered}
          />
          <AssetSection title="Statistics">
            <QueryBoundary label="Loading statistics" skeleton={statsSkeleton}>
              <AssetStats conid={contract.conid} currency={currency} />
            </QueryBoundary>
          </AssetSection>
          <AssetSection title="About">
            <QueryBoundary label="Loading description" skeleton={aboutSkeleton}>
              <AssetAbout conid={contract.conid} />
            </QueryBoundary>
          </AssetSection>
          {companyInfo.length > 0 && (
            <AssetSection title="Company">
              <FactGrid facts={companyInfo} />
            </AssetSection>
          )}
          <AssetSection title="Analyst ratings">
            <QueryBoundary
              label="Loading analyst ratings"
              skeleton={ratingsSkeleton}
            >
              <AssetRatings conid={contract.conid} />
            </QueryBoundary>
          </AssetSection>
          <AssetSection title="Price targets">
            <QueryBoundary
              label="Loading price targets"
              skeleton={priceTargetsSkeleton}
            >
              <AssetPriceTargets conid={contract.conid} currency={currency} />
            </QueryBoundary>
          </AssetSection>
        </div>
        <aside {...stylex.props(styles.aside)}>
          <h2 {...stylex.props(headings[16])}>Articles</h2>
          <QueryBoundary label="Loading articles" skeleton={articlesSkeleton}>
            <AssetArticles conid={contract.conid} />
          </QueryBoundary>
        </aside>
      </div>
    </div>
  );
};

const AssetPage = () => {
  const { symbol: slug } = Route.useParams();
  return (
    <main {...stylex.props(styles.page)}>
      <QueryBoundary
        skeleton={<AssetDetailsSkeleton symbol={parseAssetSlug(slug).symbol} />}
      >
        <AssetDetails slug={slug} />
      </QueryBoundary>
    </main>
  );
};

export const Route = createFileRoute("/_app/dashboard/assets/$symbol/")({
  head: ({ params }) => ({
    meta: [{ title: `${params.symbol.toUpperCase()} · Nora` }],
  }),
  // The dashboard layout has already checked the session.
  loader: ({ context, params }) => {
    // Links are lowercase; other spellings redirect to the canonical URL.
    const slug = params.symbol.toLowerCase();
    if (slug !== params.symbol) {
      throw redirect({
        to: "/dashboard/assets/$symbol",
        params: { symbol: slug },
        replace: true,
      });
    }
    // Not awaited, so navigation is immediate; the page's skeleton shows
    // while it loads.
    const prefetch = async () => {
      try {
        const contract = await context.queryClient.query({
          ...assetContractQuery(slug),
          staleTime: "static",
        });
        await Promise.all([
          context.queryClient.query({
            ...assetPriceQuery(contract.conid),
            staleTime: "static",
          }),
          context.queryClient.query({
            ...assetHistoryQuery(contract.conid, defaultHistoryRange),
            staleTime: "static",
          }),
          context.queryClient.query({
            ...assetStatsQuery(contract.conid),
            staleTime: "static",
          }),
          context.queryClient.query({
            ...assetProfileQuery(contract.conid),
            staleTime: "static",
          }),
          context.queryClient.query({
            ...assetRatingsQuery(contract.conid),
            staleTime: "static",
          }),
          // For the price targets' chart.
          context.queryClient.query({
            ...assetHistoryQuery(contract.conid, targetHistoryRange),
            staleTime: "static",
          }),
          context.queryClient.query({
            ...assetNewsQuery(contract.conid),
            staleTime: "static",
          }),
        ]);
      } catch {
        // Shown by the page's error boundary instead.
      }
    };
    void prefetch();
  },
  component: AssetPage,
});
