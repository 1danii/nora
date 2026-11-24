import * as stylex from "@stylexjs/stylex";

import { breakpoints, colors, radius } from "@/styles/tokens.stylex";

/**
 * Lists of assets, one row each, as Explore and the dashboard's holdings
 * draw them: logo, ticker and name, then figures in fixed-width columns
 * (set per list) that line up under a header row.
 */
export const listStyles = stylex.create({
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
});
