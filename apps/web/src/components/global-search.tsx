import { Autocomplete } from "@base-ui/react/autocomplete";
import { Dialog } from "@base-ui/react/dialog";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import * as stylex from "@stylexjs/stylex";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useThrottledValue } from "@tanstack/react-pacer";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Classic } from "loading-dev";
import { useId, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { ExchangeFlag } from "@/components/listing-exchange";
import { TickerLogo } from "@/components/ticker-logo";
import { Hotkey, Kbd } from "@/components/ui/kbd";
import { PopupScroll } from "@/components/ui/popup-scroll";
import { popupStyles } from "@/components/ui/popup-styles";
import {
  contractSearchQuery,
  isValidSearchTerm,
  normalizeSearchTerm,
  searchResultSlug,
} from "@/lib/ibkr-search-queries";
import type { SearchResult } from "@/lib/ibkr-search-queries";
import { readRecentSearches, saveRecentSearch } from "@/lib/recent-searches";
import { text } from "@/styles/text";
import { colors, radius } from "@/styles/tokens.stylex";

interface SearchGroup {
  value: string;
  items: readonly SearchResult[];
}

/** At most one search a second, as IBKR's own search box sends them. */
const SEARCH_INTERVAL = 1000;

const OPEN_HOTKEY = "Mod+K";

const styles = stylex.create({
  // The large input's box, as a button: it opens the palette rather than
  // taking text itself. A pill, unlike other inputs: a one-off for the
  // header's search.
  trigger: {
    borderRadius: radius.full,
    borderWidth: 0,
    gap: stylex.env.spacing(2),
    outline: "none",
    paddingInline: stylex.env.spacing(4),
    alignItems: "center",
    backgroundColor: colors.gray2,
    boxShadow: {
      default: `0 0 0 0.5px ${colors.whiteA2}, 0 0 0 0 ${colors.indigoA3}`,
      ":focus-visible": `0 0 0 0.5px ${colors.indigo9}, 0 0 0 4px ${colors.indigoA3}`,
    },
    color: colors.whiteA6,
    cursor: "text",
    display: "flex",
    transitionDuration: {
      default: "100ms",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionProperty: "box-shadow",
    transitionTimingFunction: "ease-out",
    height: stylex.env.spacing(11),
    minWidth: 0,
    width: "100%",
  },
  triggerLabel: {
    overflow: "hidden",
    flexGrow: 1,
    textAlign: "start",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  icon: {
    flexShrink: 0,
    height: "1em",
    width: "1em",
  },
  backdrop: {
    inset: 0,
    backgroundColor: colors.blackA9,
    opacity: {
      "[data-ending-style]": 0,
      "[data-starting-style]": 0,
      default: 1,
    },
    position: "fixed",
    transitionDuration: {
      default: "100ms",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionProperty: "opacity",
    transitionTimingFunction: "ease-out",
    zIndex: 50,
  },
  // Where the login form sits: up to 336px below the top, shrinking with the
  // viewport so it stays near the middle on short screens. A gutter on the
  // other sides.
  viewport: {
    inset: 0,
    padding: stylex.env.spacing(4),
    alignItems: "flex-start",
    display: "flex",
    justifyContent: "center",
    position: "fixed",
    zIndex: 50,
    paddingTop: "clamp(64px, 30svh, 336px)",
  },
  // The select's popup look, sized as a palette. Its height is fixed (down
  // to what the viewport leaves), so filtering doesn't resize it.
  popup: {
    borderRadius: radius.lg,
    outline: "none",
    overflow: "hidden",
    backgroundColor: colors.gray1,
    boxShadow: `0 0 0 0.5px ${colors.whiteA3}, 0 16px 48px ${colors.blackA8}`,
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
    transitionDuration: {
      default: "100ms",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionProperty: "opacity, transform",
    transitionTimingFunction: "ease-out",
    height: "min(440px, 100%)",
    maxWidth: 640,
    width: "100%",
  },
  inputGroup: {
    gap: stylex.env.spacing(2),
    paddingInline: stylex.env.spacing(4),
    alignItems: "center",
    color: colors.whiteA6,
    display: "flex",
    flexShrink: 0,
    borderBottomColor: colors.whiteA2,
    borderBottomStyle: "solid",
    borderBottomWidth: 0.5,
  },
  input: {
    padding: 0,
    borderWidth: 0,
    outline: "none",
    backgroundColor: "transparent",
    color: colors.gray12,
    flexGrow: 1,
    height: stylex.env.spacing(12),
    minWidth: 0,
    "::-webkit-search-cancel-button": {
      appearance: "none",
    },
    "::placeholder": {
      color: colors.whiteA6,
    },
  },
  // Inset like the input and rows.
  groupLabel: {
    paddingInline: stylex.env.spacing(4),
  },
  group: {
    marginBottom: {
      default: stylex.env.spacing(1),
      ":last-child": 0,
    },
  },
  // Rows run edge to edge and meet the input and footer borders, so their
  // highlight is a full band.
  list: {
    padding: 0,
  },
  // Square, full-width rows, inset like the input so the logo lines up
  // with its icon. Taller than a select option, for the logo and two lines.
  item: {
    borderRadius: 0,
    gap: stylex.env.spacing(3),
    paddingInline: stylex.env.spacing(4),
    justifyContent: "flex-start",
    height: stylex.env.spacing(12),
    // A group's first row (its label is the first child) brings the label
    // into view with it: the label's 6px padding twice plus its 1rem line.
    // Arrowing up to the very first row then scrolls the list to the top.
    scrollMarginTop: {
      default: null,
      ":nth-child(2)": `calc(${stylex.env.spacing(3)} + 1rem)`,
    },
  },
  itemText: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    minWidth: 0,
  },
  name: {
    overflow: "hidden",
    color: colors.gray11,
    textOverflow: "ellipsis",
  },
  meta: {
    gap: stylex.env.spacing(1.5),
    alignItems: "center",
    color: colors.gray11,
    display: "flex",
    flexShrink: 0,
  },
  empty: {
    paddingBlock: stylex.env.spacing(10),
    color: colors.gray11,
    textAlign: "center",
  },
  loading: {
    display: "flex",
    justifyContent: "center",
  },
  footer: {
    gap: stylex.env.spacing(4),
    paddingBlock: stylex.env.spacing(2.5),
    paddingInline: stylex.env.spacing(4),
    alignItems: "center",
    color: colors.gray11,
    display: "flex",
    flexShrink: 0,
    borderTopColor: colors.whiteA2,
    borderTopStyle: "solid",
    borderTopWidth: 0.5,
  },
  hint: {
    gap: stylex.env.spacing(1.5),
    alignItems: "center",
    display: "flex",
  },
  srOnly: {
    margin: -1,
    padding: 0,
    borderWidth: 0,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    position: "absolute",
    whiteSpace: "nowrap",
    height: 1,
    width: 1,
  },
});

/**
 * The palette's field and results. Mounted while the dialog is open, so each
 * opening starts empty and rereads the recent searches.
 */
const SearchPalette = ({ onClose }: { onClose: () => void }) => {
  const navigate = useNavigate();
  const hintsId = useId();
  const [query, setQuery] = useState("");
  const recent = useMemo(() => readRecentSearches(), []);
  const term = normalizeSearchTerm(query);
  const valid = term === "" || isValidSearchTerm(term);
  // Throttled, not debounced, as IBKR's search box: the first keystroke
  // searches at once, then at most once a second while typing goes on.
  const [searched] = useThrottledValue(valid ? term : "", {
    wait: SEARCH_INTERVAL,
  });
  // Nothing reaches IBKR (or opens the brokerage session) until something
  // is typed. This one fetches, at the throttle's pace.
  const search = useQuery({
    ...contractSearchQuery(searched),
    enabled: searched !== "",
  });
  // Only ever the results for what's typed now: from the cache at once if
  // it was searched before, else none until they arrive. Old results never
  // linger, so Enter can't open a match for an earlier term.
  const current = useQuery({
    ...contractSearchQuery(term),
    enabled: false,
  });
  const failed = searched === term && search.isError;

  const results = term === "" || !valid ? [] : (current.data ?? []);
  const groups: SearchGroup[] =
    term === ""
      ? [{ value: "Recent", items: recent }]
      : [{ value: "Results", items: results }];

  // Waiting on the throttle or on IBKR for what's typed now.
  const pending = term !== "" && valid && current.data === undefined && !failed;

  const emptyMessage = (() => {
    if (term === "") {
      return "Search by ticker or company name.";
    }
    if (!valid) {
      return "Use letters, numbers, spaces, and - & . only.";
    }
    if (failed) {
      return "Search failed. Try again.";
    }
    return `No results for "${query.trim()}".`;
  })();

  const hasRows = groups.some((group) => group.items.length > 0);
  let emptyState: ReactNode = null;
  if (!hasRows) {
    // The spinner in the list's place while the results load; the text is
    // for screen readers.
    emptyState = pending ? (
      <div {...stylex.props(styles.empty, styles.loading)}>
        <Classic size={20} color={colors.gray11} />
        <span {...stylex.props(styles.srOnly)}>Searching…</span>
      </div>
    ) : (
      <div {...stylex.props(text[14], styles.empty)}>{emptyMessage}</div>
    );
  }

  const open = (result: SearchResult) => {
    saveRecentSearch(result);
    onClose();
    void navigate({
      to: "/dashboard/assets/$symbol",
      params: { symbol: searchResultSlug(result) },
    });
  };

  return (
    <Autocomplete.Root
      open
      inline
      items={groups}
      value={query}
      onValueChange={setQuery}
      // IBKR already matched them; Base UI's own filter would drop results
      // matched by company name.
      filter={null}
      itemToStringValue={(item: SearchResult) => item.symbol}
      autoHighlight="always"
      keepHighlight
    >
      <Autocomplete.InputGroup {...stylex.props(styles.inputGroup)}>
        <MagnifyingGlassIcon aria-hidden {...stylex.props(styles.icon)} />
        <Autocomplete.Input
          type="search"
          aria-label="Search stocks, ETFs, and more"
          aria-describedby={hintsId}
          placeholder="Search stocks, ETFs, and more"
          {...stylex.props(text[14], styles.input)}
        />
      </Autocomplete.InputGroup>
      <Dialog.Close {...stylex.props(styles.srOnly)}>Close search</Dialog.Close>
      <PopupScroll contentStyle={styles.list}>
        <Autocomplete.Status>
          {/* Announced and shown only while there are no rows. */}
          {emptyState}
        </Autocomplete.Status>
        <Autocomplete.List aria-busy={pending || undefined}>
          {(group: SearchGroup) =>
            group.items.length > 0 ? (
              <Autocomplete.Group
                key={group.value}
                items={group.items}
                {...stylex.props(styles.group)}
              >
                <Autocomplete.GroupLabel
                  {...stylex.props(popupStyles.groupLabel, styles.groupLabel)}
                >
                  {group.value}
                </Autocomplete.GroupLabel>
                <Autocomplete.Collection>
                  {(item: SearchResult) => (
                    <Autocomplete.Item
                      key={item.conid}
                      value={item}
                      onClick={() => open(item)}
                      {...stylex.props(popupStyles.item, styles.item)}
                    >
                      <TickerLogo
                        key={item.conid}
                        conid={item.conid}
                        symbol={item.symbol}
                        size={32}
                      />
                      <span {...stylex.props(styles.itemText)}>
                        <span {...stylex.props(text[14])}>{item.symbol}</span>
                        <span {...stylex.props(text[12], styles.name)}>
                          {item.name}
                        </span>
                      </span>
                      <span {...stylex.props(text[12], styles.meta)}>
                        <ExchangeFlag exchange={item.exchange} />
                        {item.exchange}
                      </span>
                    </Autocomplete.Item>
                  )}
                </Autocomplete.Collection>
              </Autocomplete.Group>
            ) : null
          }
        </Autocomplete.List>
      </PopupScroll>
      <div id={hintsId} {...stylex.props(text[12], styles.footer)}>
        <span {...stylex.props(styles.hint)}>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          Navigate
        </span>
        <span {...stylex.props(styles.hint)}>
          <Kbd>↵</Kbd>
          Open
        </span>
        <span {...stylex.props(styles.hint)}>
          <Kbd>Esc</Kbd>
          Close
        </span>
      </div>
    </Autocomplete.Root>
  );
};

/**
 * The nav's search: a field-like button that opens a command palette
 * (Base UI's Dialog around an inline Autocomplete), also on ⌘K / Ctrl K.
 */
export const GlobalSearch = () => {
  const [open, setOpen] = useState(false);
  useHotkey(OPEN_HOTKEY, () => setOpen((wasOpen) => !wasOpen));

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger {...stylex.props(text[14], styles.trigger)}>
        <MagnifyingGlassIcon aria-hidden {...stylex.props(styles.icon)} />
        <span {...stylex.props(styles.triggerLabel)}>
          Search stocks, ETFs, and more
        </span>
        <Hotkey hotkey={OPEN_HOTKEY} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop {...stylex.props(styles.backdrop)} />
        <Dialog.Viewport {...stylex.props(styles.viewport)}>
          <Dialog.Popup aria-label="Search" {...stylex.props(styles.popup)}>
            <SearchPalette onClose={() => setOpen(false)} />
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
