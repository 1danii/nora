import type { IbkrHistory } from "@nora/ibkr/api-schemas";
import * as stylex from "@stylexjs/stylex";
import { areaY, defineChart, dot, lineY } from "@tanstack/charts";
import { decorative } from "@tanstack/charts/mark/decorative";
import { Chart } from "@tanstack/charts/react";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scaleUtc } from "@tanstack/charts/scales/time";

import { buttonLook } from "@/components/ui/button";
import { SkeletonBox } from "@/components/ui/skeleton";
import { colors } from "@/styles/tokens.stylex";

/**
 * The price chart's `hoverDot`: the same size and ring. Copied, as StyleX
 * only reads values defined in this file.
 */
const targetDot = {
  r: 5,
  stroke: colors.gray1,
  strokeWidth: 2.5,
};

/** Room at the sides for a dot and its ring on the first and last points. */
const dotReach = targetDot.r + targetDot.strokeWidth / 2;

/** As the price chart's part after a hovered point. */
const forecastOpacity = 0.5;

/** Unless the page asks for another, e.g. to match what sits beside it. */
const targetChartHeight = 200;

/** How far the highest and lowest prices sit inside the top and bottom. */
const priceInset = 12;

/** The price labels: the small button's height, and the least room between two. */
const labelHeight = 28;
const labelGap = 4;

/**
 * Where each label's centre goes, from where its target sits: as close as it
 * can be while keeping `labelGap` between labels and staying inside the
 * chart. Pushes them apart downwards first, then back up from the bottom.
 */
const spreadLabels = (centres: readonly number[], height: number) => {
  const step = labelHeight + labelGap;
  const order = centres
    .map((centre, index) => ({ centre, index }))
    .toSorted((a, b) => a.centre - b.centre);
  const placed: number[] = [];
  for (const [rank, { centre }] of order.entries()) {
    const previous = placed[rank - 1];
    placed.push(
      Math.max(
        centre,
        labelHeight / 2,
        previous === undefined ? 0 : previous + step
      )
    );
  }
  for (let rank = placed.length - 1; rank >= 0; rank -= 1) {
    const next = placed[rank + 1];
    placed[rank] = Math.min(
      placed[rank] ?? 0,
      height - labelHeight / 2,
      next === undefined ? Number.POSITIVE_INFINITY : next - step
    );
  }
  const result: number[] = [];
  for (const [rank, { index }] of order.entries()) {
    result[index] = placed[rank] ?? 0;
  }
  return result;
};

const styles = stylex.create({
  // The price chart's baseline: 0.5px whiteA2.
  // The chart, then the labels in a column as wide as the widest, its right
  // end the frame's.
  frame: {
    gap: labelGap,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    borderBottomColor: colors.whiteA2,
    borderBottomStyle: "solid",
    borderBottomWidth: "0.5px",
  },
  // Reaches out past the frame's left by the side margin, so the line starts
  // at its edge, as on the price chart; its right end is the dots' rings.
  chart: {
    marginInlineStart: -dotReach,
  },
  // All labels share one cell, so the column takes the widest one's width.
  labels: {
    display: "grid",
    justifyItems: "end",
  },
  // Level with its target's dot, right-aligned to the frame; the text in the
  // dot's colour.
  label: (top: number, color: string) => ({
    gridArea: "1 / 1",
    alignSelf: "start",
    color,
    fontVariantNumeric: "tabular-nums",
    pointerEvents: "none",
    transform: `translateY(calc(${top}px - 50%))`,
  }),
  skeleton: (height: number) => ({
    alignItems: "center",
    display: "flex",
    height,
  }),
});

/** One analysts' price target, in its colour. */
export interface ChartTarget {
  key: string;
  price: number;
  /** The price as shown in its label, e.g. "123.45". */
  label: string;
  color: string;
}

interface Row {
  date: Date;
  close: number;
}

/**
 * The past year's closes, then a dashed line from the latest close out to
 * each 12-month price target, dimmed like the price chart's part after a
 * hovered point, ending in a dot in the target's colour.
 */
