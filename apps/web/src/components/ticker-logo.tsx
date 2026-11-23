import * as stylex from "@stylexjs/stylex";
import { useState } from "react";

import { SkeletonBox } from "@/components/ui/skeleton";
import { assetLogoUrl } from "@/lib/ibkr-logos";
import { text } from "@/styles/text";
import { colors, radius } from "@/styles/tokens.stylex";

const styles = stylex.create({
  logo: {
    overflow: "hidden",
    alignItems: "center",
    color: colors.gray11,
    display: "grid",
    flexShrink: 0,
    justifyItems: "center",
    position: "relative",
  },
  // The box owns the background, so it shows through a transparent logo, and
  // a ring like the outline button's (0.5px whiteA2), drawn over the image.
  // Both off while loading, so the skeleton matches the page skeleton's block.
  filled: {
    backgroundColor: colors.gray2,
    "::after": {
      inset: 0,
      borderRadius: "inherit",
      boxShadow: `inset 0 0 0 0.5px ${colors.whiteA2}`,
      content: '""',
      pointerEvents: "none",
      position: "absolute",
    },
  },
  layer: {
    gridColumn: 1,
    gridRow: 1,
    height: "100%",
    width: "100%",
  },
  image: {
    objectFit: "cover",
  },
  // Kept in the layout so it loads, but unseen until it has.
  imageLoading: {
    opacity: 0,
  },
});

/** The asset page's header logo, and a list row's. */
const sizes = stylex.create({
  48: {
    borderRadius: radius.lg,
    height: stylex.env.spacing(12),
    width: stylex.env.spacing(12),
  },
  // The 48px logo's corner, scaled down.
  32: {
    borderRadius: 6,
    height: stylex.env.spacing(8),
    width: stylex.env.spacing(8),
  },
});

/** The fallback letter's type, in proportion to the box. */
const letterTypes = { 48: text[16], 32: text[12] } as const;

export type TickerLogoSize = keyof typeof letterTypes;

type LogoStatus = "loading" | "loaded" | "failed";

/**
 * IBKR's logo for the contract: a skeleton while it loads, then the image,
 * or the ticker's first letter when there is none.
 * Key it by conid, so a new asset starts with a fresh image.
 */
export const TickerLogo = ({
  conid,
  symbol,
  size = 48,
}: {
  conid: number;
  symbol: string;
  size?: TickerLogoSize;
}) => {
  const [status, setStatus] = useState<LogoStatus>("loading");
  return (
    // Decorative: the name sits right next to it.
    <div
      aria-hidden="true"
      {...stylex.props(
        letterTypes[size],
        styles.logo,
        sizes[size],
        status !== "loading" && styles.filled
      )}
    >
      {status === "failed" ? (
        symbol.charAt(0)
      ) : (
        <>
          {status === "loading" && (
            // Size passed as props: SkeletonBox sets it inline, over any class.
            // The box's own radius, like the block the page skeleton draws.
            <SkeletonBox
              height="100%"
              radius="inherit"
              width="100%"
              {...stylex.props(styles.layer)}
            />
          )}
          <img
            alt=""
            draggable={false}
            onError={() => setStatus("failed")}
            onLoad={() => setStatus("loaded")}
            // Catches a load or error that fired before hydration attached the handlers.
            ref={(image) => {
              if (image?.complete) {
                setStatus(image.naturalWidth > 0 ? "loaded" : "failed");
              }
            }}
            src={assetLogoUrl(conid, size)}
            {...stylex.props(
              styles.layer,
              styles.image,
              status === "loading" && styles.imageLoading
            )}
          />
        </>
      )}
    </div>
  );
};

/** An empty, filled logo box, for skeletons drawn from sample data. */
export const TickerLogoPlaceholder = ({
  size = 48,
}: {
  size?: TickerLogoSize;
}) => <div {...stylex.props(styles.logo, sizes[size], styles.filled)} />;
