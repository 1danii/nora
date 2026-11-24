import * as stylex from "@stylexjs/stylex";
import type { TransitionConfig } from "dialkit";
import { motion, useTransform } from "motion/react";
import type { MotionStyle } from "motion/react";
import type { ReactNode } from "react";

import { enterFrame, useEnterProgress } from "./enter";
import { smoothGradient } from "./smooth-gradient";

export interface DuskSettings {
  enter: {
    animation: string;
    delay: number;
    duration: number;
    transition: TransitionConfig;
  };
  film: {
    fadeGrain: string;
    fadeGrainAmount: number;
    fadeGrainSize: number;
    grain: number;
    grainBlend: string;
    grainSize: number;
    halation: number;
    softness: number;
    vignette: number;
  };
  gradient: {
    bottom: string;
    bottomStop: number;
    glow: string;
    glowStop: number;
    height: number;
    interpolation: string;
    light: string;
    lightStop: number;
    sky: string;
    skyStop: number;
    smooth: boolean;
    top: string;
    topStop: number;
    width: number;
    y: number;
  };
  mask: { height: number; solid: number; width: number };
}

// The tuned look. Colors come from the Wonder frame: indigo1, a sky blue,
// orange12, orange9 and gray1 (Radix dark scales).
export const duskDefaults = {
  enter: {
    animation: "exposure",
    delay: 0.2,
    duration: 2,
    transition: {
      duration: 2,
      ease: [0.215, 0.61, 0.355, 1],
      type: "easing",
    },
  },
  film: {
    fadeGrain: "none",
    fadeGrainAmount: 0.5,
    fadeGrainSize: 0.8,
    grain: 0.3,
    grainBlend: "overlay",
    grainSize: 1.2,
    halation: 0.7,
    // A blur over these smooth bands is invisible but costs a full-screen
    // filter pass on every frame; 0 skips the filter entirely.
    softness: 0,
    vignette: 0.8,
  },
  gradient: {
    // gray1 (#111, the app background), so the ground the sky and the block
    // fade into is neutral and matches the page.
    bottom: "#111111",
    bottomStop: 93,
    glow: "#f76b15",
    glowStop: 80,
    height: 90,
    interpolation: "oklab",
    light: "#ffe0c2",
    lightStop: 72,
    sky: "#0680c0",
    skyStop: 57.5,
    smooth: true,
    top: "#11131f",
    topStop: 0,
    width: 100,
    y: 50,
  },
  mask: { height: 80, solid: 0, width: 60 },
} satisfies DuskSettings;

const styles = stylex.create({
  frame: {
    inset: 0,
    overflow: "hidden",
    position: "fixed",
  },
  scene: (backgroundImage: string, filter: string) => ({
    inset: "-16px",
    backgroundImage,
    filter,
    position: "absolute",
  }),
  // Wraps the masked dusk so its filter sees the faded alpha (a filter on the
  // masked element itself runs before the mask).
  enter: {
    inset: 0,
    position: "absolute",
    willChange: "transform, opacity",
  },
  filters: {
    position: "absolute",
    height: 0,
    width: 0,
  },
  // Same box as the gradient (inside the same oversized scene), so children
  // can be positioned in gradient percentages, e.g. at a color stop.
  stage: {
    inset: "-16px",
    position: "absolute",
  },
  // The gradient's box: the sky's bands, and the stage children are laid
  // out in.
  horizon: (width: string, height: string, y: number, shift: string) => ({
    position: "absolute",
    transform: "translate(-50%, -50%)",
    height,
    left: "50%",
    top: `calc(${y}% + ${shift})`,
    width,
  }),
  bands: (backgroundImage: string) => ({
    backgroundImage,
  }),
  halation: (top: number, color: string, opacity: number) => ({
    backgroundImage: `radial-gradient(ellipse 50% 50% at 50% 50%, ${color}, transparent)`,
    filter: "blur(24px)",
    mixBlendMode: "screen",
    opacity,
    position: "absolute",
    transform: "translate(-50%, -50%)",
    height: "10%",
    left: "50%",
    top: `${top}%`,
    width: "80%",
  }),
  // Darkens the edges into a halo around the sky, fading out over the dark
  // ground below it: there it only stepped the near-black into bands.
  vignette: (strength: number, maskImage: string) => ({
    inset: 0,
    backgroundImage: `radial-gradient(ellipse 75% 75% at 50% 50%, transparent 40%, rgb(0 0 0 / ${strength}))`,
    maskImage,
    position: "absolute",
  }),
  grain: (backgroundImage: string, blend: string, opacity: number) => ({
    inset: 0,
    backgroundImage,
    mixBlendMode: blend,
    opacity,
    pointerEvents: "none",
    position: "absolute",
  }),
});