export const PriceTargetChart = ({
  bars,
  targets,
  height = targetChartHeight,
}: {
  bars: IbkrHistory["data"];
  targets: readonly ChartTarget[];
  /** The chart's height in px, its bottom border not included. */
  height?: number;
}) => {
  const rows: Row[] = bars.map((bar) => ({
    date: new Date(bar.t),
    close: bar.c,
  }));
  const latest = rows.at(-1);
  if (!latest) {
    return null;
  }
  // A year on from the latest close: what the targets are for.
  const horizon = new Date(latest.date);
  horizon.setUTCFullYear(horizon.getUTCFullYear() + 1);
  const prices = [
    ...rows.map((row) => row.close),
    ...targets.map((target) => target.price),
  ];
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const span = high - low;
  // The price at the chart's bottom edge, where the fill fades out.
  // `priceInset` as a share of the price range, as the scale's ends are
  // prices.
  const pricePadding = priceInset / (height - 2 * priceInset);
  const floor = low - span * pricePadding;
  const ceiling = high + span * pricePadding;
  // Each label next to its target's dot, by the chart's own scale, then
  // spread so none overlap.
  const labelTops = spreadLabels(
    targets.map((target) =>
      ceiling > floor
        ? ((ceiling - target.price) / (ceiling - floor)) * height
        : height / 2
    ),
    height
  );
  const definition = defineChart({
    marks: [
      // As the price chart's fill before it took the trend's colour.
      decorative(
        areaY(rows, {
          x: "date",
          y1: floor,
          y2: "close",
          fill: "url(#target-history-fill)",
          fillOpacity: 1,
        })
      ),
      decorative(
        lineY(rows, {
          x: "date",
          y: "close",
          stroke: colors.gray9,
          strokeWidth: 1,
          lineJoin: "miter",
        })
      ),
      ...targets.flatMap((target) => {
        const end = { date: horizon, close: target.price };
        return [
          decorative(
            lineY([latest, end], {
              x: "date",
              y: "close",
              stroke: target.color,
              strokeOpacity: forecastOpacity,
              strokeWidth: 1,
              strokeDasharray: "4 4",
              // Square dash ends: the line's own default rounds them.
              lineCap: "butt",
            })
          ),
          decorative(
            dot([end], {
              x: "date",
              y: "close",
              ...targetDot,
              fill: target.color,
            })
          ),
        ];
      }),
      // Where the forecast starts: today's price.
      decorative(
        dot([latest], {
          x: "date",
          y: "close",
          ...targetDot,
          fill: colors.gray9,
        })
      ),
    ],
    scales: {
      x: {
        scale: scaleUtc().domain([rows[0]?.date ?? latest.date, horizon]),
        axis: false,
      },
      y: {
        scale: scaleLinear().domain([floor, ceiling]),
        axis: false,
      },
    },
    // grayA3 at the history's top, fading out at the bottom edge.
    gradients: [
      {
        id: "target-history-fill",
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 1,
        stops: [
          { offset: 0, color: colors.grayA3, opacity: 1 },
          { offset: 1, color: colors.grayA3, opacity: 0 },
        ],
      },
    ],
    margin: { top: 0, right: dotReach, bottom: 0, left: dotReach },
    keyboard: false,
  });
  const summary = targets
    .map((target) => `${target.key} ${target.price}`)
    .join(", ");
  return (
    <div {...stylex.props(styles.frame)}>
      <div {...stylex.props(styles.chart)}>
        <Chart
          ariaLabel={`Past year's closing price and 12-month price targets: ${summary}`}
          definition={definition}
          height={height}
          // For the server render: three of the price targets grid's four
          // columns, less a label's rough width.
          initialWidth={560 - 64 + dotReach}
        />
      </div>
      {/* The chart's label already lists them. */}
      <div aria-hidden="true" {...stylex.props(styles.labels)}>
        {targets.map((target, index) => (
          <span
            key={target.key}
            {...stylex.props(
              ...buttonLook("outline", "sm"),
              styles.label(labelTops[index] ?? 0, target.color)
            )}
          >
            {target.label}
          </span>
        ))}
      </div>
    </div>
  );
};

/** A flat line across the middle while the history loads. */
const PriceTargetChartSkeleton = ({
  height = targetChartHeight,
}: {
  /** As the chart's. */
  height?: number;
}) => (
  <div {...stylex.props(styles.frame)}>
    <div {...stylex.props(styles.skeleton(height))}>
      <SkeletonBox height={2} radius={0} width="100%" />
    </div>
  </div>
);

PriceTargetChart.Skeleton = PriceTargetChartSkeleton;
