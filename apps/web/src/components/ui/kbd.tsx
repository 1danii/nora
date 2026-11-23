import * as stylex from "@stylexjs/stylex";
import { useFormatForDisplay } from "@tanstack/react-hotkeys";
import type {
  DisplayHotkey,
  DisplayHotkeyChord,
  HotkeyPlatform,
} from "@tanstack/react-hotkeys";
import { Fragment } from "react";

import { platforms } from "@/lib/platform";
import { text } from "@/styles/text";
import { colors, radius } from "@/styles/tokens.stylex";

const styles = stylex.create({
  // One keycap: the outline button's fill, a solid edge, and a 1px lip at
  // the bottom.
  kbd: {
    borderRadius: radius.sm,
    // One character sits in a 16px square with no padding needed.
    paddingInline: 0,
    alignItems: "center",
    backgroundColor: colors.gray2,
    boxShadow: `0 1px 0 0.5px ${colors.gray4}, 0 0 0 0.5px ${colors.gray4}`,
    color: colors.gray12,
    display: "inline-flex",
    flexShrink: 0,
    // Set, not inherited: a keycap reads the same inside mono text.
    fontFamily: "InterVariable, system-ui, sans-serif",
    fontSize: "10px",
    fontWeight: 550,
    justifyContent: "center",
    lineHeight: 1,
    // Up by half the 1px bottom lip, so the key and its lip together are
    // centred on the line rather than the key's box alone.
    translate: "0 -0.5px",
    userSelect: "none",
    whiteSpace: "nowrap",
    height: stylex.env.spacing(4),
    minWidth: stylex.env.spacing(4),
  },
  // A chord's keys sit close; a sequence's steps a little further apart.
  root: {
    display: "inline-flex",
  },
  hotkey: {
    gap: stylex.env.spacing(1.5),
    alignItems: "center",
    display: "inline-flex",
  },
  // A word such as Esc or Ctrl gets room on its sides.
  word: {
    paddingInline: stylex.env.spacing(1),
  },
  step: {
    gap: stylex.env.spacing(1),
    alignItems: "center",
    display: "inline-flex",
  },
  // The "+" between a chord's keys.
  plus: {
    color: colors.gray11,
    userSelect: "none",
  },
});

/** More than one character (⌘ and ↑ count as one), e.g. "Esc". */
const isWord = (label: string) => [...label].length > 1;

/** One platform group's labels: per step, per key. */
interface Variant {
  id: string;
  platforms: HotkeyPlatform[];
  steps: string[][];
}

// `Array.isArray` doesn't narrow a readonly array out of a union.
const isSequence = (
  hotkey: DisplayHotkey
): hotkey is readonly DisplayHotkeyChord[] => Array.isArray(hotkey);

/** One key, e.g. `<Kbd>⌘</Kbd>`. For a shortcut, use `Hotkey`. */
export const Kbd = ({
  style,
  children,
}: {
  style?: stylex.StyleXStyles;
  /** One key's label. */
  children: string;
}) => (
  <kbd {...stylex.props(styles.kbd, isWord(children) && styles.word, style)}>
    {children}
  </kbd>
);

/**
 * A shortcut drawn one keycap per key, from the same value `useHotkey`
 * takes: a chord such as `"Mod+K"` (⌘ K on a Mac, Ctrl K elsewhere) or a
 * sequence such as `["G", "G"]`.
 */
export const Hotkey = ({
  hotkey,
  style,
}: {
  hotkey: DisplayHotkey;
  style?: stylex.StyleXStyles;
}) => {
  const formatForDisplay = useFormatForDisplay();
  // Labels for every platform, merged where they agree (Windows and Linux
  // differ only for Meta: Win vs Super). The server can't know the user's
  // platform, so it renders each set and global.css shows the one matching
  // <html data-platform>, set before first paint by the platform script.
  const variants = new Map<string, Variant>();
  for (const platform of platforms) {
    // A chord is one step; a sequence gives one array of labels per step.
    const steps = isSequence(hotkey)
      ? formatForDisplay(hotkey, { parts: true, platform })
      : [formatForDisplay(hotkey, { parts: true, platform })];
    const id = JSON.stringify(steps);
    const variant = variants.get(id);
    if (variant) {
      variant.platforms.push(platform);
    } else {
      variants.set(id, { id, platforms: [platform], steps });
    }
  }
  // Nested <kbd>s are HTML's markup for a key combination.
  return (
    <kbd {...stylex.props(styles.root, style)}>
      {[...variants.values()].map((variant) => (
        <span
          key={variant.id}
          data-platforms={variant.platforms.join(" ")}
          {...stylex.props(styles.hotkey)}
        >
          {variant.steps.map((step, stepIndex) => (
            <span
              key={`${stepIndex}:${step.join("+")}`}
              {...stylex.props(styles.step)}
            >
              {step.map((label, keyIndex) => (
                <Fragment key={`${keyIndex}:${label}`}>
                  {keyIndex > 0 ? (
                    <span aria-hidden {...stylex.props(text[12], styles.plus)}>
                      +
                    </span>
                  ) : null}
                  <Kbd>{label}</Kbd>
                </Fragment>
              ))}
            </span>
          ))}
        </span>
      ))}
    </kbd>
  );
};
