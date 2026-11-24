import * as stylex from "@stylexjs/stylex";
import type { Schema } from "effect";

import { text } from "@/styles/text";
import { colors } from "@/styles/tokens.stylex";

const styles = stylex.create({
  raw: {
    color: colors.gray11,
    cursor: "pointer",
  },
  json: {
    overflow: "auto",
    whiteSpace: "pre",
    maxHeight: 320,
  },
});

/**
 * What IBKR sent, as JSON, folded away. For responses IBKR doesn't
 * document, shown while we learn their shape.
 */
export const RawData = ({ data }: { data: Schema.Json }) => (
  <details {...stylex.props(text[12], styles.raw)}>
    <summary>Raw data</summary>
    <pre {...stylex.props(styles.json)}>{JSON.stringify(data, null, 2)}</pre>
  </details>
);