// Below this viewport width the sky stops shrinking: narrow screens show its
// middle, cropped, instead of a squeezed sunset.
const SKY_MIN_VIEWPORT = 1280;

/** The sky's width as a CSS length: `width`vw, but never narrower than it is at 1280px. */
export const skyWidth = (g: DuskSettings["gradient"]) =>
  `max(${g.width}vw, ${(g.width * SKY_MIN_VIEWPORT) / 100}px)`;

/** The sky's top-to-bottom color bands, as a CSS gradient. */
export const duskBands = (g: DuskSettings["gradient"]) => {
  const stops: [string, number][] = [
    [g.top, g.topStop],
    [g.sky, g.skyStop],
    [g.light, g.lightStop],
    [g.glow, g.glowStop],
    [g.bottom, g.bottomStop],
  ];
  const bandStops = g.smooth
    ? smoothGradient(stops, g.interpolation === "srgb" ? "srgb" : "oklab")
    : stops.map(([color, position]) => `${color} ${position}%`);
  return `linear-gradient(in ${g.interpolation}, ${bandStops.join(", ")})`;
};

const noise = (frequency: number) => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${frequency}' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

const SMOOTH_STEPS = 12;
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** Smoothstep alpha fade from `solid`% to `end`%, as gradient stops. */
export const easedFade = (solid: number, end = 100) =>
  Array.from({ length: SMOOTH_STEPS + 1 }, (_, step) => {
    const t = step / SMOOTH_STEPS;
    const alpha = 1 - smoothstep(t);
    return `rgb(0 0 0 / ${alpha}) ${solid + (end - solid) * t}%`;
  });

/** `easedFade` between two CSS lengths, as gradient stops. */
export const easedFadeBetween = (from: string, to: string) =>
  Array.from({ length: SMOOTH_STEPS + 1 }, (_, step) => {
    const t = step / SMOOTH_STEPS;
    const alpha = 1 - smoothstep(t);
    return `rgb(0 0 0 / ${alpha}) calc(${from} + (${to} - ${from}) * ${t})`;
  });

/**
 * Where a point of the sky (`stop`, in % of its height) falls on screen, as a
 * CSS length from the top. Dusk's stage is the screen grown 16px on every
 * side, and the sky is centred at `y`% of it. Terms that come out as zero are
 * left out: with the defaults, the sky's middle is at 50vh.
 */
export const skyPoint = (
  g: DuskSettings["gradient"],
  height: string,
  stop: number
) => {
  const centrePx = (g.y / 100) * 32 - 16;
  const offset = (stop - 50) / 100;
  const terms = [
    `${g.y}vh`,
    centrePx === 0 ? null : `${centrePx}px`,
    offset === 0 ? null : `${offset} * ${height}`,
  ]
    .filter(Boolean)
    .join(" + ");
  // In parentheses, so it can be subtracted.
  return `(${terms})`;
};

/**
 * The round fade-out of the sky, as a CSS mask in gradient-box coordinates.
 * `scaleWidth`/`scaleHeight` shrink it for the enter animation.
 */
const duskMask = (
  g: DuskSettings["gradient"],
  mask: DuskSettings["mask"],
  scaleWidth = 1,
  scaleHeight = 1
) => {
  const fadeStops = g.smooth
    ? easedFade(mask.solid)
    : [`black ${mask.solid}%`, "transparent 100%"];
  return `radial-gradient(ellipse ${mask.width * scaleWidth}% ${mask.height * scaleHeight}% at 50% ${g.glowStop}%, ${fadeStops.join(", ")})`;
};

// Two ways to make the fade-out grainy:
// - scatter: displaces pixels by noise, so color edges and fades spray apart.
// - dissolve: jitters the alpha with noise and sharpens it, so the soft fade
//   breaks into specks (stochastic dithering).
const FadeGrainFilters = ({
  amount,
  size,
}: {
  amount: number;
  size: number;
}) => (
  <svg aria-hidden="true" {...stylex.props(styles.filters)}>
    <filter colorInterpolationFilters="sRGB" id="dusk-scatter">
      <feTurbulence
        baseFrequency={size}
        numOctaves={1}
        result="rawNoise"
        type="fractalNoise"
      />
      <feComponentTransfer in="rawNoise" result="noise">
        <feFuncR intercept={-2} slope={5} type="linear" />
        <feFuncG intercept={-2} slope={5} type="linear" />
      </feComponentTransfer>
      <feDisplacementMap
        in="SourceGraphic"
        in2="noise"
        scale={amount * 80}
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>
    <filter colorInterpolationFilters="sRGB" id="dusk-dissolve">
      <feTurbulence
        baseFrequency={size}
        numOctaves={1}
        result="noise"
        type="fractalNoise"
      />
      <feColorMatrix
        in="noise"
        result="noiseAlpha"
        type="matrix"
        values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0"
      />
      <feComposite
        in="SourceAlpha"
        in2="noiseAlpha"
        k2={1}
        k3={amount * 2}
        k4={-amount}
        operator="arithmetic"
        result="jittered"
      />
      <feComponentTransfer in="jittered" result="speckled">
        <feFuncA intercept={-1} slope={3} type="linear" />
      </feComponentTransfer>
      <feComposite in="SourceGraphic" in2="speckled" operator="in" />
    </filter>
  </svg>
);

