import { TriangleUpIcon } from "@radix-ui/react-icons";
import * as stylex from "@stylexjs/stylex";

import { percent, signedNumber } from "@/lib/format";
import { text } from "@/styles/text";
import { colors } from "@/styles/tokens.stylex";

const styles = stylex.create({
  change: {
    alignItems: "center",
    color: colors.gray11,
    display: "flex",
    fontVariantNumeric: "tabular-nums",
  },
  // Inside a pill, in the pill's own type and colour.
  // Top-aligned when it sits in a line of text (e.g. a skeleton's wrapper):
  // on the baseline the triangle, which has none, makes the line taller.
  figures: {
    alignItems: "center",
    display: "inline-flex",
    fontVariantNumeric: "tabular-nums",
    verticalAlign: "top",
  },
  // A space's width from the numbers.
  period: {
    marginLeft: stylex.env.spacing(1),
  },
  // Radix's triangles fill x 4–11 of a 15 wide box, so the negative margin
  // pulls the drawn left edge onto the container's; the right keeps 2px.
  // Turning between up and down is a quick vertical flip with a slight
  // overshoot, short so a move that flips back and forth never lags behind;
  // CSS transitions retarget from wherever they are when it changes mid-flip.
  trend: {
    flexShrink: 0,
    transitionDuration: {
      default: "100ms",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionProperty: "scale, translate, color",
    transitionTimingFunction: "cubic-bezier(0.175, 0.885, 0.32, 1.1)",
    height: stylex.env.spacing(4),
    marginLeft: "calc(16px * -4 / 15)",
    marginRight: stylex.env.spacing(0.5),
    width: stylex.env.spacing(4),
  },
  up: {
    color: colors.green9,
  },
  // The up triangle mirrored top to bottom over its box's middle. The up
  // one's drawn shape sits 0.8px above that middle, so the mirrored one
  // lands 0.8px below; 1.6px up puts it exactly where the up one is.
  down: {
    color: colors.red9,
    scale: "1 -1",
    translate: "0 -1.6px",
  },
});

/**
 * A green up or red down triangle, before a move's numbers: one icon that
 * flips over, so the change animates.
 */
export const Trend = ({ up }: { up: boolean }) => (
  <TriangleUpIcon
    aria-hidden="true"
    {...stylex.props(styles.trend, up ? styles.up : styles.down)}
  />
);

const formatSignedNumber = (change: number) => signedNumber.format(change);

/** "▲ +1.23 (0.52%)", in whatever type surrounds it, e.g. a pill. */
export const ChangeFigures = ({
  change,
  ratio,
  formatChange = formatSignedNumber,
}: {
  change: number;
  /** The move as a fraction of where it's measured from. */
  ratio: number;
  /** The change's own figure; a plain signed number unless given. */
  formatChange?: (change: number) => string;
}) => (
  <span {...stylex.props(styles.figures)}>
    <Trend up={change >= 0} />
    {formatChange(change)} ({percent.format(Math.abs(ratio))})
  </span>
);

/**
 * A move over a period, e.g. "▲ +1.23 (0.52%) Past year". Plain
 * text, not animated.
 */
export const PriceChange = ({
  change,
  ratio,
  period,
}: {
  change: number;
  /** The move as a fraction of where it's measured from. */
  ratio: number;
  period: string;
}) => (
  <span {...stylex.props(text[12], styles.change)}>
    <Trend up={change >= 0} />
    {signedNumber.format(change)} ({percent.format(Math.abs(ratio))})
    <span {...stylex.props(styles.period)}>{period}</span>
  </span>
);

/**
 * The change line as one run of text, so skullet draws a single bone like
 * other text rather than one each for the icon, numbers and period.
 */
export const changeSkeleton = (
  <span {...stylex.props(text[12], styles.change)}>+0.00 (0.00%) Today</span>
);
