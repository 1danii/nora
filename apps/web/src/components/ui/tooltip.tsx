import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import * as stylex from "@stylexjs/stylex";
import { useId } from "react";
import type { ReactElement, ReactNode } from "react";

import { popupStyles } from "@/components/ui/popup-styles";
import { colors, fontSizes, radius } from "@/styles/tokens.stylex";

const styles = stylex.create({
  // A 24px chip in the outline button's colours, with small corners rather
  // than a pill. Fades and scales in like the other popups.
  popup: {
    borderRadius: radius.sm,
    // Room between the label and a trailing `Hotkey`.
    gap: stylex.env.spacing(2),
    paddingInline: stylex.env.spacing(2),
    alignItems: "center",
    backgroundColor: colors.gray2,
    boxShadow: `0 0 0 0.5px ${colors.whiteA2}`,
    color: colors.gray12,
    display: "flex",
    fontSize: fontSizes[12],
    fontWeight: 550,
    lineHeight: 1,
    opacity: {
      "[data-ending-style]": 0,
      "[data-starting-style]": 0,
      default: 1,
    },
    transform: {
      "[data-ending-style]": "scale(0.98)",
      "[data-starting-style]": "scale(0.98)",
      default: "none",
    },
    transformOrigin: "var(--transform-origin)",
    // No transition when Base UI marks the change instant: moving straight
    // from another open tooltip in the provider, opening on focus, or
    // dismissing with Escape.
    transitionDuration: {
      "[data-instant]": "0s",
      default: "100ms",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionProperty: "opacity, transform",
    transitionTimingFunction: "ease-out",
    userSelect: "none",
    whiteSpace: "nowrap",
    height: stylex.env.spacing(6),
  },
  // Drawn pointing up, 5px out from the popup plus 1px over it, and turned
  // to face the trigger.
  arrow: {
    display: "flex",
    rotate: {
      "[data-side='left']": "90deg",
      "[data-side='right']": "-90deg",
      "[data-side='top']": "180deg",
      default: null,
    },
    bottom: { "[data-side='top']": "-5px", default: null },
    height: "6px",
    left: { "[data-side='right']": "-7px", default: null },
    right: { "[data-side='left']": "-7px", default: null },
    top: { "[data-side='bottom']": "-5px", default: null },
    width: "10px",
  },
  svg: {
    overflow: "visible",
  },
  // A 1px stroke centred on the edge, its inner half under the fill, leaves
  // 0.5px outside: the popup's own outline. It is clipped where the popup's
  // hairline starts (y 4.5), so the two meet instead of overlapping.
  arrowOutline: {
    fill: "none",
    stroke: colors.whiteA2,
    strokeWidth: 1,
  },
  // Covers the popup's hairline under the arrow's base.
  arrowFill: {
    fill: colors.gray2,
  },
});

// The arrow's sides, carried on past the popup's edge (y 5) so neither the
// clipped stroke nor the fill ends short of the hairline.
const ARROW_EDGE = "M-1.11 6 L5 0.5 L11.11 6";

const TooltipArrow = () => {
  const clipId = useId();
  return (
    <TooltipPrimitive.Arrow {...stylex.props(styles.arrow)}>
      <svg
        width="10"
        height="6"
        viewBox="0 0 10 6"
        aria-hidden
        {...stylex.props(styles.svg)}
      >
        <clipPath id={clipId}>
          <rect x="-2" y="-1" width="14" height="5.5" />
        </clipPath>
        <path
          d={ARROW_EDGE}
          clipPath={`url(#${clipId})`}
          {...stylex.props(styles.arrowOutline)}
        />
        <path d={`${ARROW_EDGE} Z`} {...stylex.props(styles.arrowFill)} />
      </svg>
    </TooltipPrimitive.Arrow>
  );
};

/**
 * Lets tooltips that open soon after one another skip the delay. Wrap a
 * group of triggers (or the app) in it.
 */
export const TooltipProvider = TooltipPrimitive.Provider;

/**
 * A short label shown on hover or focus of its trigger, e.g. an icon
 * button's name: `<Tooltip content="Add"><Button …/></Tooltip>`.
 */
export const Tooltip = ({
  content,
  side = "top",
  delay,
  open,
  style,
  children,
}: {
  content: ReactNode;
  side?: TooltipPrimitive.Positioner.Props["side"];
  /** Milliseconds before it opens; Base UI's default otherwise. */
  delay?: number;
  /** Keeps it shown (or hidden) regardless of hover, e.g. in a demo. */
  open?: boolean;
  style?: stylex.StyleXStyles;
  /** The trigger: one element that takes a ref and props. */
  children: ReactElement;
}) => (
  <TooltipPrimitive.Root open={open}>
    <TooltipPrimitive.Trigger delay={delay} render={children} />
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        side={side}
        sideOffset={8}
        {...stylex.props(popupStyles.positioner)}
      >
        <TooltipPrimitive.Popup {...stylex.props(styles.popup, style)}>
          {content}
          <TooltipArrow />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  </TooltipPrimitive.Root>
);
