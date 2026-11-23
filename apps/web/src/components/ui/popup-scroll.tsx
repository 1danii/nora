import { ScrollArea } from "@base-ui/react/scroll-area";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { colors, radius } from "@/styles/tokens.stylex";

const styles = stylex.create({
  // Fills what the popup's max height leaves, so only the options scroll.
  root: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  // Options fade out at an edge only while there's more to scroll that way,
  // and more so the further there is (Base UI's overflow variables). Until
  // they're set, the end fades, as Base UI's docs suggest for SSR.
  viewport: {
    outline: "none",
    // An option the keyboard highlights scrolls clear of the fade.
    scrollPaddingBlock: "24px",
    maskImage: `linear-gradient(
      to bottom,
      transparent 0,
      black min(24px, var(--scroll-area-overflow-y-start, 0px)),
      black calc(100% - min(24px, var(--scroll-area-overflow-y-end, 24px))),
      transparent 100%
    )`,
    maskRepeat: "no-repeat",
    minHeight: 0,
    // Base UI makes both axes scrollable, but options only ever scroll
    // vertically: no sideways rubber-band, and the vertical one stays here.
    overscrollBehaviorX: "none",
    overscrollBehaviorY: "contain",
  },
  content: {
    padding: stylex.env.spacing(1),
  },
  // Over the options rather than beside them, and only while the pointer's
  // over the list or it's scrolling.
  // Inset 6px at its ends, so the thumb clears the popup's rounded corners.
  scrollbar: {
    paddingBlock: stylex.env.spacing(1.5),
    paddingInline: "2px",
    display: "flex",
    opacity: {
      "[data-hovering]": 1,
      "[data-scrolling]": 1,
      default: 0,
    },
    pointerEvents: {
      "[data-hovering]": "auto",
      "[data-scrolling]": "auto",
      default: "none",
    },
    transitionDuration: {
      default: "100ms",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionProperty: "opacity",
    width: stylex.env.spacing(2),
  },
  // Solid, so highlighted options don't show through it; brighter while
  // the pointer's on it.
  thumb: {
    borderRadius: radius.full,
    backgroundColor: {
      default: colors.gray6,
      ":hover": colors.gray8,
    },
    transitionDuration: {
      default: "100ms",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionProperty: "background-color",
    transitionTimingFunction: "ease",
    width: "100%",
  },
});

/**
 * A popup's options, scrolling under an overlay scrollbar with faded edges.
 * Give the popup a column layout and a max height for it to fill.
 */
export const PopupScroll = ({
  children,
  contentStyle,
}: {
  children: ReactNode;
  /** Overrides for the options' padding, e.g. rows that run edge to edge. */
  contentStyle?: stylex.StyleXStyles;
}) => (
  <ScrollArea.Root {...stylex.props(styles.root)}>
    <ScrollArea.Viewport {...stylex.props(styles.viewport)}>
      <ScrollArea.Content {...stylex.props(styles.content, contentStyle)}>
        {children}
      </ScrollArea.Content>
    </ScrollArea.Viewport>
    <ScrollArea.Scrollbar {...stylex.props(styles.scrollbar)}>
      <ScrollArea.Thumb {...stylex.props(styles.thumb)} />
    </ScrollArea.Scrollbar>
  </ScrollArea.Root>
);
