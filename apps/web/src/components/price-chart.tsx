import type { IbkrHistory } from "@nora/ibkr/api-schemas";
import * as stylex from "@stylexjs/stylex";
import { areaY, defineChart, lineY } from "@tanstack/charts";
import type { ChartInteractionController } from "@tanstack/charts";
import { crosshair } from "@tanstack/charts/crosshair";
import { decorative } from "@tanstack/charts/mark/decorative";
import { Chart } from "@tanstack/charts/react";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scaleUtc } from "@tanstack/charts/scales/time";
import { useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { ChangeFigures } from "@/components/price-change";
import { buttonLook } from "@/components/ui/button";
import { SkeletonBox } from "@/components/ui/skeleton";
import { colors } from "@/styles/tokens.stylex";

/** Drawn in its point's line colour, ringed in the page background. */
const hoverDot = {
  r: 5,
  stroke: colors.gray1,
  strokeWidth: 2.5,
};

/**
 * Green when the price is up over the timeframe, red when it's down, as
 * other stock apps colour it; it stays put while hovering. Extended hours
 * are grey, in the same steps, so only regular hours carry the trend.
 */
const extended = {
  extendedLine: colors.gray9,
  extendedFill: colors.grayA3,
};
const tones = {
  up: { line: colors.green9, fill: colors.greenA3, ...extended },
  down: { line: colors.red9, fill: colors.redA3, ...extended },
};

export type Trend = keyof typeof tones;

/**
 * The part of the line after the hovered point, or outside a dragged
 * selection.
 */
const dimmedOpacity = 0.5;

/**
 * How far the hover dot reaches from its centre, ring included: the chart's
 * side margins, so a dot on the first or last close stays inside. The chart
 * reaches out past the frame by as much, so the line itself spans the frame,
 * ending where the bottom border does.
 */
const dotReach = hoverDot.r + hoverDot.strokeWidth / 2;

/** The date pill's rounded ends: half its height, the small button's 28px. */
const dateRadius = 14;

/**
 * Room at the chart's top for the hovered point's date: the pill's height.
 * Inside the chart rather than above it, so the hover lines, which run the
 * chart's full height, reach the top.
 */
const dateRoom = 28;

/** The closes' part of the chart, below the date's room. */
const priceChartHeight = 240;

/** Shared with the skeleton, so the reveal doesn't resize. */
const chartHeight = dateRoom + priceChartHeight;

/**
 * The highest and lowest closes sit 15px inside the closes' part of the chart:
 * room for the hover dot (radius 5 and its ring) and a gap, clear of the
 * date pill above. As a share of the price range, since the scale's ends are
 * prices: 15px over the 210px the closes span.
 */
const pricePadding = 15 / (priceChartHeight - 2 * 15);

/**
 * Tailwind's ping: the dot's colour grows to twice its size and fades,
 * every second, while a day is still trading.
 */
const ping = stylex.keyframes({
  "75%, 100%": { opacity: 0, transform: "scale(2)" },
});

const styles = stylex.create({
  // A baseline under the chart, like the page's other borders (the divider,
  // inputs): 0.5px whiteA2. On the skeleton too, so the reveal doesn't shift.
  frame: {
    position: "relative",
    borderBottomColor: colors.whiteA2,
    borderBottomStyle: "solid",
    borderBottomWidth: "0.5px",
  },
  // The line in the middle of the whole chart, the date's room included.
  skeleton: {
    alignItems: "center",
    display: "flex",
    height: chartHeight,
  },
  // The chart's own box, for placing the ping by the same sums the chart
  // uses. Under the chart, so the line and the dot's ring draw over it.
  pingLayer: {
    pointerEvents: "none",
    position: "absolute",
    height: chartHeight,
    left: -dotReach,
    right: -dotReach,
    top: 0,
  },
  // Horizontal drags select a period rather than scroll, on touch too.
  chart: {
    marginInline: -dotReach,
    position: "relative",
    touchAction: "pan-y",
  },
  // A hover dot over the chart: its colour, ringed in the page background,
  // the ring's outer edge where the chart's own focus ring would reach.
  // Hidden until the focus callback places it, by `translate`.
  dot: {
    borderColor: colors.gray1,
    borderRadius: "50%",
    borderStyle: "solid",
    borderWidth: hoverDot.strokeWidth,
    backgroundColor: colors.gray1,
    boxSizing: "border-box",
    position: "absolute",
    visibility: "hidden",
    height: 2 * dotReach,
    left: 0,
    top: 0,
    width: 2 * dotReach,
  },
  anchorDot: (spot: { x: number; y: number }, color: string) => ({
    backgroundColor: color,
    translate: `${spot.x - dotReach}px ${spot.y - dotReach}px`,
    visibility: "visible",
  }),
  // Where a day in progress has got to, while nothing is hovered: placed by
  // the same sums as the ping, centred by margins.
  latestDot: (left: string, top: number, color: string) => ({
    backgroundColor: color,
    visibility: "visible",
    left,
    marginLeft: -dotReach,
    marginTop: -dotReach,
    top,
  }),
  // Where a drag started: a line like the chart's hover line.
  anchorRule: (x: number) => ({
    backgroundColor: colors.whiteA2,
    position: "absolute",
    bottom: 0,
    left: x - 0.25,
    top: 0,
    width: 0.5,
  }),
  // As big as the dot's coloured part, centred by margins, as the
  // animation owns `transform`.
  ping: (left: string, top: number, color: string) => ({
    borderRadius: "50%",
    animationDuration: {
      default: "1s",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    animationIterationCount: "infinite",
    animationName: ping,
    animationTimingFunction: "cubic-bezier(0, 0, 0.2, 1)",
    backgroundColor: color,
    position: "absolute",
    height: 2 * hoverDot.r,
    left,
    marginLeft: -hoverDot.r,
    marginTop: -hoverDot.r,
    top,
    width: 2 * hoverDot.r,
  }),
  // Over the chart, covering the hover line's top end. Centred on the hover
  // line (or a period's middle) until near a corner, then stops where the
  // line meets the start of its rounded end, sticking out past the frame by
  // that rounding. `inset` is how near an edge its centre may come: half its
  // width less a rounded end. Tabular digits, so scrubbing doesn't make it
  // wobble as they change.
  date: (x: number, inset: number) => ({
    fontVariantNumeric: "tabular-nums",
    pointerEvents: "none",
    position: "absolute",
    transform: "translateX(-50%)",
    left: `clamp(${inset}px, ${x}px, calc(100% - ${inset}px))`,
    top: 0,
  }),
});

/** A hovered bar: its start time in epoch ms and its close. */
export interface HoveredBar {
  time: number;
  close: number;
}

interface Row {
  /** When the bar is, for its label and the session's hours. */
  date: Date;
  /**
   * Where it's drawn: its time across a day's fixed span, else evenly after
   * the bar before, so nights and weekends leave no gaps, as stock apps draw
   * several days. Hover and drag work in this.
   */
  x: Date;
  close: number;
}

/**
 * A stretch of the line drawn one way: in or outside regular hours.
 */
interface Run {
  extended: boolean;
  rows: Row[];
}

/**
 * Splits the line where its colour changes. Each run starts at the previous
 * run's last point, so the line stays joined; the joining segment takes the
 * colour of the point it leads to.
 */
const runsOf = (rows: readonly Row[], isExtended: (date: Date) => boolean) => {
  const runs: Run[] = [];
  let previous: Row | undefined;
  for (const row of rows) {
    const outsideHours = isExtended(row.date);
    const run = runs.at(-1);
    if (run && run.extended === outsideHours) {
      run.rows.push(row);
    } else {
      runs.push({
        extended: outsideHours,
        rows: previous ? [previous, row] : [row],
      });
    }
    previous = row;
  }
  return runs;
};

/**
 * A dragged period, once the drag has moved off its starting point:
 * earliest end first.
 */
const periodOf = (start: Row | undefined, end: Row | undefined) => {
  if (!start || !end || start.x.getTime() === end.x.getTime()) {
    return;
  }
  return start.x < end.x ? { from: start, to: end } : { from: end, to: start };
};

/** A point on the chart, in px from the chart's top left. */
interface Spot {
  x: number;
  y: number;
}

/**
 * The mask that dims the line outside `[from, to]` (px across the chart):
 * half-transparent there, as `dimmedOpacity`, so the line and its fill fade
 * together.
 */
const dimMask = (from: number, to: number) => {
  const dim = `rgb(0 0 0 / ${dimmedOpacity})`;
  return `linear-gradient(to right, ${dim} ${from}px, #000 ${from}px, #000 ${to}px, ${dim} ${to}px)`;
};

/**
 * Everything drawn from the bars alone: the rows, the price range and the
 * chart's definition. Read through `usePriceDrawing`.
 */
const drawingOf = (
  bars: IbkrHistory["data"],
  timeDomain: readonly [Date, Date] | undefined,
  extendedHours: readonly { from: Date; to: Date }[] | undefined,
  trend: Trend
) => {
  const rows: Row[] = bars.map((bar, index) => ({
    date: new Date(bar.t),
    // One step per bar; only their order and spacing matter.
    x: new Date(timeDomain ? bar.t : index),
    close: bar.c,
  }));
  const low = Math.min(...rows.map((row) => row.close));
  const high = Math.max(...rows.map((row) => row.close));
  // The price at the chart's bottom edge, below the lowest close.
  const floor = low - (high - low) * pricePadding;
  const latest = rows.at(-1);
  const tone = tones[trend];
  const isExtended = (date: Date) =>
    extendedHours?.some(({ from, to }) => date >= from && date < to) ?? false;
  const lineColor = (row: Row | undefined) =>
    row && isExtended(row.date) ? tone.extendedLine : tone.line;
  const runs = runsOf(rows, isExtended);
  // A day still trading: the line stops short of the chart's right edge.
  const inProgress =
    timeDomain !== undefined &&
    latest !== undefined &&
    latest.x < timeDomain[1];
  // The price at the top of the closes' part, above the highest close.
  const ceiling = high + (high - low) * pricePadding;
  // The price at the chart's top edge, above the date's room.
  const chartTop = ceiling + ((ceiling - floor) * dateRoom) / priceChartHeight;
  // Where the chart draws the latest close, by its own scales: across the
  // time domain between the side margins, and down from the date's room.
  const latestAt =
    inProgress && latest
      ? {
          left: `calc(${dotReach}px + (100% - ${2 * dotReach}px) * ${
            (latest.x.getTime() - timeDomain[0].getTime()) /
            (timeDomain[1].getTime() - timeDomain[0].getTime())
          })`,
          top:
            dateRoom +
            priceChartHeight *
              (ceiling > floor
                ? (ceiling - latest.close) / (ceiling - floor)
                : 0.5),
          color: lineColor(latest),
        }
      : undefined;
  const definition = defineChart({
    marks: [
      // Hovering finds the points of this one unseen line; everything drawn
      // is decorative.
      lineY(rows, { x: "x", y: "close", strokeOpacity: 0 }),
      ...runs.flatMap((run, index) => [
        decorative(
          areaY(run.rows, {
            x: "x",
            // Down to the bottom edge, so the fade ends there.
            y1: floor,
            y2: "close",
            fill: `url(#price-fill-${index})`,
            fillOpacity: 1,
          })
        ),
        decorative(
          lineY(run.rows, {
            x: "x",
            y: "close",
            stroke: run.extended ? tone.extendedLine : tone.line,
            strokeWidth: 1,
            lineJoin: "miter",
          })
        ),
      ]),
      // The hovered point's vertical line, through the date's room to the
      // chart's top, where the pill covers it. Painted by the chart from its
      // own focus, without rebuilding the line. The page's border colour,
      // whatever the line's colour.
      crosshair({
        x: { stroke: colors.whiteA2, strokeOpacity: 1, strokeWidth: 0.5 },
        y: false,
      }),
    ],
    scales: {
      x: {
        scale: timeDomain ? scaleUtc().domain(timeDomain) : scaleUtc,
        axis: false,
      },
      y: {
        // Padding above and below the closes, and the date's room, in the
        // scale rather than the margin, so the hover line still runs the
        // chart's full height.
        scale:
          rows.length > 0
            ? scaleLinear().domain([floor, chartTop])
            : scaleLinear,
        axis: false,
      },
    },
    // One fade per run, top to bottom: the alpha colour (which carries its
    // own opacity) to transparent. Each fills its own run's box, so it starts
    // part-way into the fade, keeping the runs one continuous fill.
    gradients: runs.map((run, index) => {
      const top = Math.max(...run.rows.map((row) => row.close));
      const reach = high > floor ? (top - floor) / (high - floor) : 1;
      const color = run.extended ? tone.extendedFill : tone.fill;
      return {
        id: `price-fill-${index}`,
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 1,
        stops: [
          { offset: 0, color, opacity: reach },
          { offset: 1, color, opacity: 0 },
        ],
      };
    }),
    // The scale keeps the closes clear of the date and the bottom edge. At
    // the sides, room for the hover dot on the first and last close.
    margin: { top: 0, right: dotReach, bottom: 0, left: dotReach },
    // No tooltip and no keyboard stop. The hover dot is ours, over the
    // chart, so it takes extended hours' colour without a new definition.
    keyboard: false,
    pointer: false,
    focusRing: false,
  });
  return { rows, lineColor, latestAt, definition };
};

/**
 * `drawingOf`, memoized on its arguments. Through `useMemo` so the React
 * Compiler treats the result as frozen: built in the component, any later
 * use the compiler can't prove is a read (`rows.find`, calling `lineColor`,
 * a handler that captures them) ties it to the hover state, and the whole
 * chart is rebuilt on every pointer move.
 */
const usePriceDrawing = (
  bars: IbkrHistory["data"],
  timeDomain: readonly [Date, Date] | undefined,
  extendedHours: readonly { from: Date; to: Date }[] | undefined,
  trend: Trend
) =>
  useMemo(
    () => drawingOf(bars, timeDomain, extendedHours, trend),
    [bars, timeDomain, extendedHours, trend]
  );

/**
 * Closing prices as a bare line over a fill that fades out towards the
 * period's low: no axes, grid lines or tooltip; hovering marks the nearest close.
 * Coloured by `trend`; extended hours are grey, and the part
 * after a hovered point is at half opacity. Dragging selects a period: a
 * second line marks where the drag started, everything outside the period
 * is dimmed, and the pill over its middle shows its dates and the move
 * across it.
 *
 * The chart's definition never depends on the hover, so moving the pointer
 * never redraws the line. The chart paints the hover line itself (a
 * `crosshair`, from its own focus); the hover dot and the dimming are set
 * straight on their elements from the focus callback, and only the pill
 * re-renders.
 */
export const PriceChart = ({
  bars,
  label,
  timeDomain,
  extendedHours,
  trend = "up",
  formatDate,
  onHoverChange,
}: {
  bars: IbkrHistory["data"];
  /** The timeframe, e.g. "1Y". */
  label: string;
  /**
   * The time span the chart covers, when it's more than the bars: a day in
   * progress only fills up to the latest bar.
   */
  timeDomain?: readonly [Date, Date];
  /** Pre-market and after-hours stretches, drawn in grey. */
  extendedHours?: readonly { from: Date; to: Date }[];
  /** Up or down over the whole timeframe; hovering doesn't change it. */
  trend?: Trend;
  /** A point's time, shown above it; a dragged period shows its two ends. */
  formatDate?: (date: Date) => string;
  /** The hovered bar, or null once nothing is hovered. */
  onHoverChange?: (bar: HoveredBar | null) => void;
}) => {
  // The hovered bar, while a point is hovered. Kept as the row itself, so
  // rendering never searches `rows`: the compiler can't tell a search from a
  // change, and would rebuild the chart on every hover. The same row again
  // changes nothing.
  const [hoveredRow, setHoveredRow] = useState<Row | null>(null);
  // Its position across the chart, in px from the left edge.
  const [hoveredX, setHoveredX] = useState(0);
  // Where a drag started, while the pointer is held down: its bar and spot.
  const [anchor, setAnchor] = useState<({ row: Row } & Spot) | null>(null);
  // The date pill's width, as its text changes, to keep it inside the frame.
  const [dateWidth, setDateWidth] = useState(0);
  // The same, for the focus callback, which paints without a render.
  const anchorSpot = useRef<Spot | null>(null);
  // The hovered point's spot and colour, to repaint when a drag ends.
  const focused = useRef<(Spot & { color: string }) | null>(null);
  const chartBox = useRef<HTMLDivElement>(null);
  const focusDot = useRef<HTMLDivElement>(null);
  // The chart's own focus controller, to drive hover from our pointer
  // handlers: with `pointer: false` the chart leaves the pointer to us, so a
  // drag keeps going outside it and a click never pins a point.
  const interaction = useRef<ChartInteractionController<
    Row,
    Date,
    number
  > | null>(null);
  const { rows, lineColor, latestAt, definition } = usePriceDrawing(
    bars,
    timeDomain,
    extendedHours,
    trend
  );
  // Focuses the close nearest the pointer, as the chart's own hover would.
  // Past the end of a day in progress there's no close to hover, so nothing
  // is focused there, unless a drag is under way: that keeps its last close.
  const clearFocus = () => interaction.current?.setControlledFocus(null);
  const focusAt = (clientX: number, clientY: number) => {
    const resolved = interaction.current?.resolvePointer(clientX, clientY);
    const box = chartBox.current?.getBoundingClientRect();
    const latest = rows.at(-1);
    if (
      resolved &&
      box &&
      latestAt &&
      latest &&
      anchorSpot.current === null &&
      Number(resolved.point.xValue) === latest.x.getTime() &&
      clientX - box.left > resolved.point.x + dotReach
    ) {
      clearFocus();
      return;
    }
    if (resolved) {
      interaction.current?.setControlledFocus(resolved, { source: "pointer" });
    }
    return resolved?.point;
  };
  // Moves the hover dot and the dimming to the focused point, straight on
  // their elements: everything after it is dimmed, or everything outside a
  // dragged period.
  const paintFocus = () => {
    const dot = focusDot.current;
    const box = chartBox.current;
    const spot = focused.current;
    if (!dot || !box) {
      return;
    }
    if (!spot) {
      dot.style.visibility = "";
      box.style.maskImage = "";
      return;
    }
    dot.style.visibility = "visible";
    dot.style.translate = `${spot.x - dotReach}px ${spot.y - dotReach}px`;
    dot.style.backgroundColor = spot.color;
    const start = anchorSpot.current?.x ?? 0;
    box.style.maskImage = dimMask(
      Math.min(start, spot.x),
      Math.max(start, spot.x)
    );
  };
  const measureDate = (pill: HTMLSpanElement | null) => {
    if (!pill) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        // Before this frame paints, so the pill never shows a frame
        // clamped by its old width.
        flushSync(() => {
          setDateWidth(entry.borderBoxSize[0]?.inlineSize ?? 0);
        });
      }
    });
    observer.observe(pill);
    return () => observer.disconnect();
  };
  const selection = periodOf(anchor?.row, hoveredRow ?? undefined);
  // Pings where a day in progress has got to, until a hover moves the dot
  // elsewhere.
  const pingAt = hoveredRow === null ? latestAt : undefined;
  return (
    <div {...stylex.props(styles.frame)}>
      {pingAt ? (
        <div aria-hidden="true" {...stylex.props(styles.pingLayer)}>
          <div
            {...stylex.props(
              styles.ping(pingAt.left, pingAt.top, pingAt.color)
            )}
          />
        </div>
      ) : null}
      <div
        onPointerMove={(event) => {
          focusAt(event.clientX, event.clientY);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          const point = focusAt(event.clientX, event.clientY);
          if (!point) {
            return;
          }
          // No text selection while dragging.
          if (event.pointerType === "mouse") {
            event.preventDefault();
          }
          // Keeps the drag's moves coming once it leaves the chart.
          event.currentTarget.setPointerCapture(event.pointerId);
          const row = rows.find(
            (candidate) => candidate.x.getTime() === Number(point.xValue)
          );
          if (!row) {
            return;
          }
          anchorSpot.current = { x: point.x, y: point.y };
          setAnchor({ row, x: point.x, y: point.y });
        }}
        onPointerUp={(event) => {
          anchorSpot.current = null;
          setAnchor(null);
          paintFocus();
          // Released outside the chart: nothing is hovered any more.
          const box = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          ) {
            clearFocus();
          }
        }}
        onPointerCancel={() => {
          anchorSpot.current = null;
          setAnchor(null);
          clearFocus();
        }}
        onPointerLeave={() => {
          // A captured drag keeps its focus until it's released.
          if (anchorSpot.current === null) {
            clearFocus();
          }
        }}
        ref={chartBox}
        {...stylex.props(styles.chart)}
      >
        <Chart
          ariaLabel={`Closing price, ${label}`}
          onFocusChange={(point) => {
            const position = point ? Number(point.xValue) : null;
            const bar = rows.find((row) => row.x.getTime() === position);
            focused.current =
              point && bar
                ? { x: point.x, y: point.y, color: lineColor(bar) }
                : null;
            paintFocus();
            // Rendered now rather than in React's next task, which runs
            // after the browser paints: otherwise the pill and the quote
            // land a frame after the dot and the line, on every move.
            flushSync(() => {
              setHoveredRow(bar ?? null);
              if (point) {
                // From the chart's edge to the frame's.
                setHoveredX(point.x - dotReach);
              }
              onHoverChange?.(
                bar ? { time: bar.date.getTime(), close: bar.close } : null
              );
            });
          }}
          onRender={(context) => {
            interaction.current = context.interaction;
          }}
          definition={definition}
          height={chartHeight}
          // For the server render: the asset page's main column, eight of the
          // dashboard's 1304px content in twelve columns with 40px gaps, and
          // the margins the chart reaches out past it.
          initialWidth={856 + 2 * dotReach}
        />
      </div>
      <div aria-hidden="true" {...stylex.props(styles.pingLayer)}>
        {/* A selection's start: its line and dot, as the hovered end has. */}
        {selection && anchor ? (
          <>
            <div {...stylex.props(styles.anchorRule(anchor.x))} />
            <div
              {...stylex.props(
                styles.dot,
                styles.anchorDot(anchor, lineColor(anchor.row))
              )}
            />
          </>
        ) : null}
        {pingAt ? (
          <div
            {...stylex.props(
              styles.dot,
              styles.latestDot(pingAt.left, pingAt.top, pingAt.color)
            )}
          />
        ) : null}
        <div ref={focusDot} {...stylex.props(styles.dot)} />
      </div>
      {hoveredRow !== null && (selection || formatDate) ? (
        // One pill for a hovered point and a dragged period. A period's sits
        // over its middle: the move across it, then its dates. The chart
        // announces the focused point itself.
        <span
          aria-hidden="true"
          ref={measureDate}
          {...stylex.props(
            ...buttonLook("outline", "sm"),
            styles.date(
              selection && anchor
                ? (anchor.x - dotReach + hoveredX) / 2
                : hoveredX,
              dateWidth / 2 - dateRadius
            )
          )}
        >
          {selection ? (
            <>
              <ChangeFigures
                change={selection.to.close - selection.from.close}
                base={selection.from.close}
              />
              {formatDate
                ? `${formatDate(selection.from.date)} – ${formatDate(selection.to.date)}`
                : null}
            </>
          ) : (
            hoveredRow && formatDate?.(hoveredRow.date)
          )}
        </span>
      ) : null}
    </div>
  );
};

/**
 * Skullet draws this in place of the chart while it loads: a flat line
 * across the middle of the frame, the date's room included. 2px is the
 * thinnest it draws; it skips anything 1px tall or less.
 */
const PriceChartSkeleton = () => (
  <div {...stylex.props(styles.frame)}>
    <div {...stylex.props(styles.skeleton)}>
      <SkeletonBox height={2} radius={0} width="100%" />
    </div>
  </div>
);

PriceChart.Skeleton = PriceChartSkeleton;
