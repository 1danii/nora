import { createFileRoute } from "@tanstack/react-router";
import { DialRoot, useDialKit } from "dialkit";
import { useState } from "react";

import { Dusk, duskDefaults } from "@/components/dusk/dusk";
import { enterAnimations } from "@/components/dusk/enter";

import dialkitCss from "dialkit/styles.css?url";

const d = duskDefaults;

const DuskDesign = () => {
  const [replays, setReplays] = useState(0);
  const { enter, film, gradient, mask } = useDialKit(
    "Dusk",
    {
      enter: {
        animation: {
          type: "select",
          options: [...enterAnimations],
          default: d.enter.animation,
        },
        transition: {
          type: "easing",
          duration: d.enter.transition.duration,
          ease: d.enter.transition.ease,
        },
        // DialKit caps the easing control's own duration at 2s; this one
        // overrides it with a wider range.
        duration: [d.enter.duration, 0.1, 10, 0.1],
        delay: [d.enter.delay, 0, 3, 0.05],
        replay: { type: "action" },
      },
      gradient: {
        width: [d.gradient.width, 20, 200],
        height: [d.gradient.height, 20, 150],
        y: [d.gradient.y, 0, 100],
        interpolation: {
          type: "select",
          options: ["srgb", "oklab", "oklch", "oklch longer hue"],
          default: d.gradient.interpolation,
        },
        smooth: d.gradient.smooth,
        top: d.gradient.top,
        topStop: [d.gradient.topStop, 0, 100, 0.5],
        sky: d.gradient.sky,
        skyStop: [d.gradient.skyStop, 0, 100, 0.5],
        light: d.gradient.light,
        lightStop: [d.gradient.lightStop, 0, 100, 0.5],
        glow: d.gradient.glow,
        glowStop: [d.gradient.glowStop, 0, 100, 0.5],
        bottom: d.gradient.bottom,
        bottomStop: [d.gradient.bottomStop, 0, 100, 0.5],
      },
      mask: {
        width: [d.mask.width, 10, 150],
        height: [d.mask.height, 10, 150],
        solid: [d.mask.solid, 0, 95],
      },
      film: {
        grain: [d.film.grain, 0, 1, 0.01],
        grainSize: [d.film.grainSize, 0.2, 2, 0.05],
        grainBlend: {
          type: "select",
          options: ["overlay", "soft-light", "screen", "multiply"],
          default: d.film.grainBlend,
        },
        halation: [d.film.halation, 0, 1, 0.01],
        vignette: [d.film.vignette, 0, 1, 0.01],
        softness: [d.film.softness, 0, 6, 0.1],
        fadeGrain: {
          type: "select",
          options: ["none", "scatter", "dissolve"],
          default: d.film.fadeGrain,
        },
        fadeGrainAmount: [d.film.fadeGrainAmount, 0, 1, 0.01],
        fadeGrainSize: [d.film.fadeGrainSize, 0.1, 2, 0.05],
      },
    },
    {
      id: "dusk-v2",
      onAction: () => setReplays((count) => count + 1),
      persist: true,
    }
  );

  return (
    <>
      <Dusk replayKey={replays} settings={{ enter, film, gradient, mask }} />
      <DialRoot position="top-right" theme="dark" />
    </>
  );
};

export const Route = createFileRoute("/_landing/design/dusk/")({
  head: () => ({
    links: [{ rel: "stylesheet", href: dialkitCss }],
    meta: [{ title: "Dusk · Nora" }],
  }),
  component: DuskDesign,
});
