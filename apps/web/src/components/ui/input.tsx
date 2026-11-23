import { Input as InputPrimitive } from "@base-ui/react/input";
import * as stylex from "@stylexjs/stylex";
import { useHotkey } from "@tanstack/react-hotkeys";
import type { RegisterableHotkey } from "@tanstack/react-hotkeys";
import { useRef } from "react";
import type { ComponentType } from "react";

import { Hotkey } from "@/components/ui/kbd";
import {
  colors,
  fontSizeLineHeights,
  fontSizes,
  radius,
} from "@/styles/tokens.stylex";

const styles = stylex.create({
  base: {
    borderRadius: radius.lg,
    outline: {
      default: null,
      ":focus-visible": "1px solid transparent",
    },
    backgroundColor: colors.gray2,
    // Invalid keeps the thin red border; the red halo only shows on focus.
    boxShadow: {
      '[aria-invalid="true"]': `0 0 0 0.5px ${colors.red9}, 0 0 0 0 ${colors.redA3}`,
      default: `0 0 0 0.5px ${colors.whiteA2}, 0 0 0 0 ${colors.indigoA3}`,
      ":focus-visible": {
        '[aria-invalid="true"]': `0 0 0 0.5px ${colors.red9}, 0 0 0 4px ${colors.redA3}`,
        default: `0 0 0 0.5px ${colors.indigo9}, 0 0 0 4px ${colors.indigoA3}`,
      },
    },
    color: colors.gray12,
    // No pointer-events: none here, so the not-allowed cursor still shows.
    cursor: {
      default: null,
      ":disabled": "not-allowed",
    },
    fontSize: fontSizes[14],
    lineHeight: fontSizeLineHeights[14],
    opacity: {
      default: null,
      ":disabled": 0.5,
    },
    transitionDuration: {
      default: "100ms",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionProperty: "box-shadow, opacity",
    // Opacity (disabled) keeps the default easing.
    transitionTimingFunction: "ease-out, ease",
    minWidth: 0,
    width: "100%",
    // No native clear (×) on a search; Escape still clears it.
    "::-webkit-search-cancel-button": {
      appearance: "none",
    },
    "::placeholder": {
      color: colors.whiteA6,
    },
  },
});

const sizes = stylex.create({
  default: {
    paddingInline: stylex.env.spacing(3),
    height: stylex.env.spacing(9),
  },
  lg: {
    paddingInline: stylex.env.spacing(4),
    height: stylex.env.spacing(11),
  },
});

/**
 * With a leading icon: the icon sits in the size's padding, and the text
 * starts a gap after it.
 */
const iconSizes = stylex.create({
  default: {
    paddingInlineStart: `calc(${stylex.env.spacing(3)} + 1em + ${stylex.env.spacing(2)})`,
  },
  lg: {
    paddingInlineStart: `calc(${stylex.env.spacing(4)} + 1em + ${stylex.env.spacing(2)})`,
  },
});

const iconOffsets = stylex.create({
  default: {
    insetInlineStart: stylex.env.spacing(3),
  },
  lg: {
    insetInlineStart: stylex.env.spacing(4),
  },
});

const iconStyles = stylex.create({
  // Takes the input's place in the layout, so `style` sizes it.
  wrapper: {
    alignItems: "center",
    display: "flex",
    position: "relative",
  },
  // In the placeholder's colour, and clicks go through to the input.
  icon: {
    color: colors.whiteA6,
    display: "flex",
    fontSize: fontSizes[14],
    pointerEvents: "none",
    position: "absolute",
    height: "1em",
    width: "1em",
  },
  glyph: {
    height: "1em",
    width: "1em",
  },
});

/**
 * With a hotkey: its keys sit at the end, in the size's padding, and the
 * text stops a gap before them. Sized for one key, e.g. "/".
 */
const hotkeySizes = stylex.create({
  default: {
    paddingInlineEnd: `calc(${stylex.env.spacing(3)} + ${stylex.env.spacing(4)} + ${stylex.env.spacing(2)})`,
  },
  lg: {
    paddingInlineEnd: `calc(${stylex.env.spacing(4)} + ${stylex.env.spacing(4)} + ${stylex.env.spacing(2)})`,
  },
});

const hotkeyOffsets = stylex.create({
  default: {
    insetInlineEnd: stylex.env.spacing(3),
  },
  lg: {
    insetInlineEnd: stylex.env.spacing(4),
  },
});

const hotkeyStyles = stylex.create({
  // Always shown: the text stops before it, so its space is never empty.
  hint: {
    display: "flex",
    pointerEvents: "none",
    position: "absolute",
  },
});

export type InputSize = keyof typeof sizes;

// SAFETY: stylex.create keeps the keys it was given.
export const inputSizes = Object.keys(sizes) as InputSize[];

export const Input = ({
  size = "default",
  style,
  icon: Icon,
  hotkey,
  ...props
}: Omit<InputPrimitive.Props, "className" | "size" | "style"> & {
  size?: InputSize;
  style?: stylex.StyleXStyles;
  /** A leading icon, e.g. a magnifying glass on a search. */
  icon?: ComponentType<{ className?: string }>;
  /**
   * A shortcut that focuses the input from anywhere on the page, e.g. "/",
   * shown at its end. Same value as `useHotkey` takes.
   */
  hotkey?: RegisterableHotkey;
}) => {
  const ref = useRef<HTMLInputElement>(null);
  useHotkey(hotkey, () => ref.current?.focus());
  if (!(Icon || hotkey)) {
    return (
      <InputPrimitive
        {...props}
        {...stylex.props(styles.base, sizes[size], style)}
      />
    );
  }
  return (
    <span {...stylex.props(iconStyles.wrapper, style)}>
      {Icon ? (
        <span {...stylex.props(iconStyles.icon, iconOffsets[size])}>
          <Icon {...stylex.props(iconStyles.glyph)} />
        </span>
      ) : null}
      <InputPrimitive
        {...props}
        ref={ref}
        {...stylex.props(
          styles.base,
          sizes[size],
          Icon && iconSizes[size],
          hotkey && hotkeySizes[size]
        )}
      />
      {hotkey ? (
        <span {...stylex.props(hotkeyStyles.hint, hotkeyOffsets[size])}>
          <Hotkey hotkey={hotkey} />
        </span>
      ) : null}
    </span>
  );
};
