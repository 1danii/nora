import { ScrollArea } from "@base-ui/react/scroll-area";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import {
  ArrowBottomRightIcon,
  ArrowDownIcon,
  ArrowTopRightIcon,
  ArrowUpIcon,
  BarChartIcon,
  Cross2Icon,
  LightningBoltIcon,
  MagnifyingGlassIcon,
  MixerHorizontalIcon,
  PinBottomIcon,
  PinTopIcon,
  ShuffleIcon,
  StackIcon,
  TokensIcon,
} from "@radix-ui/react-icons";
import * as stylex from "@stylexjs/stylex";
import {
  QueryErrorResetBoundary,
  useQueries,
  useQuery,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { CatchBoundary, createFileRoute, Link } from "@tanstack/react-router";
import {
  createColumnHelper,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import type { Column, SortingState, Updater } from "@tanstack/react-table";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { Classic } from "loading-dev";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
} from "motion/react";
import {
  createContext,
  Suspense,
  use,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ComponentType, ReactNode, Ref } from "react";

import { Trend } from "@/components/price-change";
import { QueryBoundary, TryAgain } from "@/components/query-boundary";
import { TickerLogo, TickerLogoPlaceholder } from "@/components/ticker-logo";
import { Button, ButtonIcon } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MenuGroup,
  MenuRadioGroup,
  MenuRadioItem,
  SearchMenu,
  SearchSubmenu,
} from "@/components/ui/menu";
import {
  compactNumber,
  decimalNumber,
  formatCompactMoney,
  formatPrice,
  percent,
  signedNumber,
} from "@/lib/format";
import type {
  ExploreQuote,
  ExploreScan,
  ExploreScanId,
  ScanRow,
  ScreenerBound,
  ScreenerParams,
  ScreenerRangeId,
  ScreenerSector,
  ScreenerSortId,
} from "@/lib/ibkr-explore-queries";
import {
  defaultScreenerParams,
  exploreContractsQuery,
  exploreQuotesQuery,
  exploreScanQuery,
  exploreScreenerQuery,
  exploreScans,
  exploreSectorsQuery,
  isScreenerSortId,
  popularListQuery,
  scanCurrency,
  screenerBounds,
  screenerRangeIds,
} from "@/lib/ibkr-explore-queries";
import { headings, text } from "@/styles/text";
import { breakpoints, colors, focus, radius } from "@/styles/tokens.stylex";

