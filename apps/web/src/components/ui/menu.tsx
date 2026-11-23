import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@radix-ui/react-icons";
import * as stylex from "@stylexjs/stylex";
import { useHotkey } from "@tanstack/react-hotkeys";
import type { RegisterableHotkey } from "@tanstack/react-hotkeys";
import { useId, useState } from "react";
import type { ComponentType, ReactNode } from "react";

import { Hotkey } from "@/components/ui/kbd";
import { PopupScroll } from "@/components/ui/popup-scroll";
import { popupStyles } from "@/components/ui/popup-styles";
import { selectLook } from "@/components/ui/select";
import type { SelectSize } from "@/components/ui/select";
import { colors, fontSizeLineHeights, fontSizes } from "@/styles/tokens.stylex";

const styles = stylex.create({
  // Drawn as the select, but only as wide as its label.
  trigger: {
    justifyContent: "start",
    width: "auto",
  },
  // The search sits on top, the options scroll beneath it.
  popup: {
    width: stylex.env.spacing(60),
  },
  // Lined up with the options' text, with a hairline under it; a hotkey,
  // if any, at its end, where the options show their checks and chevrons.
  searchRow: {
    gap: stylex.env.spacing(2),
    paddingInline: stylex.env.spacing(4),
    alignItems: "center",
    boxShadow: `0 0.5px 0 ${colors.whiteA3}`,
    display: "flex",
    flexShrink: 0,
    // Above the options, so its hairline shows over them as they scroll.
    position: "relative",
    zIndex: 1,
    height: stylex.env.spacing(10),
  },
  search: {
    padding: 0,
    borderStyle: "none",
    outline: "none",
    alignSelf: "stretch",
    backgroundColor: "transparent",
    color: colors.gray12,
    flexGrow: 1,
    fontFamily: "inherit",
    fontSize: fontSizes[14],
    lineHeight: fontSizeLineHeights[14],
    minWidth: 0,
    "::placeholder": {
      color: colors.whiteA6,
    },
  },
  empty: {
    paddingBlock: stylex.env.spacing(1.5),
    paddingInline: stylex.env.spacing(3),
    color: colors.gray11,
    fontSize: fontSizes[14],
    lineHeight: fontSizeLineHeights[14],
  },
  // A submenu's current value, between its name and the chevron.
  current: {
    gap: stylex.env.spacing(1),
    overflow: "hidden",
    alignItems: "center",
    color: colors.gray11,
    display: "flex",
    minWidth: 0,
  },
  chevron: {
    color: colors.whiteA6,
  },
});

/**
 * The search, if any, then the options it narrows, or what to say when none
 * match.
 */
const SearchPopup = ({
  searchLabel,
  hotkey,
  empty,
  style,
  children,
}: {
  searchLabel: string | undefined;
  /** Shown at the search's end: the shortcut that opens the menu. */
  hotkey?: RegisterableHotkey;
  empty: ReactNode;
  style?: stylex.StyleXStyles;
  children: ReactNode;
}) => (
  <MenuPrimitive.Popup
    {...stylex.props(popupStyles.popup, styles.popup, style)}
  >
    {searchLabel === undefined ? null : (
      <div {...stylex.props(styles.searchRow)}>
        <MenuPrimitive.Input
          aria-label={searchLabel}
          placeholder={searchLabel}
          {...stylex.props(styles.search)}
        />
        {hotkey ? <Hotkey hotkey={hotkey} /> : null}
      </div>
    )}
    <PopupScroll>
      {searchLabel === undefined ? (
        children
      ) : (
        <>
          <MenuPrimitive.Empty {...stylex.props(styles.empty)}>
            {empty}
          </MenuPrimitive.Empty>
          <MenuPrimitive.List>{children}</MenuPrimitive.List>
        </>
      )}
    </PopupScroll>
  </MenuPrimitive.Popup>
);

const Chevron = ({
  icon: Icon,
}: {
  icon: ComponentType<{ className?: string }>;
}) => (
  <span {...stylex.props(popupStyles.icon, styles.chevron)}>
    <Icon {...stylex.props(popupStyles.iconGlyph)} />
  </span>
);

/**
 * Base UI's menu with a search on top: a trigger drawn as the select, and
 * options (often `SearchSubmenu`s) that typing narrows by their labels.
 * With a `hotkey`, pressing it anywhere on the page opens the menu with
 * its search focused, and the search shows it as a hint.
 */
