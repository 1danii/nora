import * as stylex from "@stylexjs/stylex";

import { NoraSymbol } from "@/components/brand/nora-logo";
import { duskDefaults } from "@/components/dusk/dusk";
import { smoothGradient } from "@/components/dusk/smooth-gradient";
import { colors } from "@/styles/tokens.stylex";

const g = duskDefaults.gradient;

/*
 * The index page's dusk bands, laid on their side: night, sky, light, glow,
 * then the ground, at the same relative stops and along the same smooth oklab
 * curve, so the sweep is a sliver of that sky.
 */
const span = g.bottomStop - g.topStop;
const at = (stop: number) => ((stop - g.topStop) / span) * 100;
const bands = `linear-gradient(90deg in oklab, ${smoothGradient(
  [
    [g.top, at(g.topStop)],
    [g.sky, at(g.skyStop)],
    [g.light, at(g.lightStop)],
    [g.glow, at(g.glowStop)],
    [g.bottom, at(g.bottomStop)],
  ],
  "oklab"
).join(", ")})`;

const trackWidth = 160;
const sweepWidth = 72;

/** The sweep enters from the left edge of the track and leaves past the right. */
const sweep = stylex.keyframes({
  from: { transform: `translateX(-${sweepWidth}px)` },
  to: { transform: `translateX(${trackWidth}px)` },
});

const duration = 1.4;

/** Above the page and its popups (50), so nothing shows through. */
const loaderLayer = 100;

const styles = stylex.create({
  root: {
    inset: 0,
    gap: 28,
    alignItems: "center",
    // The app's background, so the fading copy covers the page beneath it
    // and fades out as one piece.
    backgroundColor: colors.gray1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    // Always the whole viewport, over everything: the router renders it in
    // the pending route's place, which can be deep in a page (e.g. under the
    // dashboard header), not at the top of the document.
    position: "fixed",
    zIndex: loaderLayer,
  },
  logo: {
    color: colors.gray12,
    // The ring at its former size; the symbol's box no longer pads it.
    height: 48,
  },
  // A horizon under the ring sun, the dusk sky sliding along it.
  track: {
    borderRadius: 9999,
    overflow: "hidden",
    backgroundColor: colors.gray2,
    position: "relative",
    height: 2,
    width: trackWidth,
  },
  sweep: {
    borderRadius: 9999,
    animationDuration: `${duration}s`,
    animationIterationCount: "infinite",
    // Without motion, the sweep rests in the middle of the horizon.
    animationName: {
      default: sweep,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationTimingFunction: "cubic-bezier(0.645, 0.045, 0.355, 1)",
    // Both ends fade out, so the sweep has no hard edges on the track.
    maskImage:
      "linear-gradient(90deg, transparent, black 25%, black 80%, transparent)",
    position: "absolute",
    transform: {
      default: null,
      "@media (prefers-reduced-motion: reduce)": `translateX(${(trackWidth - sweepWidth) / 2}px)`,
    },
    height: "100%",
    left: 0,
    top: 0,
    width: sweepWidth,
  },
  // Dynamic: the bands are computed from the dusk settings, which StyleX
  // can't evaluate at build time.
  bands: (backgroundImage: string) => ({ backgroundImage }),
});

const fadeOutMs = 150;

/*
 * Runs the sweep on the page's clock instead of from mount. Routes rendered
 * data-only send this loader in the server HTML; on hydration React hides that
 * copy and mounts a new one, which would restart the sweep mid-run. On the
 * shared clock the new copy picks up where the old one was.
 */
const syncToPageClock = (element: Element) => {
  for (const animation of element.getAnimations({ subtree: true })) {
    animation.startTime = 0;
  }
};

/*
 * React removes a pending component the moment its route is ready, so there
 * is no time to animate it out in place. Instead a copy takes its spot, fixed
 * over the new page, and fades out: the loader crossfades into the page.
 */
const fadeOut = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  const ghost = element.cloneNode(true);
  if (!(ghost instanceof HTMLElement) || rect.width === 0) {
    return;
  }
  // React also detaches the ref when Suspense only hides the loader (as it
  // does to the server copy on hydration). Once the commit is done, a hidden
  // loader is still in the document; only a removed one fades.
  queueMicrotask(() => {
    if (element.isConnected) {
      return;
    }
    ghost.inert = true;
    ghost.removeAttribute("aria-busy");
    ghost.removeAttribute("aria-label");
    ghost.setAttribute("aria-hidden", "true");
    Object.assign(ghost.style, {
      height: `${rect.height}px`,
      left: `${rect.left}px`,
      margin: "0",
      pointerEvents: "none",
      position: "fixed",
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      zIndex: String(loaderLayer),
    });
    document.body.append(ghost);
    // The copy's sweep starts afresh; put it back on the shared clock.
    syncToPageClock(ghost);
    const fade = ghost.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: fadeOutMs,
      easing: "ease-out",
    });
    const remove = () => ghost.remove();
    fade.addEventListener("finish", remove);
    fade.addEventListener("cancel", remove);
  });
};

const loaderRef = (element: HTMLOutputElement) => {
  syncToPageClock(element);
  return () => fadeOut(element);
};

/** Full-screen loader: the ring sun over a horizon with a dusk sweep. */
const Loader = () => (
  <output
    {...stylex.props(styles.root)}
    aria-busy="true"
    aria-label="Loading"
    ref={loaderRef}
  >
    <NoraSymbol style={styles.logo} />
    <div {...stylex.props(styles.track)}>
      <div {...stylex.props(styles.sweep, styles.bands(bands))} />
    </div>
  </output>
);

export default Loader;
