import { Button as ButtonPrimitive } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import type { ComponentType } from "react";

import {
  colors,
  fontSizeLineHeights,
  fontSizes,
  radius,
} from "@/styles/tokens.stylex";

const styles = stylex.create({
  icon: {
    flexShrink: 0,
    pointerEvents: "none",
    height: "1em",
    width: "1em",
  },
  // No block padding (the browser's default is 1px): the size sets the
  // height and the content is centred in it.
  base: {
    borderRadius: radius.full,
    gap: stylex.env.spacing(1.5),
    paddingBlock: 0,
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    fontSize: fontSizes[14],
    fontWeight: 550,
    justifyContent: "center",
    lineHeight: fontSizeLineHeights[14],
    opacity: {
      default: null,
      ":disabled": 0.5,
    },
    pointerEvents: {
      default: null,
      ":disabled": "none",
    },
    transitionDuration: {
      default: "100ms",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionProperty: "opacity",
    userSelect: "none",
    whiteSpace: "nowrap",
  },
});

const variants = stylex.create({
  default: {
    backgroundImage: `linear-gradient(${colors.gray12}, ${colors.gray11})`,
    color: colors.gray1,
  },
  secondary: {
    backgroundImage: `linear-gradient(${colors.gray4}, ${colors.gray3})`,
    boxShadow: `0 0.5px 0 ${colors.whiteA2}, 0 0 0 0.5px ${colors.whiteA3}`,
    color: colors.gray12,
  },
  outline: {
    backgroundColor: colors.gray2,
    boxShadow: `0 0 0 0.5px ${colors.whiteA2}`,
    color: colors.gray12,
  },
});

const sizes = stylex.create({
  sm: {
    gap: stylex.env.spacing(1),
    paddingInline: stylex.env.spacing(2.5),
    fontSize: fontSizes[12],
    lineHeight: fontSizeLineHeights[12],
    height: stylex.env.spacing(7),
  },
  default: {
    paddingInline: stylex.env.spacing(3),
    height: stylex.env.spacing(9),
  },
  lg: {
    paddingInline: stylex.env.spacing(4),
    fontSize: fontSizes[16],
    lineHeight: fontSizeLineHeights[16],
    height: stylex.env.spacing(11),
  },
  "icon-sm": {
    height: stylex.env.spacing(7),
    width: stylex.env.spacing(7),
  },
  icon: {
    height: stylex.env.spacing(8),
    width: stylex.env.spacing(8),
  },
  "icon-lg": {
    height: stylex.env.spacing(9),
    width: stylex.env.spacing(9),
  },
});

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

// SAFETY: stylex.create keeps the keys it was given.
export const buttonVariants = Object.keys(variants) as ButtonVariant[];
// SAFETY: stylex.create keeps the keys it was given.
export const buttonSizes = Object.keys(sizes) as ButtonSize[];

/**
 * A button's look without the button, e.g. for a label drawn as a pill:
 * `stylex.props(...buttonLook("default", "sm"), styles.extra)`.
 */
export const buttonLook = (variant: ButtonVariant, size: ButtonSize) =>
  [styles.base, variants[variant], sizes[size]] as const;

export const Button = ({
  variant = "default",
  size = "default",
  style,
  ...props
}: Omit<ButtonPrimitive.Props, "className" | "style"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  style?: stylex.StyleXStyles;
}) => (
  <ButtonPrimitive
    {...props}
    {...stylex.props(...buttonLook(variant, size), style)}
  />
);

export const ButtonIcon = ({
  icon: Icon,
}: {
  icon: ComponentType<{ className?: string }>;
}) => <Icon {...stylex.props(styles.icon)} />;