export const SearchMenu = ({
  label,
  icon: Icon,
  size = "default",
  searchLabel,
  hotkey,
  empty,
  style,
  popupStyle,
  children,
}: {
  /** The trigger's text; it and the icon are in the foreground colour. */
  label: string;
  icon?: ComponentType<{ className?: string }>;
  size?: SelectSize;
  /** The search's placeholder and accessible name. */
  searchLabel: string;
  /** A shortcut that opens the menu, e.g. `"F"`; same value as `useHotkey`. */
  hotkey?: RegisterableHotkey;
  /** Shown when nothing matches the search. */
  empty: ReactNode;
  style?: stylex.StyleXStyles;
  popupStyle?: stylex.StyleXStyles;
  children: ReactNode;
}) => {
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  // Only while closed: once open, the search has focus and a single key
  // types into it (TanStack skips single keys in inputs anyway).
  useHotkey(hotkey, () => setOpen(true), { enabled: !open });
  return (
    <MenuPrimitive.FilterProvider autoHighlight>
      {/* Controlled so the hotkey can open it; `triggerId` anchors the popup
        to the trigger when it opens without a click. The filter popup
        focuses its search on open. */}
      <MenuPrimitive.Root
        open={open}
        onOpenChange={setOpen}
        triggerId={triggerId}
      >
        <MenuPrimitive.Trigger
          id={triggerId}
          {...stylex.props(...selectLook(size), styles.trigger, style)}
        >
          {Icon ? (
            <span {...stylex.props(popupStyles.icon)}>
              <Icon {...stylex.props(popupStyles.iconGlyph)} />
            </span>
          ) : null}
          {label}
          <Chevron icon={ChevronDownIcon} />
        </MenuPrimitive.Trigger>
        <MenuPrimitive.Portal>
          <MenuPrimitive.Positioner
            sideOffset={4}
            align="start"
            {...stylex.props(popupStyles.positioner)}
          >
            <SearchPopup
              searchLabel={searchLabel}
              hotkey={hotkey}
              empty={empty}
              style={popupStyle}
            >
              {children}
            </SearchPopup>
          </MenuPrimitive.Positioner>
        </MenuPrimitive.Portal>
      </MenuPrimitive.Root>
    </MenuPrimitive.FilterProvider>
  );
};

/**
 * An option that opens its own menu beside it, searchable when given a
 * `searchLabel`. The parent's search matches its `label` only, not the value
 * it shows.
 */
export const SearchSubmenu = ({
  label,
  value,
  searchLabel,
  empty,
  popupStyle,
  children,
}: {
  label: string;
  /** Its current value, shown dimmed after the label. */
  value?: ReactNode;
  /** The search's placeholder and accessible name; no search without it. */
  searchLabel?: string;
  /** Shown when nothing matches the search. */
  empty?: ReactNode;
  popupStyle?: stylex.StyleXStyles;
  children: ReactNode;
}) => {
  const submenu = (
    <MenuPrimitive.SubmenuRoot>
      <MenuPrimitive.SubmenuTrigger
        label={label}
        {...stylex.props(popupStyles.item)}
      >
        <span {...stylex.props(popupStyles.itemText)}>{label}</span>
        <span {...stylex.props(styles.current)}>
          {value ? (
            <span {...stylex.props(popupStyles.itemText)}>{value}</span>
          ) : null}
          <Chevron icon={ChevronRightIcon} />
        </span>
      </MenuPrimitive.SubmenuTrigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner
          // A small gap from the parent, its first row level with this one.
          sideOffset={8}
          alignOffset={-4}
          {...stylex.props(popupStyles.positioner)}
        >
          <SearchPopup
            searchLabel={searchLabel}
            empty={empty}
            style={popupStyle}
          >
            {children}
          </SearchPopup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.SubmenuRoot>
  );
  // Base UI filters a submenu only inside its own provider.
  return searchLabel === undefined ? (
    submenu
  ) : (
    <MenuPrimitive.FilterProvider autoHighlight>
      {submenu}
    </MenuPrimitive.FilterProvider>
  );
};

/**
 * Options of which at most one is picked, e.g. a filter's value. Picking the
 * picked one again clears it: `onValueChange` gets "" (Base UI reports a
 * pick even when it's the current value).
 */
export const MenuRadioGroup = ({
  value,
  onValueChange,
  children,
}: {
  /** The picked option's value, or "" for none. */
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
}) => (
  <MenuPrimitive.RadioGroup
    value={value}
    onValueChange={(next: string) => onValueChange(next === value ? "" : next)}
  >
    {children}
  </MenuPrimitive.RadioGroup>
);

/** One of a radio group's options, with a check while it's picked. Picking it closes the menu. */
export const MenuRadioItem = ({
  value,
  label,
  children,
}: {
  value: string;
  /** What the search matches, when it isn't the text shown. */
  label?: string;
  children: ReactNode;
}) => (
  <MenuPrimitive.RadioItem
    value={value}
    label={label}
    closeOnClick
    {...stylex.props(popupStyles.item)}
  >
    <span {...stylex.props(popupStyles.itemText)}>{children}</span>
    <MenuPrimitive.RadioItemIndicator {...stylex.props(popupStyles.icon)}>
      <CheckIcon {...stylex.props(popupStyles.iconGlyph)} />
    </MenuPrimitive.RadioItemIndicator>
  </MenuPrimitive.RadioItem>
);

/** Options under a heading; hidden while the search matches none of them. */
export const MenuGroup = ({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) => (
  <MenuPrimitive.Group>
    <MenuPrimitive.GroupLabel {...stylex.props(popupStyles.groupLabel)}>
      {label}
    </MenuPrimitive.GroupLabel>
    {children}
  </MenuPrimitive.Group>
);
