import * as stylex from "@stylexjs/stylex";

export const breakpoints = stylex.defineConsts({
  sm: "@media (width >= 640px)",
  md: "@media (width >= 768px)",
  lg: "@media (width >= 1024px)",
});

export const radius = stylex.defineConsts({
  sm: "4px",
  lg: "8px",
  full: "9999px",
});

/**
 * Tailwind's font-size scale (https://tailwindcss.com/docs/font-size), keyed
 * by its size in px: `fontSizes[16]` is 1rem (Tailwind's `text-base`).
 */
export const fontSizes = stylex.defineConsts({
  12: "0.75rem",
  14: "0.875rem",
  16: "1rem",
  18: "1.125rem",
  20: "1.25rem",
  24: "1.5rem",
  30: "1.875rem",
  36: "2.25rem",
  48: "3rem",
  60: "3.75rem",
  72: "4.5rem",
  96: "6rem",
  128: "8rem",
});

/** Unitless line height paired with each font size. */
export const fontSizeLineHeights = stylex.defineConsts({
  12: "calc(1 / .75)",
  14: "calc(1.25 / .875)",
  16: "calc(1.5 / 1)",
  18: "calc(1.75 / 1.125)",
  20: "calc(1.75 / 1.25)",
  24: "calc(2 / 1.5)",
  30: "calc(2.25 / 1.875)",
  36: "calc(2.5 / 2.25)",
  48: "1",
  60: "1",
  72: "1",
  96: "1",
  128: "1",
});

export const fonts = stylex.defineConsts({
  sans: "InterVariable, system-ui, sans-serif",
  mono: "PaperMono, ui-monospace, SFMono-Regular, Menlo, monospace",
});

/**
 * Radix dark gray, indigo, green and red (solid and alpha), black/white alpha,
 * and plain black/white. Display P3 with sRGB fallback.
 */
export const colors = stylex.defineVars({
  ...stylex.env.colors,
  black: "#000000",
  white: "#ffffff",
});

/** Fixed name, so the global `:focus-visible` rule in global.css can use it. */
export const focus = stylex.defineVars({
  "--focus-ring": colors.indigo9,
});

/** Fixed name, so the global `::selection` rule in global.css can use it. */
export const selection = stylex.defineVars({
  "--selection-text": colors.gray12,
});
