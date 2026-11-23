import * as stylex from "@stylexjs/stylex";

import { fontSizeLineHeights, fontSizes } from "./tokens.stylex";

/**
 * Body text sizes as full text styles, keyed by size in px:
 * `stylex.props(text[14])`.
 */
export const text = stylex.create({
  12: {
    fontSize: fontSizes[12],
    lineHeight: fontSizeLineHeights[12],
  },
  14: {
    fontSize: fontSizes[14],
    lineHeight: fontSizeLineHeights[14],
  },
  16: {
    fontSize: fontSizes[16],
    lineHeight: fontSizeLineHeights[16],
  },
  18: {
    fontSize: fontSizes[18],
    lineHeight: fontSizeLineHeights[18],
  },
  20: {
    fontSize: fontSizes[20],
    lineHeight: fontSizeLineHeights[20],
  },
  24: {
    fontSize: fontSizes[24],
    lineHeight: fontSizeLineHeights[24],
  },
});

/**
 * Heading sizes, keyed by size in px: `stylex.props(headings[72])`. Set
 * lighter and tighter than body text.
 */
export const headings = stylex.create({
  16: {
    fontSize: fontSizes[16],
    fontWeight: 550,
    letterSpacing: "-0.02em",
    lineHeight: fontSizeLineHeights[16],
  },
  18: {
    fontSize: fontSizes[18],
    fontWeight: 550,
    letterSpacing: "-0.02em",
    lineHeight: fontSizeLineHeights[18],
  },
  20: {
    fontSize: fontSizes[20],
    fontWeight: 550,
    letterSpacing: "-0.02em",
    lineHeight: fontSizeLineHeights[20],
  },
  24: {
    fontSize: fontSizes[24],
    fontWeight: 550,
    letterSpacing: "-0.02em",
    lineHeight: fontSizeLineHeights[24],
  },
  30: {
    fontSize: fontSizes[30],
    fontWeight: 550,
    letterSpacing: "-0.02em",
    lineHeight: fontSizeLineHeights[30],
  },
  36: {
    fontSize: fontSizes[36],
    fontWeight: 550,
    letterSpacing: "-0.02em",
    lineHeight: fontSizeLineHeights[36],
  },
  48: {
    fontSize: fontSizes[48],
    fontWeight: 550,
    letterSpacing: "-0.02em",
    lineHeight: fontSizeLineHeights[48],
  },
  60: {
    fontSize: fontSizes[60],
    fontWeight: 550,
    letterSpacing: "-0.02em",
    lineHeight: fontSizeLineHeights[60],
  },
  72: {
    fontSize: fontSizes[72],
    fontWeight: 550,
    letterSpacing: "-0.02em",
    lineHeight: fontSizeLineHeights[72],
  },
  96: {
    fontSize: fontSizes[96],
    fontWeight: 550,
    letterSpacing: "-0.02em",
    lineHeight: fontSizeLineHeights[96],
  },
  128: {
    fontSize: fontSizes[128],
    fontWeight: 550,
    letterSpacing: "-0.02em",
    lineHeight: fontSizeLineHeights[128],
  },
});
