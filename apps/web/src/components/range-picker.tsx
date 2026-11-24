import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import * as stylex from "@stylexjs/stylex";
import { MotionConfig, motion } from "motion/react";
import { useId } from "react";

import { text } from "@/styles/text";
import { colors, radius } from "@/styles/tokens.stylex";

const styles = stylex.create({
  // Isolated as a whole, so the sliding pill stays under every label, not
  // just its own. The first pill starts at the container's edge.
  options: {
    display: "flex",
    isolation: "isolate",
  },
  // A small outline button's height; only the selected one has a pill
  // behind.
  option: {
    borderRadius: radius.full,
    borderStyle: "none",
    paddingBlock: 0,
    paddingInline: 0,
    alignItems: "center",
    appearance: "none",
    backgroundColor: "transparent",
    color: {
      "[data-pressed]": colors.gray12,
      default: colors.gray11,
      ":hover": colors.gray12,
    },
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: "inherit",
    // As the buttons.
    fontWeight: 550,
    justifyContent: "center",
    position: "relative",
    transitionDuration: {
      default: "100ms",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionProperty: "color",
    transitionTimingFunction: "ease",
    whiteSpace: "nowrap",
    height: stylex.env.spacing(7),
  },
  // Equal widths, 48px each, so the pill keeps one size as it slides.
  fixed: {
    width: stylex.env.spacing(12),
  },
  // As wide as its label, for words rather than "1D".
  fit: {
    paddingInline: stylex.env.spacing(3),
  },
  // The outline button's background, sliding to the selected option.
  pill: {
    inset: 0,
    borderRadius: radius.full,
    backgroundColor: colors.gray2,
    position: "absolute",
    zIndex: -1,
  },
});

/** Slides in the same 100ms as the label's colour. */
const pillTransition = { duration: 0.1, ease: "easeInOut" } as const;

/**
 * A row of small options, one always selected, with a pill sliding to it:
 * a chart's timeframes, or which list to show.
 */
export const RangePicker = <Id extends string>({
  label,
  options,
  value,
  onValueChange,
  fit = false,
}: {
  /** What the options choose, e.g. "Timeframe". */
  label: string;
  options: readonly { id: Id; label: string }[];
  value: Id;
  onValueChange?: (id: Id) => void;
  /** Each option as wide as its label, rather than all 48px. */
  fit?: boolean;
}) => {
  // One pill per picker, so two on a page don't slide between each other.
  const pillId = useId();
  return (
    // With reduced motion, the pill jumps instead of sliding.
    <MotionConfig reducedMotion="user">
      <ToggleGroup
        aria-label={label}
        value={[value]}
        onValueChange={([id]) => {
          // Pressing the selected option again would clear the group.
          const next = options.find((option) => option.id === id);
          if (next) {
            onValueChange?.(next.id);
          }
        }}
        {...stylex.props(styles.options)}
      >
        {options.map((option) => (
          <Toggle
            key={option.id}
            value={option.id}
            {...stylex.props(
              text[12],
              styles.option,
              fit ? styles.fit : styles.fixed
            )}
          >
            {option.id === value ? (
              <motion.span
                aria-hidden="true"
                layoutId={pillId}
                transition={pillTransition}
                {...stylex.props(styles.pill)}
              />
            ) : null}
            {option.label}
          </Toggle>
        ))}
      </ToggleGroup>
    </MotionConfig>
  );
};
