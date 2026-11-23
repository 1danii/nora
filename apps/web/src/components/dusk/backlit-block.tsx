import * as stylex from "@stylexjs/stylex";

import { colors } from "@/styles/tokens.stylex";

import { duskBands, duskMask, easedFade } from "./dusk";
import type { DuskSettings } from "./dusk";

export interface BacklitSettings {
  /** Top edge position, in % of the gradient height relative to the light stop. */
  anchor: number;
  blur: number;
  /** See-through glass: the block fades with the sky's own round mask. */
  glass: boolean;
  /** 0 keeps the block solid, 1 is the sky's full mask. */
  glassAmount: number;
  intensity: number;
  offset: number;
  radius: number;
  rimOpacity: number;
  rimWidth: number;
  spread: number;
  /** Tilt in degrees around the bottom edge; positive leans the top away. */
  tilt: number;
  /** Perspective distance in px for the tilt; smaller is more dramatic. */
  perspective: number;
  topEdge: number;
  width: number;
}

export const backlitDefaults = {
  anchor: -8,
  blur: 64,
  glass: false,
  glassAmount: 1,
  intensity: 0.15,
  offset: -12,
  radius: 12,
  rimOpacity: 0.8,
  rimWidth: 1,
  spread: 0,
  perspective: 1200,
  tilt: 12,
  topEdge: 0.05,
  width: 50,
} satisfies BacklitSettings;

const styles = stylex.create({
  // The block's box; also used, without a surface, for its outer glow.
  block: (
    width: number,
    top: number,
    radius: number,
    boxShadow: string,
    transform: string
  ) => ({
    borderRadius: `${radius}px`,
    aspectRatio: "16 / 9",
    boxShadow,
    position: "absolute",
    transform,
    transformOrigin: "50% 100%",
    left: "50%",
    top: `${top}%`,
    width: `${width}vw`,
  }),
  surface: {
    backgroundColor: colors.gray1,
  },
  // Spans the gradient box, so mask stops are gradient percentages. Masking
  // a wrapper fades the block, its glow and its rim together (glass).
  layer: (maskImage: string) => ({
    inset: 0,
    maskImage,
    position: "absolute",
  }),
  // A gradient border: the padding box is cut out with a mask, leaving a
  // `width`-px rim. Its background is the sky itself, sized and offset to
  // line up with the gradient, so every point of the rim takes the color of
  // the sky directly behind it.
  rim: (
    width: number,
    opacity: number,
    backgroundImage: string,
    backgroundSize: string,
    backgroundPosition: string
  ) => ({
    inset: 0,
    padding: `${width}px`,
    backgroundPosition,
    borderRadius: "inherit",
    backgroundImage,
    backgroundRepeat: "no-repeat",
    backgroundSize,
    maskClip: "content-box, border-box",
    maskComposite: "exclude",
    maskImage: "linear-gradient(#000 0 0), linear-gradient(#000 0 0)",
    opacity,
    pointerEvents: "none",
    position: "absolute",
  }),
});

// Opaque down to `from`, then the sky's eased fade to transparent at `to`.
const fadeMask = (from: number, to: number) =>
  `linear-gradient(${easedFade(from, to).join(", ")})`;

const mix = (color: string, alpha: number) =>
  `color-mix(in oklab, ${color} ${Math.min(1, alpha) * 100}%, transparent)`;

// The top edge sits in the brightest band (the horizon light), so the light
// comes from behind and above: the glow spills upward.
const glowShadow = (s: BacklitSettings, light: string) =>
  [
    `0 ${s.offset}px ${s.blur}px ${s.spread}px ${mix(light, s.intensity)}`,
    `0 ${s.offset * 1.5}px ${s.blur * 2}px 0 ${mix(light, s.intensity * 0.25)}`,
  ].join(", ");

/**
 * A blank 16:9 block in the page color, standing in front of the sunset.
 * Render it as a child of `Dusk`, which positions children in gradient space.
 */
export const BacklitBlock = ({
  mask,
  settings: s,
  sky,
}: {
  mask: DuskSettings["mask"];
  settings: BacklitSettings;
  sky: DuskSettings["gradient"];
}) => {
  const top = sky.lightStop + s.anchor;
  // Centered, then tilted back around the bottom edge (shared by the glow and
  // the surface so they stay aligned).
  const transform = `translateX(-50%) perspective(${s.perspective}px) rotateX(${s.tilt}deg)`;
  // Faint sky light catching the top edge.
  const topEdge =
    s.topEdge > 0 ? `inset 0 1px 0 rgb(255 255 255 / ${s.topEdge})` : "none";
  // Size and offset that line a background/mask up with the sky gradient.
  const skySize = `${sky.width}vw ${sky.height}vh`;
  const skyPosition = `calc((${s.width}vw - ${sky.width}vw) / 2) calc(${-top} * ${sky.height}vh / 100)`;
  // The outer glow is light from the horizon band, so it fades out from the
  // top edge down to the glow stop (where the orange peaks), instead of outlining the
  // block's sides against the dark ground.
  const glow = (
    <div {...stylex.props(styles.layer(fadeMask(top, sky.glowStop)))}>
      <div
        {...stylex.props(
          styles.block(
            s.width,
            top,
            s.radius,
            glowShadow(s, sky.light),
            transform
          )
        )}
      />
    </div>
  );
  const surface = (
    <div
      {...stylex.props(
        styles.block(s.width, top, s.radius, topEdge, transform),
        styles.surface
      )}
    >
      <div
        {...stylex.props(
          styles.rim(
            s.rimWidth,
            s.rimOpacity,
            duskBands(sky),
            skySize,
            skyPosition
          )
        )}
      />
    </div>
  );
  // Glass: a constant floor (how solid the block stays) unioned with the
  // sky's round mask.
  const glass = s.glass
    ? `linear-gradient(rgb(0 0 0 / ${1 - s.glassAmount}) 0 0), ${duskMask(sky, mask)}`
    : null;
  const block = (
    <>
      {glow}
      {surface}
    </>
  );
  return glass ? (
    <div {...stylex.props(styles.layer(glass))}>{block}</div>
  ) : (
    block
  );
};
