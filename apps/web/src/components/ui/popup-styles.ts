import * as stylex from "@stylexjs/stylex";

import {
  colors,
  fontSizeLineHeights,
  fontSizes,
  radius,
} from "@/styles/tokens.stylex";

/**
 * The look shared by the select's and the menu's popups: an opaque panel on
 * the page's own background, and options in the list picker tabs' colours.
 */
export const popupStyles = stylex.create({
  positioner: {
    outline: "none",
    zIndex: 50,
  },
  // Opens and closes with a short fade and a slight scale.
  // A column, so a `PopupScroll` fills what its max height leaves; clipped
  // to its corners, so a highlighted option can't paint past them.
  popup: {
    borderRadius: radius.lg,
    outline: "none",
    overflow: "hidden",
    backgroundColor: colors.gray1,
    boxShadow: `0 0 0 0.5px ${colors.whiteA3}`,
    display: "flex",
    flexDirection: "column",
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
    transitionDuration: {
      default: "100ms",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionProperty: "opacity, transform",
    transitionTimingFunction: "ease-out",
    maxHeight: "min(var(--available-height), 320px)",
  },
  // Foreground text, on the active tab's pill colour when highlighted (or
  // while its submenu is open).
  item: {
    // Concentric with the popup: its 8px less its 4px padding.
    borderRadius: radius.sm,
    gap: stylex.env.spacing(2),
    outline: "none",
    paddingInline: stylex.env.spacing(3),
    alignItems: "center",
    backgroundColor: {
      "[data-highlighted]": colors.gray2,
      "[data-popup-open]": colors.gray2,
      default: "transparent",
    },
    color: colors.gray12,
    // A link's pointer; a disabled option says it can't be picked.
    cursor: {
      "[data-disabled]": "not-allowed",
      default: "pointer",
    },
    display: "flex",
    fontSize: fontSizes[14],
    justifyContent: "space-between",
    lineHeight: fontSizeLineHeights[14],
    transitionDuration: {
      default: "100ms",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionProperty: "background-color",
    transitionTimingFunction: "ease",
    userSelect: "none",
    whiteSpace: "nowrap",
    height: stylex.env.spacing(8),
  },
  // An option's label, cut short rather than wrapped.
  itemText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    minWidth: 0,
  },
  groupLabel: {
    paddingBlock: stylex.env.spacing(1.5),
    paddingInline: stylex.env.spacing(3),
    color: colors.gray11,
    fontSize: fontSizes[12],
    lineHeight: fontSizeLineHeights[12],
  },
  // A button icon's size: 1em of the text beside it.
  icon: {
    display: "flex",
    flexShrink: 0,
    height: "1em",
    width: "1em",
  },
  iconGlyph: {
    height: "1em",
    width: "1em",
  },
});
