import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { text } from "@/styles/text";
import { colors } from "@/styles/tokens.stylex";

const styles = stylex.create({
  facts: {
    margin: 0,
    gap: stylex.env.spacing(4),
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
  },
  fact: {
    gap: stylex.env.spacing(1),
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  // An icon, such as a currency's flag, before the label.
  label: {
    gap: stylex.env.spacing(1.5),
    alignItems: "center",
    color: colors.gray11,
    display: "flex",
  },
  value: {
    margin: 0,
    color: colors.gray12,
    fontVariantNumeric: "tabular-nums",
  },
});

export interface Fact {
  label: string;
  value: ReactNode;
  /** Drawn before the label, e.g. a currency's flag. */
  icon?: ReactNode;
}

/** Labelled values in a grid, e.g. "P/E" over "35.12". */
export const FactGrid = ({ facts }: { facts: readonly Fact[] }) => (
  <dl {...stylex.props(styles.facts)}>
    {facts.map(({ label, value, icon }) => (
      <div key={label} {...stylex.props(styles.fact)}>
        <dt {...stylex.props(text[12], styles.label)}>
          {icon}
          {label}
        </dt>
        <dd {...stylex.props(text[14], styles.value)}>{value}</dd>
      </div>
    ))}
  </dl>
);
