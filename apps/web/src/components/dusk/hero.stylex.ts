import * as stylex from "@stylexjs/stylex";

/**
 * The landing hero's layout above the backlit block, in px so it holds at any
 * screen height: the hero's bottom sits `gap` above the block, and its top
 * never closer than `minTop` to the top of the page; when it would be, the
 * sky and the block move down instead.
 */
export const heroLayout = stylex.defineVars({
  // Below the nav (72px) with room to breathe. It grows with the screen from
  // a 390px phone to 768px (16px over those 378px) instead of jumping at a
  // breakpoint.
  minTop: `clamp(${stylex.env.spacing(36)}, ${stylex.env.spacing(36)} + (100vw - 390px) * 0.0423, ${stylex.env.spacing(40)})`,
  // The same at every size.
  gap: stylex.env.spacing(16),
  // The hero's height at each breakpoint; update it with the hero's content.
  // Only the `minTop` limit reads it: the hero is placed by its bottom, so a
  // different wrap moves its top, never into the block.
  height: {
    // Two 40px heading lines, the 16px gap, two 20px description lines, the
    // 24px gap and the 44px button.
    default: `calc(${stylex.env.spacing(20)} + ${stylex.env.spacing(4)} + ${stylex.env.spacing(10)} + ${stylex.env.spacing(6)} + ${stylex.env.spacing(11)})`,
    // Two 48px heading lines, the 16px gap and the 44px button row.
    // Ranges that don't overlap: defineVars doesn't order its media queries.
    "@media (640px <= width < 1024px)": `calc(${stylex.env.spacing(24)} + ${stylex.env.spacing(4)} + ${stylex.env.spacing(11)})`,
    // Two 60px heading lines, the 16px gap and the 44px button row.
    "@media (width >= 1024px)": `calc(${stylex.env.spacing(30)} + ${stylex.env.spacing(4)} + ${stylex.env.spacing(11)})`,
  },
});
