import * as stylex from "@stylexjs/stylex";

/**
 * The backlit block's size. Shared by the block and by content aligned to it
 * (the landing hero), so both read one value.
 */
export const backlit = stylex.defineVars({
  // 16:9, so the height is this times 9 / 16. Narrower screens keep the
  // header's 32px on each side.
  width: `min(${stylex.env.spacing(299)}, 100vw - 2 * ${stylex.env.spacing(8)})`,
  // Smaller with the block below 1024px, where the screen inside shrinks.
  radius: {
    default: stylex.env.spacing(2),
    "@media (width >= 1024px)": stylex.env.spacing(3),
  },
});
