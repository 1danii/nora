import { whiteA } from "@radix-ui/colors";
import type { ReactNode } from "react";
import { instant } from "skullet";
import { SkulletProvider, useSkullet } from "skullet/react";

export { Skeleton, SkeletonBox, SkeletonSuspense } from "skullet/react";

/**
 * The app is always dark, so only the dark colours are set. Radius is left to
 * skullet: a text bar is rounded by a third of its height, and images and
 * controls keep their own `border-radius`.
 */
const theme = {
  dark: { base: whiteA.whiteA1, highlight: whiteA.whiteA2 },
  animation: "shimmer",
  speed: "slow",
} as const;

/** Themes every `Skeleton` inside; mounted once in the root route. */
export const SkeletonProvider = ({ children }: { children: ReactNode }) => (
  <SkulletProvider mode="dark" theme={theme}>
    {children}
  </SkulletProvider>
);

/**
 * Skeletons inside swap to their content at once: no crossfade and no height
 * animation. A nested provider replaces the outer settings, so it copies them.
 */
export const InstantReveal = ({ children }: { children: ReactNode }) => {
  const config = useSkullet();
  return (
    <SkulletProvider {...config} reveal={instant}>
      {children}
    </SkulletProvider>
  );
};
