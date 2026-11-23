import {
  blackA,
  blackP3A,
  grayDark,
  grayDarkA,
  grayDarkP3,
  grayDarkP3A,
  greenDark,
  greenDarkA,
  greenDarkP3,
  greenDarkP3A,
  indigoDark,
  indigoDarkA,
  indigoDarkP3,
  indigoDarkP3A,
  redDark,
  redDarkA,
  redDarkP3,
  redDarkP3A,
  whiteA,
  whiteP3A,
} from "@radix-ui/colors";

/** Wide-gamut values replace the sRGB ones where the browser can parse them. */
const P3 = "@supports (color: color(display-p3 1 1 1))";

type ColorToken = Record<"default" | typeof P3, string>;

type Scale<Step extends string> = Record<Step, string>;

/** One token per step: the sRGB value, overridden by its P3 twin where supported. */
const scale = <Step extends string>(srgb: Scale<Step>, p3: Scale<Step>) =>
  // SAFETY: Radix scales are plain objects whose own keys are exactly their steps,
  // and fromEntries gets one entry per step.
  Object.fromEntries(
    (Object.keys(srgb) as Step[]).map((step) => [
      step,
      { default: srgb[step], [P3]: p3[step] },
    ])
  ) as Record<Step, ColorToken>;

/**
 * Radix color tokens, passed to StyleX as `stylex.env.colors` (vite.config.ts)
 * and turned into CSS variables by `colors` in tokens.stylex.ts.
 * The app is dark-only, so only the dark scales are used.
 */
export const radixColors = {
  ...scale(grayDark, grayDarkP3),
  ...scale(grayDarkA, grayDarkP3A),
  ...scale(indigoDark, indigoDarkP3),
  ...scale(indigoDarkA, indigoDarkP3A),
  ...scale(greenDark, greenDarkP3),
  ...scale(greenDarkA, greenDarkP3A),
  ...scale(redDark, redDarkP3),
  ...scale(redDarkA, redDarkP3A),
  ...scale(blackA, blackP3A),
  ...scale(whiteA, whiteP3A),
};