const styles = stylex.create({
  // As the asset page.
  page: {
    paddingBottom: stylex.env.spacing(24),
    paddingTop: stylex.env.spacing(8),
  },
  // The page's navigation, set apart from the list's own controls: 24px from
  // the heading, a hairline 12px under the tabs, then 24px to the filters
  // (or the list). Flush with the heading: the pill's edge lines up with it,
  // and its label sits 12px in.
  scansBar: {
    boxShadow: `0 0.5px 0 ${colors.whiteA2}`,
    marginBottom: stylex.env.spacing(6),
    marginTop: stylex.env.spacing(6),
    paddingBottom: stylex.env.spacing(3),
  },
  // 4px wider all round than the tabs, with the viewport padding them back,
  // so a focus ring isn't clipped.
  scansScroll: {
    margin: `calc(-1 * ${stylex.env.spacing(1)})`,
  },
  // One row that scrolls sideways when it doesn't fit, fading at an edge
  // only while there's more that way (as the popups' options do). Until
  // Base UI sets its variables (server-rendered), the end fades.
  scansViewport: {
    padding: stylex.env.spacing(1),
    outline: "none",
    // A tab the keyboard moves to scrolls clear of the fade.
    scrollPaddingInline: "32px",
    maskImage: `linear-gradient(
      to right,
      transparent 0,
      black min(32px, var(--scroll-area-overflow-x-start, 0px)),
      black calc(100% - min(32px, var(--scroll-area-overflow-x-end, 32px))),
      transparent 100%
    )`,
    maskRepeat: "no-repeat",
    // No rubber-band while the tabs fit (Base UI marks real overflow);
    // when they scroll, the swipe stays here rather than paging back.
    overscrollBehaviorX: {
      "[data-has-overflow-x]": "contain",
      default: "none",
    },
  },
  scans: {
    gap: stylex.env.spacing(1),
    display: "flex",
    isolation: "isolate",
    width: "max-content",
  },
  // A default-size button's height, padding and icon gap, as wide as its
  // label; only the selected one has a pill behind, as the asset page's
  // timeframes.
  scan: {
    borderRadius: radius.full,
    borderStyle: "none",
    // The button's gap between icon and label.
    gap: stylex.env.spacing(1.5),
    paddingBlock: 0,
    paddingInline: stylex.env.spacing(3),
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
    fontWeight: 550,
    justifyContent: "center",
    position: "relative",
    transitionDuration: {
      default: "100ms",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionProperty: "color",
    transitionTimingFunction: "ease",
    whiteSpace: "nowrap",
    height: stylex.env.spacing(9),
  },
  // The outline button's background, sliding to the selected list.
  scanPill: {
    inset: 0,
    borderRadius: radius.full,
    backgroundColor: colors.gray2,
    position: "absolute",
    zIndex: -1,
  },
  // Flush with the heading and page edge: the header's background lines up
  // with them, and the rows' 12px padding keeps logos under "Name".
  list: {
    padding: 0,
    listStyle: "none",
    marginBlock: 0,
    marginInline: 0,
  },
  // The asset page's divider line between rows. The name side takes what
  // the figures leave.
  row: {
    // 12px in from each side, header included, so the columns line up.
    paddingInline: stylex.env.spacing(3),
    alignItems: "center",
    columnGap: stylex.env.spacing(4),
    display: "grid",
    // Equal-width digits in every cell, header included, so figures line
    // up down the columns and don't shift as they update.
    fontVariantNumeric: "tabular-nums",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    borderBottomColor: colors.whiteA2,
    borderBottomStyle: "solid",
    borderBottomWidth: "0.5px",
    height: stylex.env.spacing(14),
  },
  // On the exchange pill's background (the outline button's), in place of
  // the rows' divider.
  header: {
    borderRadius: radius.lg,
    backgroundColor: colors.gray2,
    color: colors.gray11,
    borderBottomStyle: "none",
    height: stylex.env.spacing(8),
  },
  link: {
    textDecoration: "none",
    color: "inherit",
  },
  // The name, and from lg up the industry in a column of its own.
  identity: {
    alignItems: "center",
    columnGap: stylex.env.spacing(4),
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      [breakpoints.lg]: "minmax(0, 3fr) minmax(0, 2fr)",
    },
    minWidth: 0,
  },
  company: {
    gap: stylex.env.spacing(3),
    alignItems: "center",
    display: "flex",
    minWidth: 0,
  },
  ticker: {
    color: colors.gray12,
    flexShrink: 0,
    fontWeight: 550,
  },
  truncated: {
    overflow: "hidden",
    color: colors.gray11,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },
  // Only where the row has room for them.
  fromMd: {
    display: {
      default: "none",
      [breakpoints.md]: "block",
    },
  },
  fromLg: {
    display: {
      default: "none",
      [breakpoints.lg]: "block",
    },
  },
  figure: {
    color: colors.gray12,
    whiteSpace: "nowrap",
  },
  quote: {
    alignItems: "center",
    columnGap: stylex.env.spacing(4),
    display: "grid",
    justifyItems: "end",
  },
  change: {
    alignItems: "center",
    color: colors.gray11,
    display: "flex",
  },
  // A thin track the width of its column, with a dot at the price.
  range: {
    borderRadius: radius.full,
    // The analyst ratings' track colour.
    backgroundColor: colors.gray2,
    justifySelf: "stretch",
    position: "relative",
    height: stylex.env.spacing(1),
  },
  // The chart's hover dot: radius 5 under a 2.5px ring in the page
  // background, centred on its edge as SVG strokes are, so 12.5px across
  // with 7.5px of fill showing. In the focus outline's colour.
  rangeDot: (position: number) => ({
    borderColor: colors.gray1,
    borderRadius: radius.full,
    borderStyle: "solid",
    borderWidth: 2.5,
    backgroundColor: focus["--focus-ring"],
    boxSizing: "border-box",
    position: "absolute",
    translate: "-50% -50%",
    height: 12.5,
    left: `${position * 100}%`,
    top: "50%",
    width: 12.5,
  }),
  note: {
    paddingBlock: stylex.env.spacing(4),
    color: colors.gray11,
  },
  // A figure still loading: a bar in the skeletons' colour, about as wide
  // as the figure, so the row keeps its shape. Plain CSS, as there's one per
  // cell.
  bar: {
    borderRadius: 4,
    backgroundColor: colors.whiteA1,
    display: "inline-block",
    verticalAlign: "middle",
    height: "0.75em",
    width: "3.5em",
  },
  // The end of the "All" list: quiet, centred under the last row.
  pageLoading: {
    paddingBlock: stylex.env.spacing(6),
    color: colors.gray11,
    display: "flex",
    justifyContent: "center",
  },
  pageLoadingLabel: {
    gap: stylex.env.spacing(3),
    alignItems: "center",
    display: "flex",
  },
  end: {
    paddingBlock: stylex.env.spacing(6),
    color: colors.gray11,
    textAlign: "center",
  },
  // A column's sort: the header's own label, a button only to the pointer
  // and keyboard. The sorted column is brighter, with its direction.
  sort: {
    padding: 0,
    borderStyle: "none",
    gap: stylex.env.spacing(1),
    alignItems: "center",
    appearance: "none",
    backgroundColor: "transparent",
    color: {
      default: "inherit",
      ":hover": colors.gray12,
    },
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: "inherit",
    fontSize: "inherit",
    fontWeight: "inherit",
    lineHeight: "inherit",
    // As the list picker's labels: the colour eases on hover and on sort.
    transitionDuration: {
      default: "100ms",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionProperty: "color",
    transitionTimingFunction: "ease",
    whiteSpace: "nowrap",
  },
  sorted: {
    color: colors.gray12,
  },
  sortFromLg: {
    display: {
      default: "none",
      [breakpoints.lg]: "inline-flex",
    },
  },
  // The "All" list's filters, in a row: the menu and applied pills on the
  // left, the search on the right.
  filters: {
    gap: stylex.env.spacing(2),
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    // A removed pill leaves the flow (absolutely placed) while it fades.
    position: "relative",
  },
  // 16px above the list, inside the filters' animated height.
  filtersFrame: {
    paddingBottom: stylex.env.spacing(4),
  },
  // While the height moves, only its bottom edge clips the filters: the
  // other sides leave room for the borders and focus rings that sit
  // outside the controls.
  filtersMoving: {
    clipPath: "inset(-6px -6px 0 -6px)",
  },
  appliedPill: {
    display: "flex",
  },
  // A little more room before the applied filters than between them.
  filterTrigger: {
    marginInlineEnd: stylex.env.spacing(1),
  },
  // An applied filter's name and value, split by a line that runs into the
  // pill's border (the outline button's hairline colour). It ends at the
  // pill's edge, where the 0.5px ring outside it starts: overlapping would
  // stack the two translucent lines into a brighter dot. The name is
  // dimmed, as a submenu's value is in the filter menu.
  appliedName: {
    alignItems: "center",
    alignSelf: "stretch",
    boxShadow: `0.5px 0 0 ${colors.whiteA2}`,
    color: colors.gray11,
    display: "flex",
    paddingInlineEnd: stylex.env.spacing(2),
  },
  appliedValue: {
    paddingInlineStart: stylex.env.spacing(1),
  },
  // The ×: muted, then the foreground while the pill (the remove button) is
  // hovered or keyboard-focused, eased as the other text colours.
  appliedRemove: {
    color: {
      default: colors.gray11,
      [stylex.when.ancestor(":focus-visible")]: colors.gray12,
      [stylex.when.ancestor(":hover")]: colors.gray12,
    },
    display: "flex",
    transitionDuration: {
      default: "100ms",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionProperty: "color",
    transitionTimingFunction: "ease",
  },
  // Wide enough for an industry's name.
  sectorMenu: {
    width: stylex.env.spacing(72),
  },
  // The search, pushed to the filters' right end.
  search: {
    marginInlineStart: "auto",
    width: 240,
  },
  // Rows from the previous order or filters, while IBKR sends the new ones.
  stale: {
    opacity: 0.5,
    transitionDuration: {
      default: "100ms",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionProperty: "opacity",
  },
  // The rows the virtualizer leaves out, above and below the ones it shows.
  spacer: (height: number) => ({
    height,
  }),
  quotesError: {
    gap: stylex.env.spacing(3),
    paddingBlock: stylex.env.spacing(8),
    alignItems: "center",
    color: colors.gray11,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    textAlign: "center",
  },
});

const bar = <span {...stylex.props(styles.bar)} />;

/**
 * The figures' fixed widths, so they line up from row to row: price, then
 * from lg up volume, market cap, P/E and the list's own columns, then from
 * md up the 52-week range, and today's move last. One style per number of
 * list columns.
 */
const quoteColumns = [
  stylex.create({
    columns: {
      gridTemplateColumns: {
        default: "96px 80px",
        [breakpoints.md]: "96px 112px 80px",
        [breakpoints.lg]: "96px 72px 80px 56px 112px 80px",
      },
    },
  }).columns,
  stylex.create({
    columns: {
      gridTemplateColumns: {
        default: "96px 80px",
        [breakpoints.md]: "96px 112px 80px",
        [breakpoints.lg]: "96px 72px 80px 56px 80px 112px 80px",
      },
    },
  }).columns,
  stylex.create({
    columns: {
      gridTemplateColumns: {
        default: "96px 80px",
        [breakpoints.md]: "96px 112px 80px",
        [breakpoints.lg]: "96px 72px 80px 56px 80px 80px 112px 80px",
      },
    },
  }).columns,
] as const;

/** Slides in the same 100ms as the label's colour. */
const pillTransition = { duration: 0.1, ease: "easeInOut" } as const;

/**
 * A list of at most 50: one of IBKR's market scans, or one of its popular
 * lists (GlobalTrader's "Popular with IBKR clients", "Brands you may know").
 */
type FixedSelection =
  | { kind: "scan"; scan: ExploreScan }
  | { kind: "popular"; id: string };

/** What the page lists: every US stock, biggest first, or a fixed list. */
type ExploreSelection = { kind: "all" } | FixedSelection;

const allSelection: ExploreSelection = { kind: "all" };

/** The picker's value for a selection; popular lists are `list:<id>`. */
const selectionKey = (selection: ExploreSelection) => {
  if (selection.kind === "all") {
    return "all";
  }
  return selection.kind === "scan" ? selection.scan.id : `list:${selection.id}`;
};

const selectionFromKey = (key: string): ExploreSelection | undefined => {
  if (key === "all") {
    return allSelection;
  }
  if (key.startsWith("list:")) {
    return { kind: "popular", id: key.slice("list:".length) };
  }
  const scan = exploreScans.find((option) => option.id === key);
  return scan && { kind: "scan", scan };
};

/** The fixed list's contracts. */
const rowsQueryOf = (selection: FixedSelection) =>
  selection.kind === "scan"
    ? exploreScanQuery(selection.scan)
    : popularListQuery(selection.id);

/** How many rows of the "All" list show at a time, each with its quotes. */
const pageSize = 50;

/**
 * The list's contracts, then the first page's quotes: the two calls run one
 * after the other, as the quotes need the conids. Errors are left to the
 * list's error boundary, which asks again.
 */
const prefetchList = async (
  queryClient: QueryClient,
  selection: ExploreSelection,
  params: ScreenerParams
) => {
  try {
    const rows =
      selection.kind === "all"
        ? await queryClient.query(
            exploreContractsQuery(
              await queryClient.query({
                ...exploreScreenerQuery(params),
                select: (result) => result.conids.slice(0, pageSize),
              })
            )
          )
        : await queryClient.query(rowsQueryOf(selection));
    await queryClient.query(
      exploreQuotesQuery(rows.slice(0, pageSize).map((row) => row.conid))
    );
  } catch {
    // Shown by the list's error boundary instead.
  }
};

/** Each list's icon, from Radix's set. */
const scanIcons: Record<
  ExploreScanId,
  ComponentType<{ className?: string }>
> = {
  // Volume, as bars.
  "most-active": BarChartIcon,
  // Shares changing hands, back and forth.
  "most-trades": ShuffleIcon,
  gainers: ArrowTopRightIcon,
  losers: ArrowBottomRightIcon,
  "hot-volume": LightningBoltIcon,
  // Pinned to the top or bottom of the year's range.
  "52w-highs": PinTopIcon,
  "52w-lows": PinBottomIcon,
  // Coins.
  dividend: TokensIcon,
};

/** One of the picker's lists; the selected one has the sliding pill. */
const PickerOption = ({
  value,
  label,
  icon: Icon,
  selected,
}: {
  value: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  selected: boolean;
}) => (
  <Toggle value={value} {...stylex.props(text[14], styles.scan)}>
    {selected ? (
      <motion.span
        aria-hidden="true"
        layoutId="explore-scan-pill"
        transition={pillTransition}
        {...stylex.props(styles.scanPill)}
      />
    ) : null}
    <ButtonIcon icon={Icon} />
    {label}
  </Toggle>
);

/**
 * The lists to explore; the selected one's pill slides between them.
 * IBKR's popular lists (`?list=<id>`) still load from the URL, but aren't
 * offered here for now.
 */
const ListPicker = ({
  selection,
  onSelect,
}: {
  selection: ExploreSelection;
  onSelect?: (selection: ExploreSelection) => void;
}) => {
  const selectedKey = selectionKey(selection);
  return (
    // With reduced motion, the pill jumps instead of sliding.
    <MotionConfig reducedMotion="user">
      <div {...stylex.props(styles.scansBar)}>
        <ScrollArea.Root {...stylex.props(styles.scansScroll)}>
          <ScrollArea.Viewport {...stylex.props(styles.scansViewport)}>
            <ToggleGroup
              aria-label="List"
              value={[selectedKey]}
              onValueChange={([key]) => {
                // Pressing the selected list again would clear the group.
                const next =
                  key === undefined ? undefined : selectionFromKey(key);
                if (next) {
                  onSelect?.(next);
                }
              }}
              {...stylex.props(styles.scans)}
            >
              <PickerOption
                value="all"
                label="All"
                icon={StackIcon}
                selected={selectedKey === "all"}
              />
              {exploreScans.map((option) => (
                <PickerOption
                  key={option.id}
                  value={option.id}
                  label={option.label}
                  icon={scanIcons[option.id]}
                  selected={option.id === selectedKey}
                />
              ))}
            </ToggleGroup>
          </ScrollArea.Viewport>
        </ScrollArea.Root>
      </div>
    </MotionConfig>
  );
};

/** A figure, or a dash when IBKR has none. */
const orDash = <T,>(value: T | undefined, format: (value: T) => string) =>
  value === undefined ? "—" : format(value);

const signedPercent = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

/** A column only some lists have, for what that list is about. */
interface ListColumn {
  label: string;
  value: (quote: ExploreQuote) => string | undefined;
}

/** How far the price is from `level`, e.g. "-2.10%" below the year's high. */
const distanceFrom = (quote: ExploreQuote, level: number | undefined) =>
  quote.last === undefined || !level
    ? undefined
    : signedPercent.format((quote.last - level) / level);

const relativeVolume: ListColumn = {
  label: "Rel. volume",
  value: ({ volume, averageVolume }) =>
    volume === undefined || !averageVolume
      ? undefined
      : `${decimalNumber.format(volume / averageVolume)}×`,
};

const dayChange: ListColumn = {
  label: "Change",
  value: ({ change }) =>
    change === undefined ? undefined : signedNumber.format(change),
};

/** Each list's own columns, before the 52-week range. */
const listColumns: Record<ExploreScanId, readonly ListColumn[]> = {
  "most-active": [relativeVolume],
  "most-trades": [relativeVolume],
  "hot-volume": [relativeVolume],
  gainers: [dayChange],
  losers: [dayChange],
  "52w-highs": [
    {
      label: "From high",
      value: (quote) => distanceFrom(quote, quote.yearHigh),
    },
  ],
  "52w-lows": [
    { label: "From low", value: (quote) => distanceFrom(quote, quote.yearLow) },
  ],
  dividend: [
    {
      label: "Yield",
      value: ({ dividendYield }) =>
        dividendYield === undefined ? undefined : percent.format(dividendYield),
    },
    { label: "Ex-dividend", value: ({ exDividend }) => exDividend },
  ],
};

/** The selection's own columns; "All" and popular lists have none. */
const columnsOf = (selection: ExploreSelection) =>
  selection.kind === "scan" ? listColumns[selection.scan.id] : [];

/** Where the price sits between the year's low and high. */
const YearRange = ({ quote }: { quote: ExploreQuote | undefined }) => {
  const low = quote?.yearLow;
  const high = quote?.yearHigh;
  const last = quote?.last;
  if (
    low === undefined ||
    high === undefined ||
    last === undefined ||
    high <= low
  ) {
    return <span {...stylex.props(styles.figure, styles.fromMd)}>—</span>;
  }
  const position = Math.min(1, Math.max(0, (last - low) / (high - low)));
  const decimals = quote?.lastDecimals ?? 2;
  const label = `52-week range ${formatPrice(low, scanCurrency, decimals)} to ${formatPrice(high, scanCurrency, decimals)}`;
  return (
    // Shown on hover; the asset page has the figures in words.
    <span
      aria-hidden="true"
      title={label}
      {...stylex.props(styles.range, styles.fromMd)}
    >
      <span {...stylex.props(styles.rangeDot(position))} />
    </span>
  );
};

/**
 * The row's figures: price; volume, market cap, P/E and the list's own
 * columns; the 52-week range; and today's move.
 */
const QuoteCells = ({
  quote,
  columns,
  loading = false,
}: {
  quote: ExploreQuote | undefined;
  columns: readonly ListColumn[];
  /** Bars in place of the figures, while the quotes load. */
  loading?: boolean;
}) => (
  <span {...stylex.props(text[14], styles.quote, quoteColumns[columns.length])}>
    <span {...stylex.props(styles.figure)}>
      {loading
        ? bar
        : orDash(quote?.last, (last) =>
            formatPrice(last, scanCurrency, quote?.lastDecimals ?? 2)
          )}
    </span>
    <span {...stylex.props(styles.figure, styles.fromLg)}>
      {loading
        ? bar
        : orDash(quote?.volume, (volume) => compactNumber.format(volume))}
    </span>
    <span {...stylex.props(styles.figure, styles.fromLg)}>
      {loading
        ? bar
        : orDash(quote?.marketCap, (cap) =>
            formatCompactMoney(cap, scanCurrency)
          )}
    </span>
    <span {...stylex.props(styles.figure, styles.fromLg)}>
      {loading ? bar : orDash(quote?.pe, (pe) => decimalNumber.format(pe))}
    </span>
    {columns.map((column) => (
      <span key={column.label} {...stylex.props(styles.figure, styles.fromLg)}>
        {loading ? bar : ((quote && column.value(quote)) ?? "—")}
      </span>
    ))}
    {loading ? (
      <span {...stylex.props(styles.range, styles.fromMd)} />
    ) : (
      <YearRange quote={quote} />
    )}
    <span {...stylex.props(styles.change)}>
      {loading && bar}
      {!loading && quote?.changeRatio === undefined && "—"}
      {!loading && quote?.changeRatio !== undefined && (
        <>
          <Trend up={quote.changeRatio >= 0} />
          {percent.format(Math.abs(quote.changeRatio))}
        </>
      )}
    </span>
  </span>
);

const sampleQuote: ExploreQuote = {
  last: 100,
  lastDecimals: 2,
  change: 1,
  changeRatio: 0.01,
  volume: 12_300_000,
  averageVolume: 8_200_000,
  marketCap: 120_000_000_000,
  pe: 24.5,
  yearHigh: 120,
  yearLow: 70,
  dividendYield: 0.012,
  exDividend: "2025-01-01",
  industry: "Semiconductors",
};

/** How often the quotes refresh while the page is open. */
const quotesPollInterval = 5000;

const industryOf = (quote: ExploreQuote | undefined, loading: boolean) => (
  <span {...stylex.props(text[14], styles.truncated)}>
    {loading ? bar : (quote?.industry ?? "—")}
  </span>
);

const industrySkeleton = industryOf(sampleQuote, false);

/**
 * Logo, ticker and the company's name, then from lg up its industry in a
 * column of its own.
 */
const RowIdentity = ({
  logo,
  symbol,
  name,
  industry,
}: {
  logo: ReactNode;
  symbol: string;
  name: string;
  industry: ReactNode;
}) => (
  <span {...stylex.props(text[14], styles.identity)}>
    <span {...stylex.props(styles.company)}>
      {logo}
      <span {...stylex.props(styles.ticker)}>{symbol}</span>
      <span {...stylex.props(styles.truncated)}>{name}</span>
    </span>
    <span {...stylex.props(styles.fromLg)}>{industry}</span>
  </span>
);

const ListHeader = ({ columns }: { columns: readonly ListColumn[] }) => (
  <li aria-hidden="true" {...stylex.props(text[12], styles.row, styles.header)}>
    <span {...stylex.props(styles.identity)}>
      <span>Name</span>
      <span {...stylex.props(styles.fromLg)}>Industry</span>
    </span>
    <span {...stylex.props(styles.quote, quoteColumns[columns.length])}>
      <span>Price</span>
      <span {...stylex.props(styles.fromLg)}>Volume</span>
      <span {...stylex.props(styles.fromLg)}>Market cap</span>
      <span {...stylex.props(styles.fromLg)}>P/E</span>
      {columns.map((column) => (
        <span key={column.label} {...stylex.props(styles.fromLg)}>
          {column.label}
        </span>
      ))}
      <span {...stylex.props(styles.fromMd)}>52-week range</span>
      <span>Today</span>
    </span>
  </li>
);

/** A row linking to its asset page, with its quote once it's here. */
const ScanRowItem = ({
  row,
  columns,
  quote,
  loading,
  stale = false,
}: {
  row: ScanRow;
  columns: readonly ListColumn[];
  quote: ExploreQuote | undefined;
  loading: boolean;
  /** Dimmed: the list is waiting on a new order or filters. */
  stale?: boolean;
}) => (
  <li {...stylex.props(stale && styles.stale)}>
    <Link
      to="/dashboard/assets/$symbol"
      params={{ symbol: row.slug }}
      // The asset page's loader can open the brokerage session, so it
      // waits for a click.
      preload={false}
      {...stylex.props(styles.row, styles.link)}
    >
      <RowIdentity
        logo={
          <TickerLogo
            key={row.conid}
            conid={row.conid}
            symbol={row.symbol}
            size={32}
          />
        }
        symbol={row.symbol}
        name={row.name}
        industry={industryOf(quote, loading)}
      />
      <QuoteCells quote={quote} columns={columns} loading={loading} />
    </Link>
  </li>
);

/**
 * The list's rows, each linking to its asset page, with the quotes once
 * they're here.
 */
const ScanRows = ({
  rows,
  columns,
  quotes,
  loading = false,
}: {
  rows: readonly ScanRow[];
  columns: readonly ListColumn[];
  quotes: ReadonlyMap<number, ExploreQuote> | undefined;
  loading?: boolean;
}) =>
  rows.map((row) => (
    <ScanRowItem
      key={row.conid}
      row={row}
      columns={columns}
      quote={quotes?.get(row.conid)}
      loading={loading}
    />
  ));

/** The rows with the list's quotes, one snapshot polled for all of them. */
const QuotedRows = ({
  rows,
  columns,
}: {
  rows: readonly ScanRow[];
  columns: readonly ListColumn[];
}) => {
  const { data: quotes } = useSuspenseQuery({
    ...exploreQuotesQuery(rows.map((row) => row.conid)),
    refetchInterval: quotesPollInterval,
  });
  return <ScanRows rows={rows} columns={columns} quotes={quotes} />;
};

/** The list's rows, for the quotes' error, which only gets the error. */
const ListRows = createContext<{
  rows: readonly ScanRow[];
  columns: readonly ListColumn[];
}>({ rows: [], columns: [] });

/** The rows with dashes for figures, and a retry. */
const QuotesError = ({ reset }: ErrorComponentProps) => {
  const { rows, columns } = use(ListRows);
  return (
    <>
      <ScanRows rows={rows} columns={columns} quotes={undefined} />
      <li {...stylex.props(text[14], styles.quotesError)}>
        <TryAgain reset={reset} />
      </li>
    </>
  );
};

/**
 * Rows with one quotes snapshot for all of them, behind a boundary of its
 * own: while the quotes load, or if they fail, the rows show with bars or
 * dashes in place of the figures.
 */
const QuotedPage = ({
  rows,
  columns,
}: {
  rows: readonly ScanRow[];
  columns: readonly ListColumn[];
}) => {
  const listRows = useMemo(() => ({ rows, columns }), [rows, columns]);
  return (
    <ListRows value={listRows}>
      <QueryErrorResetBoundary>
        <CatchBoundary
          getResetKey={() => rows.map((row) => row.conid).join(",")}
          errorComponent={QuotesError}
        >
          <Suspense
            fallback={
              <ScanRows
                rows={rows}
                columns={columns}
                quotes={undefined}
                loading
              />
            }
          >
            <QuotedRows rows={rows} columns={columns} />
          </Suspense>
        </CatchBoundary>
      </QueryErrorResetBoundary>
    </ListRows>
  );
};

const emptyList = (
  <p {...stylex.props(text[14], styles.note)}>
    IBKR found nothing for this list right now.
  </p>
);

/** A fixed list's contracts, at most 50, with one boundary for the quotes. */
const ScanList = ({ selection }: { selection: FixedSelection }) => {
  const { data: rows } = useSuspenseQuery(rowsQueryOf(selection));
  const columns = columnsOf(selection);
  if (rows.length === 0) {
    return emptyList;
  }
  return (
    <ul {...stylex.props(styles.list)}>
      <ListHeader columns={columns} />
      <QuotedPage rows={rows} columns={columns} />
    </ul>
  );
};

const noColumns: readonly ListColumn[] = [];

/** A count in full, e.g. "4,512". */
const wholeNumber = new Intl.NumberFormat("en-US");

/** A page while IBKR names its contracts: the login's spinner, one row. */
const PageLoading = () => (
  <li {...stylex.props(text[14], styles.pageLoading)}>
    <output {...stylex.props(styles.pageLoadingLabel)}>
      {/* The spinner is aria-hidden; the text is what gets announced. */}
      <Classic size={20} color={colors.gray11} />
      Loading…
    </output>
  </li>
);

/** A row of the "All" list: its contract, its page, and its quote. */
interface AllRow extends ScanRow {
  /** Which 50 of the screener's conids it came in with. */
  page: number;
  quote: ExploreQuote | undefined;
  /** Bars in place of the figures, while its page's quotes load. */
  loading: boolean;
}

/**
 * The "All" list's sortable columns. TanStack Table keeps the sort; IBKR
 * does it (`manualSorting`), ranking every matching stock by the column's
 * scanner, so the accessors are only for the table's bookkeeping.
 */
const allFeatures = tableFeatures({ rowSortingFeature });
const allColumn = createColumnHelper<typeof allFeatures, AllRow>();
const allColumns = allColumn.columns([
  allColumn.accessor((row) => row.quote?.last, {
    id: "price",
    header: "Price",
  }),
  allColumn.accessor((row) => row.quote?.volume, {
    id: "volume",
    header: "Volume",
  }),
  allColumn.accessor((row) => row.quote?.marketCap, {
    id: "marketCap",
    header: "Market cap",
  }),
  allColumn.accessor((row) => row.quote?.pe, { id: "pe", header: "P/E" }),
  allColumn.accessor((row) => row.quote?.changeRatio, {
    id: "change",
    header: "Today",
  }),
]);

/**
 * A column's header as a button that sorts the list by it. `sorted` comes
 * as a prop rather than from `column.getIsSorted()`: the column object stays
 * the same as the sort changes, so the React Compiler would skip the update.
 */
const SortHeader = ({
  column,
  sorted,
  label,
  fromLg = false,
}: {
  column: Column<typeof allFeatures, AllRow> | undefined;
  sorted: false | "asc" | "desc";
  label: string;
  fromLg?: boolean;
}) => {
  let Icon: ComponentType | undefined;
  if (sorted === "desc") {
    Icon = ArrowDownIcon;
  } else if (sorted === "asc") {
    Icon = ArrowUpIcon;
  }
  let description = `Sort by ${label}`;
  if (sorted) {
    description = `${label}, sorted ${sorted === "desc" ? "high to low" : "low to high"}`;
  }
  return (
    <button
      type="button"
      aria-label={description}
      onClick={column?.getToggleSortingHandler()}
      {...stylex.props(
        styles.sort,
        sorted !== false && styles.sorted,
        fromLg && styles.sortFromLg
      )}
    >
      {Icon ? <Icon aria-hidden="true" /> : null}
      {label}
    </button>
  );
};

/**
 * The "All" list's header: each figure's label sorts by it. Subscribed to
 * the table's sorting, as TanStack Table's React Compiler guide has it.
 */
const AllHeader = ({
  table,
  ref,
}: {
  table: ReturnType<typeof useAllTable>;
  ref: Ref<HTMLLIElement>;
}) => (
  <li ref={ref} {...stylex.props(text[12], styles.row, styles.header)}>
    <span {...stylex.props(styles.identity)}>
      <span>Name</span>
      <span {...stylex.props(styles.fromLg)}>Industry</span>
    </span>
    <table.Subscribe selector={(state) => state.sorting}>
      {(sorting: SortingState) => {
        const sortedOf = (id: ScreenerSortId) => {
          const sort = sorting.find((column) => column.id === id);
          if (!sort) {
            return false;
          }
          return sort.desc ? "desc" : "asc";
        };
        const header = (id: ScreenerSortId, label: string, fromLg = false) => (
          <SortHeader
            column={table.getColumn(id)}
            sorted={sortedOf(id)}
            label={label}
            fromLg={fromLg}
          />
        );
        return (
          <span {...stylex.props(styles.quote, quoteColumns[0])}>
            {header("price", "Price")}
            {header("volume", "Volume", true)}
            {header("marketCap", "Market cap", true)}
            {header("pe", "P/E", true)}
            <span {...stylex.props(styles.fromMd)}>52-week range</span>
            {header("change", "Today")}
          </span>
        );
      }}
    </table.Subscribe>
  </li>
);

/**
 * The table over the "All" list's rows, sorted as the URL says. A click on
 * a header asks IBKR for the new order: highest first, then lowest.
 */
const useAllTable = (
  data: AllRow[],
  params: ScreenerParams,
  onSort: (sort: ScreenerSortId, descending: boolean) => void
) => {
  const sorting: SortingState = [{ id: params.sort, desc: params.descending }];
  return useTable({
    features: allFeatures,
    data,
    columns: allColumns,
    state: { sorting },
    onSortingChange: (updater: Updater<SortingState>) => {
      const [next] = Array.isArray(updater) ? updater : updater(sorting);
      if (next && isScreenerSortId(next.id)) {
        onSort(next.id, next.desc);
      }
    },
    manualSorting: true,
    sortDescFirst: true,
    enableSortingRemoval: false,
    enableMultiSort: false,
    getRowId: (row) => String(row.conid),
  });
};

/** A row's height, divider included, as the rows' style sets it. */
const rowHeight = 56;

/** How many rows past the last one shown to start naming the next page. */
const loadAhead = 25;

/**
 * Every US stock IBKR's screener matches, in the order and sector the URL
 * asks for: at most 200, named 50 at a time as the list nears its end. Only
 * the rows on screen are rendered, and only their pages' quotes are polled.
 */
const AllList = ({
  params,
  query,
  onSort,
}: {
  params: ScreenerParams;
  /**
   * A ticker or part of a company's name. IBKR's screener can't filter by
   * name, so this narrows what it sent: every page gets named, then rows
   * that don't match are left out.
   */
  query: string;
  onSort: (sort: ScreenerSortId, descending: boolean) => void;
}) => {
  // TanStack Virtual's virtualizer changes without changing identity, so
  // the React Compiler mustn't memoize what reads it (it skips this
  // component anyway; this says so).
  "use no memo";
  // The list keeps its rows, dimmed, while IBKR sends a new order or
  // filters: the new ones suspend in the background, so the header and rows
  // stay put instead of going back to the skeleton. The header's sort shows
  // the new order at once.
  const shownParams = useDeferredValue(params);
  const stale = shownParams !== params;
  const {
    data: { conids, total },
  } = useSuspenseQuery(exploreScreenerQuery(shownParams));
  const pages = Array.from(
    { length: Math.ceil(conids.length / pageSize) },
    (_, index) => conids.slice(index * pageSize, (index + 1) * pageSize)
  );
  const names = useSuspenseInfiniteQuery({
    queryKey: ["ibkr", "portal", "explore", "screener-rows", conids],
    queryFn: ({ pageParam, client }) => {
      const page = pages[pageParam] ?? [];
      return page.length === 0
        ? Promise.resolve([])
        : client.query(exploreContractsQuery(page));
    },
    initialPageParam: 0,
    getNextPageParam: (_last, loaded) =>
      loaded.length < pages.length ? loaded.length : undefined,
    retry: false,
    staleTime: 60 * 60_000,
  });
  const needle = query.trim().toLowerCase();
  const named = names.data.pages
    .flatMap((page, index) => page.map((row) => ({ row, page: index })))
    .filter(
      ({ row }) =>
        !needle ||
        row.symbol.toLowerCase().includes(needle) ||
        row.name.toLowerCase().includes(needle)
    );

  // Where the rows start on the page, for the window's virtualizer.
  const headerRef = useRef<HTMLLIElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      const header = headerRef.current;
      if (header) {
        setScrollMargin(header.getBoundingClientRect().bottom + window.scrollY);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  // oxlint-disable-next-line react/incompatible-library -- TanStack Virtual's documented caveat; "use no memo" above opts this component out.
  const virtualizer = useWindowVirtualizer({
    count: named.length,
    estimateSize: () => rowHeight,
    overscan: 8,
    scrollMargin,
  });
  const items = virtualizer.getVirtualItems();

  // One quotes snapshot per page, polled only while the page is on screen.
  const shownPages = new Set(
    items.map((item) => named[item.index]?.page ?? -1)
  );
  const quotes = useQueries({
    queries: names.data.pages.map((page, index) => ({
      ...exploreQuotesQuery(page.map((row) => row.conid)),
      enabled: page.length > 0 && shownPages.has(index),
      refetchInterval: shownPages.has(index) ? quotesPollInterval : false,
    })),
  });
  const data = named.map(({ row, page }): AllRow => {
    const pageQuotes = quotes[page];
    return {
      ...row,
      page,
      quote: pageQuotes?.data?.get(row.conid),
      loading: pageQuotes?.data === undefined && !pageQuotes?.isError,
    };
  });
  const table = useAllTable(data, params, onSort);
  const { rows } = table.getRowModel();

  // Names the next page as the last rows near the screen, or every page
  // while searching, since a match can be anywhere in IBKR's list.
  const lastShown = items.at(-1)?.index ?? 0;
  const {
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  } = names;
  useEffect(() => {
    if (
      hasNextPage &&
      !isFetchingNextPage &&
      !isFetchNextPageError &&
      (needle !== "" || lastShown >= named.length - loadAhead)
    ) {
      void fetchNextPage();
    }
  }, [
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    needle,
    lastShown,
    named.length,
    fetchNextPage,
  ]);

  if (conids.length === 0) {
    return emptyList;
  }
  const [first] = items;
  const last = items.at(-1);
  const before = first ? first.start - scrollMargin : 0;
  const after = last
    ? virtualizer.getTotalSize() - (last.end - scrollMargin)
    : 0;
  const count = wholeNumber.format(conids.length);
  let footer: ReactNode = null;
  if (isFetchNextPageError) {
    footer = (
      <li {...stylex.props(text[14], styles.quotesError)}>
        <TryAgain
          reset={() => {
            void fetchNextPage();
          }}
        />
      </li>
    );
  } else if (hasNextPage) {
    footer = isFetchingNextPage ? <PageLoading /> : null;
  } else if (needle) {
    footer = (
      <li {...stylex.props(text[12], styles.end)}>
        {named.length === 0
          ? `None of the top ${count} matching US stocks match “${query.trim()}”`
          : `${wholeNumber.format(named.length)} of the top ${count} matching US stocks match “${query.trim()}”`}
      </li>
    );
  } else {
    footer = (
      <li {...stylex.props(text[12], styles.end)}>
        {total > conids.length
          ? `The top ${count} of ${wholeNumber.format(total)} matching US stocks`
          : `All ${count} matching US stocks`}
      </li>
    );
  }
  return (
    <ul {...stylex.props(styles.list)}>
      <AllHeader table={table} ref={headerRef} />
      {before > 0 ? (
        <li aria-hidden="true" {...stylex.props(styles.spacer(before))} />
      ) : null}
      {items.map((item) => {
        const row = rows[item.index]?.original;
        return row ? (
          <ScanRowItem
            key={row.conid}
            row={row}
            columns={noColumns}
            quote={row.quote}
            loading={row.loading}
            stale={stale}
          />
        ) : null;
      })}
      {after > 0 ? (
        <li aria-hidden="true" {...stylex.props(styles.spacer(after))} />
      ) : null}
      {footer}
    </ul>
  );
};

/** An applied filter's pill entering or leaving: the popups' 100ms ease-out. */
const pillTransitionIn = { duration: 0.1, ease: "easeOut" } as const;

/** A range's choice: its ends, in the units the URL's bounds use. */
interface RangePreset {
  label: string;
  min?: number;
  max?: number;
}

/**
 * Each range's name in the filter menu, and its choices: market cap in
 * billions of dollars, price in dollars, dividend yield in percent.
 */
const screenerRangeMenus: Record<
  ScreenerRangeId,
  { name: string; presets: readonly RangePreset[] }
> = {
  marketCap: {
    name: "Market cap",
    presets: [
      { label: "Over $200B", min: 200 },
      { label: "$10B–$200B", min: 10, max: 200 },
      { label: "$2B–$10B", min: 2, max: 10 },
      { label: "$300M–$2B", min: 0.3, max: 2 },
      { label: "Under $300M", max: 0.3 },
    ],
  },
  price: {
    name: "Price",
    presets: [
      { label: "Under $5", max: 5 },
      { label: "$5–$20", min: 5, max: 20 },
      { label: "$20–$100", min: 20, max: 100 },
      { label: "$100–$500", min: 100, max: 500 },
      { label: "Over $500", min: 500 },
    ],
  },
  pe: {
    name: "P/E ratio",
    presets: [
      { label: "Under 10", min: 0, max: 10 },
      { label: "10–20", min: 10, max: 20 },
      { label: "20–40", min: 20, max: 40 },
      { label: "Over 40", min: 40 },
    ],
  },
  dividendYield: {
    name: "Dividend yield",
    presets: [
      { label: "Over 1%", min: 1 },
      { label: "Over 3%", min: 3 },
      { label: "Over 5%", min: 5 },
    ],
  },
};

/** A radio value for a range's ends: "10:200", "200:", or "" (none checked) for any. */
const rangeKey = (min: number | undefined, max: number | undefined) =>
  min === undefined && max === undefined ? "" : `${min ?? ""}:${max ?? ""}`;

/** A range's current ends, from the URL's bounds. */
const rangeOf = (params: ScreenerParams, id: ScreenerRangeId) => ({
  min: params.bounds[`${id}Min`],
  max: params.bounds[`${id}Max`],
});

/**
 * A range's current choice as text: its preset's label, or its ends when
 * the URL holds others. Undefined while it's any.
 */
const rangeLabel = (params: ScreenerParams, id: ScreenerRangeId) => {
  const { min, max } = rangeOf(params, id);
  if (min === undefined && max === undefined) {
    return;
  }
  const preset = screenerRangeMenus[id].presets.find(
    (option) => option.min === min && option.max === max
  );
  if (preset) {
    return preset.label;
  }
  if (min === undefined) {
    return `Under ${max}`;
  }
  return max === undefined ? `Over ${min}` : `${min}–${max}`;
};

/** The params with one range's ends replaced; both undefined clears it. */
const withRange = (
  params: ScreenerParams,
  id: ScreenerRangeId,
  min?: number,
  max?: number
): ScreenerParams => {
  const bounds: ScreenerParams["bounds"] = {};
  for (const key of screenerBounds) {
    let next = params.bounds[key];
    if (key === `${id}Min`) {
      next = min;
    } else if (key === `${id}Max`) {
      next = max;
    }
    if (next !== undefined) {
      bounds[key] = next;
    }
  }
  return { ...params, bounds };
};

/** The sector's or industry's name, from IBKR's list. */
const sectorName = (
  sectors: readonly ScreenerSector[],
  value: string | undefined
) => {
  if (!value) {
    return;
  }
  for (const option of sectors) {
    if (option.value === value) {
      return option.name;
    }
    const industry = option.industries.find((item) => item.value === value);
    if (industry) {
      return industry.name;
    }
  }
  return value;
};

/**
 * The "All" list's filters: a menu of the filterable properties (searched by
 * name), each opening its choices; the applied ones as removable pills; then
 * the search over the rows. A filter is cleared with its pill, so the menus
 * offer no "any" choice. Sectors are optional data: until they're here, the
 * sector menu says it's loading.
 */
const ScreenerFilters = ({
  params,
  onChange,
  query,
  onQueryChange,
}: {
  params: ScreenerParams;
  onChange: (params: ScreenerParams) => void;
  query: string;
  onQueryChange: (query: string) => void;
}) => {
  const { data: sectors = [] } = useQuery(exploreSectorsQuery);
  const sector = sectorName(sectors, params.sector);
  const unordered = [
    ...(sector
      ? [
          {
            id: "sector",
            name: "Sector",
            value: sector,
            handleRemove: () => onChange({ ...params, sector: undefined }),
          },
        ]
      : []),
    ...screenerRangeIds.flatMap((id) => {
      const label = rangeLabel(params, id);
      return label
        ? [
            {
              id,
              name: screenerRangeMenus[id].name,
              value: label,
              handleRemove: () => onChange(withRange(params, id)),
            },
          ]
        : [];
    }),
  ];
  // In the order they were added: a new filter joins the end, and a changed
  // one keeps its place. Those already applied when the filters mounted
  // (from the URL) keep the default order.
  const ids = unordered.map((filter) => filter.id);
  const [order, setOrder] = useState(ids);
  const nextOrder = [
    ...order.filter((id) => ids.includes(id)),
    ...ids.filter((id) => !order.includes(id)),
  ];
  if (nextOrder.join(",") !== order.join(",")) {
    setOrder(nextOrder);
  }
  const applied = unordered.toSorted(
    (a, b) => nextOrder.indexOf(a.id) - nextOrder.indexOf(b.id)
  );
  return (
    <div {...stylex.props(styles.filters)}>
      <SearchMenu
        label="Filter"
        icon={MixerHorizontalIcon}
        hotkey="F"
        style={styles.filterTrigger}
        searchLabel="Filter by…"
        empty="No filters match"
      >
        <SearchSubmenu
          label="Sector"
          value={sector}
          searchLabel="Search sectors"
          empty={sectors.length > 0 ? "No sectors match" : "Loading sectors…"}
          popupStyle={styles.sectorMenu}
        >
          <MenuRadioGroup
            value={params.sector ?? ""}
            onValueChange={(value) =>
              onChange({ ...params, sector: value || undefined })
            }
          >
            {sectors.map((option) => (
              <MenuGroup key={option.value} label={option.name}>
                <MenuRadioItem value={option.value} label={option.name}>
                  All {option.name}
                </MenuRadioItem>
                {option.industries.map((industry) => (
                  <MenuRadioItem key={industry.value} value={industry.value}>
                    {industry.name}
                  </MenuRadioItem>
                ))}
              </MenuGroup>
            ))}
          </MenuRadioGroup>
        </SearchSubmenu>
        {screenerRangeIds.map((id) => {
          const { min, max } = rangeOf(params, id);
          return (
            <SearchSubmenu
              key={id}
              label={screenerRangeMenus[id].name}
              value={rangeLabel(params, id)}
            >
              <MenuRadioGroup
                value={rangeKey(min, max)}
                onValueChange={(value) => {
                  const preset = screenerRangeMenus[id].presets.find(
                    (option) => rangeKey(option.min, option.max) === value
                  );
                  onChange(withRange(params, id, preset?.min, preset?.max));
                }}
              >
                {screenerRangeMenus[id].presets.map((option) => (
                  <MenuRadioItem
                    key={option.label}
                    value={rangeKey(option.min, option.max)}
                  >
                    {option.label}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </SearchSubmenu>
          );
        })}
      </SearchMenu>
      {/* A pill scales in and out as the popups do; the others slide over
          to make room or close the gap, eased as the filters' reveal. */}
      <AnimatePresence initial={false} mode="popLayout">
        {applied.map((filter) => (
          <motion.span
            key={filter.id}
            layout="position"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ ...pillTransitionIn, layout: revealTransition }}
            {...stylex.props(styles.appliedPill)}
          >
            <Button
              variant="outline"
              size="sm"
              // Lets the × brighten while the pill's hovered or focused.
              style={stylex.defaultMarker()}
              aria-label={`Remove ${filter.name}: ${filter.value}`}
              onClick={filter.handleRemove}
            >
              <span {...stylex.props(styles.appliedName)}>{filter.name}</span>
              <span {...stylex.props(styles.appliedValue)}>{filter.value}</span>
              <span {...stylex.props(styles.appliedRemove)}>
                <ButtonIcon icon={Cross2Icon} />
              </span>
            </Button>
          </motion.span>
        ))}
      </AnimatePresence>
      {/* At the row's end; the placeholder is its only visible label. */}
      <Input
        type="search"
        aria-label="Search name or ticker"
        placeholder="Search name or ticker"
        value={query}
        onValueChange={onQueryChange}
        icon={MagnifyingGlassIcon}
        hotkey="/"
        style={styles.search}
      />
    </div>
  );
};

const sampleRows: readonly ScanRow[] = Array.from(
  { length: 10 },
  (_, index) => ({
    conid: index,
    symbol: "TICK",
    name: "Sample Company Inc.",
    slug: "",
  })
);

/** Ten rows from sample data, the list's shape while it loads. */
const ScanListSkeleton = ({ selection }: { selection: ExploreSelection }) => {
  const columns = columnsOf(selection);
  return (
    <ul {...stylex.props(styles.list)}>
      <ListHeader columns={columns} />
      {sampleRows.map((row) => (
        <li key={row.conid} {...stylex.props(styles.row)}>
          <RowIdentity
            logo={<TickerLogoPlaceholder size={32} />}
            symbol={row.symbol}
            name={row.name}
            industry={industrySkeleton}
          />
          <QuoteCells quote={sampleQuote} columns={columns} />
        </li>
      ))}
    </ul>
  );
};

/** The search as it arrives in the URL, before it's checked. */
type ExploreSearchInput = {
  scan?: string;
  list?: string;
  sort?: string;
  order?: string;
  sector?: string;
} & Partial<Record<ScreenerBound, string | number>>;

/**
 * The page's search: a popular list's ID, or a scan's, or for "All" its
 * order and sector. Defaults (biggest first, every sector) are left out.
 */
type ExploreSearch = {
  scan?: ExploreScanId;
  list?: string;
  sort?: ScreenerSortId;
  order?: "asc";
  sector?: string;
} & Partial<Record<ScreenerBound, number>>;

/** The page's selection from its search: `?list=<id>`, `?scan=<id>`, or "All". */
const selectionOf = (search: ExploreSearch): ExploreSelection => {
  if (search.list) {
    return { kind: "popular", id: search.list };
  }
  const scan = exploreScans.find((option) => option.id === search.scan);
  return scan ? { kind: "scan", scan } : allSelection;
};

/** The ranges' ends that are set, out of a search. */
const boundsOf = (
  search: Partial<Record<ScreenerBound, string | number>>
): ScreenerParams["bounds"] => {
  const bounds: ScreenerParams["bounds"] = {};
  for (const bound of screenerBounds) {
    const raw = search[bound];
    const value = raw === undefined || raw === "" ? Number.NaN : Number(raw);
    if (Number.isFinite(value)) {
      bounds[bound] = value;
    }
  }
  return bounds;
};

/** The "All" list's order, sector and ranges from the search. */
const screenerParamsOf = (search: ExploreSearch): ScreenerParams => ({
  sort: search.sort ?? defaultScreenerParams.sort,
  // Every column starts highest first; `order=asc` flips it.
  descending: search.order !== "asc",
  sector: search.sector,
  bounds: boundsOf(search),
});

/** The search for an "All" list, without its defaults. */
const screenerSearchOf = ({
  sort,
  descending,
  sector,
  bounds,
}: ScreenerParams): ExploreSearch => {
  const search: ExploreSearch = { ...bounds };
  if (sort !== defaultScreenerParams.sort) {
    search.sort = sort;
  }
  if (!descending) {
    search.order = "asc";
  }
  if (sector) {
    search.sector = sector;
  }
  return search;
};

/**
 * The asset page's "show more" motion: a strong ease-out, so it moves the
 * moment the tab's picked, then settles without overshoot.
 */
const revealTransition = {
  duration: 0.3,
  ease: [0.19, 1, 0.22, 1],
} as const;

/**
 * The filters growing in as "All" opens (and shrinking away as it closes),
 * fading as they go, so the list below moves rather than jumps. Clipped only
 * while it moves, and only at the bottom.
 */
const FiltersReveal = ({ children }: { children: ReactNode }) => {
  const reduceMotion = useReducedMotion();
  const [moving, setMoving] = useState(false);
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={reduceMotion ? { duration: 0 } : revealTransition}
      onAnimationStart={() => setMoving(true)}
      onAnimationComplete={() => setMoving(false)}
      {...stylex.props(moving && styles.filtersMoving)}
    >
      {/* The gap above the list is padding inside the animated height, so
          it closes with it. */}
      <div {...stylex.props(styles.filtersFrame)}>{children}</div>
    </motion.div>
  );
};

const ExplorePage = () => {
  const search = Route.useSearch();
  const selection = selectionOf(search);
  // One object per URL, so the list can tell a new order or filter apart
  // from a re-render.
  const params = useMemo(() => screenerParamsOf(search), [search]);
  const navigate = Route.useNavigate();
  // Not in the URL: it only narrows the rows already here, so typing
  // shouldn't count as a new order or filter.
  const [query, setQuery] = useState("");
  const setParams = (next: ScreenerParams) => {
    void navigate({ search: screenerSearchOf(next), replace: true });
  };
  return (
    <main {...stylex.props(styles.page)}>
      <h1 {...stylex.props(headings[20])}>Explore</h1>
      {/* Outside the list's boundary, so it stays put while a list loads. */}
      <ListPicker
        selection={selection}
        onSelect={(next) => {
          let nextSearch: ExploreSearch = {};
          if (next.kind === "popular") {
            nextSearch = { list: next.id };
          } else if (next.kind === "scan") {
            nextSearch = { scan: next.scan.id };
          }
          void navigate({ search: nextSearch, replace: true });
        }}
      />
      <AnimatePresence initial={false}>
        {selection.kind === "all" ? (
          <FiltersReveal key="filters">
            <ScreenerFilters
              params={params}
              onChange={setParams}
              query={query}
              onQueryChange={setQuery}
            />
          </FiltersReveal>
        ) : null}
      </AnimatePresence>
      <QueryBoundary
        // A fresh boundary per list, so a switch shows the skeleton again.
        // A new order or filter keeps the list, dimmed, until it's here.
        key={selectionKey(selection)}
        label="Loading list"
        skeleton={<ScanListSkeleton selection={selection} />}
      >
        {selection.kind === "all" ? (
          <AllList
            params={params}
            query={query}
            onSort={(sort, descending) =>
              setParams({ ...params, sort, descending })
            }
          />
        ) : (
          <ScanList selection={selection} />
        )}
      </QueryBoundary>
    </main>
  );
};

export const Route = createFileRoute("/_app/dashboard/explore/")({
  head: () => ({ meta: [{ title: "Explore · Nora" }] }),
  // `?list=<id>` for a popular list, `?scan=gainers` for a scan; "All" has
  // no parameter, or its order, sector and ranges:
  // `?sort=pe&order=asc&sector=…&peMax=30`.
  validateSearch: (search: ExploreSearchInput): ExploreSearch => {
    if (search.list) {
      return { list: String(search.list) };
    }
    const scan = exploreScans.find((option) => option.id === search.scan);
    if (scan) {
      return { scan: scan.id };
    }
    return screenerSearchOf({
      sort: isScreenerSortId(search.sort)
        ? search.sort
        : defaultScreenerParams.sort,
      descending: search.order !== "asc",
      sector: search.sector ? String(search.sector) : undefined,
      bounds: boundsOf(search),
    });
  },
  // The search is already only what the list depends on.
  loaderDeps: ({ search }) => search,
  // The dashboard layout has already checked the session. Not awaited, so
  // navigation is immediate; the list's skeleton shows while it loads.
  loader: ({ context, deps }) => {
    const selection = selectionOf(deps);
    if (selection.kind === "all") {
      void context.queryClient.prefetchQuery(exploreSectorsQuery);
    }
    void prefetchList(context.queryClient, selection, screenerParamsOf(deps));
  },
  component: ExplorePage,
});
