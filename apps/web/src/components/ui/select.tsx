import { Select as SelectPrimitive } from "@base-ui/react/select";
import type { SelectRootProps } from "@base-ui/react/select";
import { CheckIcon, ChevronDownIcon } from "@radix-ui/react-icons";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { PopupScroll } from "@/components/ui/popup-scroll";
import { popupStyles } from "@/components/ui/popup-styles";
import {
  colors,
  fontSizeLineHeights,
  fontSizes,
  radius,
} from "@/styles/tokens.stylex";

const styles = stylex.create({
  // As the input: its background, hairline and focus ring. Hover and an
  // open popup only lift the background; the text is the input's: the
  // foreground once something's selected, the placeholder's colour before.
  trigger: {
    borderRadius: radius.lg,
    borderStyle: "none",
    gap: stylex.env.spacing(2),
    outline: {
      default: null,
      ":focus-visible": "1px solid transparent",
    },
    alignItems: "center",
    appearance: "none",
    backgroundColor: {
      "[data-popup-open]": colors.gray3,
      default: colors.gray2,
      ":hover": colors.gray3,
    },
    boxShadow: {
      default: `0 0 0 0.5px ${colors.whiteA2}, 0 0 0 0 ${colors.indigoA3}`,
      ":focus-visible": `0 0 0 0.5px ${colors.indigo9}, 0 0 0 4px ${colors.indigoA3}`,
    },
    color: colors.gray12,
    cursor: {
      default: "pointer",
      ":disabled": "not-allowed",
    },
    display: "flex",
    fontFamily: "inherit",
    fontSize: fontSizes[14],
    justifyContent: "space-between",
    lineHeight: fontSizeLineHeights[14],
    opacity: {
      default: null,
      ":disabled": 0.5,
    },
    textAlign: "start",
    transitionDuration: {
      default: "100ms",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionProperty: "background-color, box-shadow, opacity",
    transitionTimingFunction: "ease",
    minWidth: 0,
    width: "100%",
  },
  value: {
    overflow: "hidden",
    color: {
      "[data-placeholder]": colors.whiteA6,
      default: "inherit",
    },
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },
  // Always the placeholder's colour, selected or not.
  chevron: {
    color: colors.whiteA6,
  },
  popup: {
    minWidth: "var(--anchor-width)",
  },
});

/** The input's sizes: the same heights and padding. */
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

export type SelectSize = keyof typeof sizes;

// SAFETY: stylex.create keeps the keys it was given.
export const selectSizes = Object.keys(sizes) as SelectSize[];

/**
 * The select's trigger look without the select, e.g. for a menu's trigger
 * drawn as a select: `stylex.props(...selectLook("default"))`.
 */
export const selectLook = (size: SelectSize) =>
  [styles.trigger, sizes[size]] as const;

/**
 * Base UI's select, drawn as the input with a chevron. The options open
 * below it (not over it, as Base UI's default), which the chevron says.
 * Pass `items` so the trigger shows an option's label for its value.
 */
export const Select = <Value,>({
  size = "default",
  style,
  placeholder,
  "aria-label": ariaLabel,
  children,
  ...props
}: Omit<SelectRootProps<Value>, "children"> & {
  size?: SelectSize;
  style?: stylex.StyleXStyles;
  /** Shown while nothing is selected. */
  placeholder?: ReactNode;
  "aria-label"?: string;
  /** The options: `SelectItem`s, optionally in `SelectGroup`s. */
  children: ReactNode;
}) => (
  <SelectPrimitive.Root {...props}>
    <SelectPrimitive.Trigger
      aria-label={ariaLabel}
      {...stylex.props(...selectLook(size), style)}
    >
      <SelectPrimitive.Value
        placeholder={placeholder}
        {...stylex.props(styles.value)}
      />
      <SelectPrimitive.Icon {...stylex.props(popupStyles.icon, styles.chevron)}>
        <ChevronDownIcon {...stylex.props(popupStyles.iconGlyph)} />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        sideOffset={4}
        alignItemWithTrigger={false}
        {...stylex.props(popupStyles.positioner)}
      >
        <SelectPrimitive.Popup
          {...stylex.props(popupStyles.popup, styles.popup)}
        >
          <PopupScroll>
            <SelectPrimitive.List>{children}</SelectPrimitive.List>
          </PopupScroll>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>
);

/** An option, with a check while it's the selected one. */
export const SelectItem = ({
  value,
  disabled,
  children,
}: {
  value: unknown;
  disabled?: boolean;
  children: ReactNode;
}) => (
  <SelectPrimitive.Item
    value={value}
    disabled={disabled}
    {...stylex.props(popupStyles.item)}
  >
    <SelectPrimitive.ItemText {...stylex.props(popupStyles.itemText)}>
      {children}
    </SelectPrimitive.ItemText>
    <SelectPrimitive.ItemIndicator {...stylex.props(popupStyles.icon)}>
      <CheckIcon {...stylex.props(popupStyles.iconGlyph)} />
    </SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
);

/** Options under a heading. */
export const SelectGroup = ({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) => (
  <SelectPrimitive.Group>
    <SelectPrimitive.GroupLabel {...stylex.props(popupStyles.groupLabel)}>
      {label}
    </SelectPrimitive.GroupLabel>
    {children}
  </SelectPrimitive.Group>
);
