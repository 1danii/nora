import type { radixColors } from "./radix-colors";
import "@stylexjs/stylex/lib/types/StyleXTypes";

declare module "@stylexjs/stylex/lib/types/StyleXTypes" {
  interface Register {
    /** Compile-time values, configured in vite.config.ts. */
    env: {
      colors: typeof radixColors;
      /** Multiples of 4px: `spacing(4)` is `16px`. */
      spacing: (step: number) => string;
    };
  }
}
