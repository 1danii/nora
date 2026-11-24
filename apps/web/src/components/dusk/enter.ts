import type { TransitionConfig } from "dialkit";
import { animate } from "motion";
import { useMotionValue, useReducedMotion } from "motion/react";
import { useEffect, useEffectEvent } from "react";

export const enterAnimations = [
  "none",
  "fade",
  "settle",
  "rise",
  "bloom",
  "spread",
  "exposure",
] as const;

export interface EnterFrame {
  filter: string;
  maskHeight: number;
  maskWidth: number;
  opacity: number;
  transform: string;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

const rest: EnterFrame = {
  filter: "none",
  maskHeight: 1,
  maskWidth: 1,
  opacity: 1,
  transform: "none",
};

// Each animation maps progress (0 → 1, already eased) to how the dusk looks.
// Mask values scale the mask's own width and height.
export const enterFrame = (animation: string, p: number): EnterFrame => {
  // Every animation ends at rest. Returning it exactly drops the leftover
  // `brightness(1) blur(0px)`, which would keep a full-screen filter alive.
  if (p >= 1) {
    return rest;
  }
  switch (animation) {
    // The sky simply fades up out of the dark.
    case "fade": {
      return { ...rest, opacity: p };
    }
    // Sunset: the light starts higher and brighter, then sinks into place
    // and dims.
    case "settle": {
      return {
        ...rest,
        filter: `brightness(${lerp(1.6, 1, p)})`,
        opacity: clamp(p * 2),
        transform: `translateY(${lerp(-14, 0, p)}vh)`,
      };
    }
    // The glow comes up from below the horizon.
    case "rise": {
      return {
        ...rest,
        opacity: clamp(p * 1.5),
        transform: `translateY(${lerp(22, 0, p)}vh)`,
      };
    }
    // Light blooms outward from the horizon.
    case "bloom": {
      return {
        ...rest,
        maskHeight: lerp(0.08, 1, p),
        maskWidth: lerp(0.08, 1, p),
        opacity: clamp(p * 3),
      };
    }
    // A thin line of light spreads along the horizon, then climbs.
    case "spread": {
      return {
        ...rest,
        maskHeight: lerp(0.04, 1, clamp((p - 0.25) / 0.75)),
        maskWidth: lerp(0.02, 1, clamp(p / 0.6)),
        opacity: clamp(p * 4),
      };
    }
    // Like eyes adjusting, or film developing: dark and blurry to sharp.
    case "exposure": {
      return {
        ...rest,
        filter: `brightness(${p}) blur(${lerp(24, 0, p)}px)`,
      };
    }
    default: {
      return rest;
    }
  }
};

const toMotion = (transition: TransitionConfig, delay: number) =>
  transition.type === "easing"
    ? { delay, duration: transition.duration, ease: transition.ease }
    : { ...transition, delay };

// Plays the enter progress (a motion value, so frames never re-render React)
// on mount, whenever the animation changes, and whenever `replayKey` changes.
// With reduced motion or no animation it sits at the end state.
export const useEnterProgress = (
  animation: string,
  transition: TransitionConfig,
  delay: number,
  replayKey: number
) => {
  const reduceMotion = useReducedMotion();
  const progress = useMotionValue(0);
  const isStatic = reduceMotion === true || animation === "none";

  const play = useEffectEvent((_animation: string, _replayKey: number) => {
    progress.jump(0);
    return animate(progress, 1, toMotion(transition, delay));
  });

  useEffect(() => {
    if (isStatic) {
      progress.jump(1);
      return;
    }
    const controls = play(animation, replayKey);
    return () => controls.stop();
  }, [animation, isStatic, progress, replayKey]);

  return progress;
};
