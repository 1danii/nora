import * as stylex from "@stylexjs/stylex";

import { colors } from "@/styles/tokens.stylex";

import { backlit } from "./backlit.stylex";
import {
  duskBands,
  easedFade,
  easedFadeBetween,
  skyPoint,
  skyWidth,
} from "./dusk";
import type { DuskSettings } from "./dusk";

export interface BacklitSettings {
  /** Top edge position, in % of the gradient height relative to the light stop. */
  anchor: number;
  blur: number;
  /**
   * Where the screen starts fading out, in % of the sky's height (the same
   * scale as the sky's stops), so it fades with the gradient at any size.
   */
  fadeFrom: number;
  /** Where the screen has faded out, in % of the sky's height. */
  fadeTo: number;
  intensity: number;
  offset: number;
  rimOpacity: number;
  rimWidth: number;
  spread: number;
  topEdge: number;
}

// The tuned look. Size and radius are fixed in backlit.stylex.ts.
export const backlitDefaults = {
  anchor: -22,
  blur: 64,
  // From the horizon light down to the dark ground (the sky's lightStop and
  // bottomStop): the screen is gone where the sky turns black.
  fadeFrom: 72,
  fadeTo: 93,
  intensity: 0.15,
  offset: -12,
  rimOpacity: 0.8,
  rimWidth: 1,
  spread: 0,
  topEdge: 0.05,
} satisfies BacklitSettings;

/** A screenshot covering the block from its top; the bottom is cut. */
export interface BacklitScreen {
  alt: string;
  /** The image's size in CSS px: its width is the block's. */
  height: number;
  src: string;
  srcSet: string;
  width: number;
}

const BLOCK_RATIO = 16 / 9;

/** The block's height as a CSS length. */
const backlitHeight = `(${backlit.width} / ${BLOCK_RATIO})`;

/**
 * The point of the sky, in % of its height, that the block's bottom edge must
 * reach on narrow screens. It is a little past the dark ground (bottomStop
 * 93), where the sky is the block's own color, so the block's edge is never
 * seen against the glow.
 */
const BLOCK_BOTTOM_STOP = 100;

/**
 * The sky's height for a block in front of it, as a CSS length: `height`vh,
 * but no taller than lets the block (whose height follows the screen's width)
 * reach BLOCK_BOTTOM_STOP. Wide screens keep the vh height. On narrow ones
 * (phones) the block is short, so the sky is as tall as it can be: its middle
 * (the glow) fills the screen's width and its sides are cropped, and the
 * block still ends in the dark.
 */
export const backlitSkyHeight = (
  s: BacklitSettings,
  sky: DuskSettings["gradient"]
) =>
  `min(${sky.height}vh, ${backlitHeight} * ${100 / (BLOCK_BOTTOM_STOP - (sky.lightStop + s.anchor))})`;

const styles = stylex.create({
  // The block's box, centred; also used, with a shadow, for its outer glow.
  block: (top: number) => ({
    borderRadius: backlit.radius,
    aspectRatio: BLOCK_RATIO,
    position: "absolute",
    transform: "translateX(-50%)",
    left: "50%",
    top: `${top}%`,
    width: backlit.width,
  }),
  shadow: (boxShadow: string) => ({
    boxShadow,
  }),
  // The block's own color, under the screen. It covers the sky (the glow
  // never shows through the screen) until the dark ground, then fades into
  // it, so the block's outline doesn't carry on below the sky.
  surface: (boxShadow: string, maskImage: string) => ({
    inset: 0,
    borderRadius: "inherit",
    backgroundColor: colors.gray1,
    boxShadow,
    maskImage,
    position: "absolute",
  }),
  // Fills the block's width from the top, never stretched; the block cuts
  // what runs past its bottom.
  screen: {
    position: "absolute",
    height: "auto",
    left: 0,
    top: 0,
    width: "100%",
  },
  // Holds the screen and rim over the opaque surface, fading them into it.
  fade: (maskImage: string) => ({
    inset: 0,
    borderRadius: "inherit",
    overflow: "hidden",
    maskImage,
    position: "absolute",
  }),
  // Spans the gradient box, so mask stops are gradient percentages.
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

/**
 * Where the block's top edge lands on screen, as a CSS length from the top of
 * the viewport (before Dusk's `shift`). Content placed above the block can sit
 * a fixed distance from it at any viewport size.
 */
export const backlitTopEdge = (
  s: BacklitSettings,
  sky: DuskSettings["gradient"]
) => skyPoint(sky, backlitSkyHeight(s, sky), sky.lightStop + s.anchor);

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
 * An opaque 16:9 block in the page color, standing in front of the sunset,
 * optionally showing a screen. The screen and the rim fade into the block
 * further down, so its frame disappears into the dark. Render it as a child
 * of `Dusk`, which positions children in gradient space.
 */
export const BacklitBlock = ({
  screen,
  settings: s,
  sky,
}: {
  screen?: BacklitScreen;
  settings: BacklitSettings;
  sky: DuskSettings["gradient"];
}) => {
  const top = sky.lightStop + s.anchor;
  // Faint sky light catching the top edge.
  const topEdge =
    s.topEdge > 0 ? `inset 0 1px 0 rgb(255 255 255 / ${s.topEdge})` : "none";
  // Size and offset that line a background/mask up with the sky gradient.
  const skyHeight = backlitSkyHeight(s, sky);
  const skySize = `${skyWidth(sky)} ${skyHeight}`;
  const skyPosition = `calc((${backlit.width} - ${skyWidth(sky)}) / 2) calc(${-top / 100} * ${skyHeight})`;
  // The outer glow is light from the horizon band, so it fades out from the
  // top edge down to the glow stop (where the orange peaks), instead of outlining the
  // block's sides against the dark ground.
  const glow = (
    <div {...stylex.props(styles.layer(fadeMask(top, sky.glowStop)))}>
      <div
        {...stylex.props(
          styles.block(top),
          styles.shadow(glowShadow(s, sky.light))
        )}
      />
    </div>
  );
  const rim = (
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
  );
  // A point of the sky, in % of its height, as a length from the block's top.
  const fromTop = (stop: number) => `(${(stop - top) / 100} * ${skyHeight})`;
  const ground = fromTop(sky.bottomStop);
  const groundEnd = fromTop(sky.bottomStop + 15);
  const screenFade = `linear-gradient(${easedFadeBetween(fromTop(s.fadeFrom), fromTop(s.fadeTo)).join(", ")})`;
  // The screen and rim fade into the block's color with the sky; the block's
  // color fades into the ground.
  return (
    <>
      {glow}
      <div {...stylex.props(styles.block(top))}>
        <div
          {...stylex.props(
            styles.surface(
              topEdge,
              `linear-gradient(${easedFadeBetween(ground, groundEnd).join(", ")})`
            )
          )}
        />
        <div {...stylex.props(styles.fade(screenFade))}>
          {screen ? (
            <img
              alt={screen.alt}
              decoding="async"
              height={screen.height}
              src={screen.src}
              srcSet={screen.srcSet}
              width={screen.width}
              {...stylex.props(styles.screen)}
            />
          ) : null}
          {rim}
        </div>
      </div>
    </>
  );
};