// A motion.div styled with StyleX: StyleX owns the static and slider-driven
// styles, motion values own the per-frame enter animation (no React renders).
const MotionStylex = ({
  children,
  style,
  sx,
}: {
  children: ReactNode;
  style: MotionStyle;
  sx: stylex.StyleXStyles;
}) => {
  const { className, style: sxStyle } = stylex.props(sx);
  return (
    <motion.div className={className} style={{ ...sxStyle, ...style }}>
      {children}
    </motion.div>
  );
};

/** Full-screen dusk gradient with film grain and an enter animation. */
export const Dusk = ({
  children,
  height,
  replayKey = 0,
  settings,
  shift = "0px",
}: {
  /**
   * Rendered over the sky but under the vignette and grain, inside a box
   * matching the gradient, so `top: <stop>%` lines up with that color stop.
   */
  children?: ReactNode;
  /**
   * The gradient's height as a CSS length, in place of `gradient.height`vh,
   * e.g. to keep it in proportion with content on narrow screens.
   */
  height?: string;
  replayKey?: number;
  settings: DuskSettings;
  /**
   * A CSS length that moves the sky and its children down together, e.g. to
   * make room for content above them on short screens.
   */
  shift?: string;
}) => {
  const { enter, film, gradient, mask } = settings;
  const progress = useEnterProgress(
    enter.animation,
    enter.transition.type === "easing"
      ? { ...enter.transition, duration: enter.duration }
      : { ...enter.transition, visualDuration: enter.duration },
    enter.delay,
    replayKey
  );

  const g = gradient;
  const skyHeight = height ?? `${g.height}vh`;
  // Where the dark ground starts, on screen.
  const ground = `(${skyPoint(g, skyHeight, g.bottomStop)} + ${shift})`;
  // Plain top-to-bottom bands; only the mask is round, centred on the glow
  // so the bands fade out in a dome around the horizon.
  const bands = duskBands(g);
  const maskImage = useTransform(progress, (p) => {
    const frame = enterFrame(enter.animation, p);
    return duskMask(g, mask, frame.maskWidth, frame.maskHeight);
  });
  const backdrop = `linear-gradient(in ${g.interpolation}, ${g.top}, ${g.bottom})`;
  const filter = film.softness > 0 ? `blur(${film.softness}px)` : "none";
  const fadeGrainFilter =
    film.fadeGrain === "none" ? "" : `url(#dusk-${film.fadeGrain})`;
  const enterOpacity = useTransform(
    progress,
    (p) => enterFrame(enter.animation, p).opacity
  );
  const enterTransform = useTransform(
    progress,
    (p) => enterFrame(enter.animation, p).transform
  );
  const enterFilter = useTransform(progress, (p) => {
    const { filter: frameFilter } = enterFrame(enter.animation, p);
    const combined =
      `${frameFilter === "none" ? "" : frameFilter} ${fadeGrainFilter}`.trim();
    return combined || "none";
  });

  return (
    <div {...stylex.props(styles.frame)}>
      <div {...stylex.props(styles.scene(backdrop, filter))}>
        <MotionStylex
          style={{
            filter: enterFilter,
            opacity: enterOpacity,
            transform: enterTransform,
          }}
          sx={styles.enter}
        >
          <MotionStylex
            style={{ maskImage }}
            sx={[
              styles.horizon(skyWidth(g), skyHeight, g.y, shift),
              styles.bands(bands),
            ]}
          >
            <div
              {...stylex.props(
                styles.halation(g.glowStop, g.glow, film.halation)
              )}
            />
          </MotionStylex>
        </MotionStylex>
      </div>
      <div {...stylex.props(styles.stage)}>
        <div
          {...stylex.props(styles.horizon(skyWidth(g), skyHeight, g.y, shift))}
        >
          {children}
        </div>
      </div>
      {film.fadeGrain === "none" ? null : (
        <FadeGrainFilters
          amount={film.fadeGrainAmount}
          size={film.fadeGrainSize}
        />
      )}
      <div
        {...stylex.props(
          styles.vignette(
            film.vignette,
            `linear-gradient(${easedFadeBetween(ground, "100%").join(", ")})`
          )
        )}
      />
      <div
        {...stylex.props(
          styles.grain(noise(film.grainSize), film.grainBlend, film.grain)
        )}
      />
    </div>
  );
};
