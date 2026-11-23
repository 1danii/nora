import * as stylex from "@stylexjs/stylex";
import { Link, createFileRoute } from "@tanstack/react-router";
import { DialRoot, useDialKit } from "dialkit";

import { NoraLogo } from "@/components/brand/nora-logo";
import { BacklitBlock, backlitDefaults } from "@/components/dusk/backlit-block";
import { Dusk, duskDefaults } from "@/components/dusk/dusk";
import { LightningBoltFilledIcon } from "@/components/icons/lightning-bolt-filled";
import { Button, ButtonIcon } from "@/components/ui/button";
import { headings } from "@/styles/text";

import dialkitCss from "dialkit/styles.css?url";

const b = backlitDefaults;

const styles = stylex.create({
  // Navbar row, top-left. A sibling after Dusk like the hero, so it paints
  // above the vignette and grain.
  nav: {
    insetInline: 0,
    paddingBlock: stylex.env.spacing(6),
    paddingInline: stylex.env.spacing(8),
    alignItems: "center",
    display: "flex",
    position: "absolute",
    top: 0,
  },
  logo: {
    // A ~21.6px wordmark; the box is the ring's height (80 / 72 of the
    // wordmark, minus the ring's 9 / 128 inset top and bottom).
    height: 20.625,
  },
  // Over the dusk, outside it, so the vignette and grain don't touch it.
  // Font and color are inherited from <html>. At this size the browser's
  // automatic optical sizing already picks Inter Display (opsz 32).
  hero: {
    gap: stylex.env.spacing(8),
    insetInline: 0,
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    position: "absolute",
    top: stylex.env.spacing(68),
  },
  heading: {
    textAlign: "center",
    textWrap: "balance",
  },
  actions: {
    gap: stylex.env.spacing(4),
    display: "flex",
  },
});

const Home = () => {
  const block = useDialKit(
    "Block",
    {
      glass: b.glass,
      glassAmount: [b.glassAmount, 0, 1, 0.01],
      anchor: [b.anchor, -40, 30, 0.5],
      width: [b.width, 10, 100],
      radius: [b.radius, 0, 64],
      tilt: [b.tilt, -30, 60, 0.5],
      perspective: [b.perspective, 200, 4000, 50],
      intensity: [b.intensity, 0, 1, 0.01],
      blur: [b.blur, 0, 200],
      spread: [b.spread, -40, 40],
      offset: [b.offset, -60, 60],
      rimOpacity: [b.rimOpacity, 0, 1, 0.01],
      rimWidth: [b.rimWidth, 0, 4, 0.5],
      topEdge: [b.topEdge, 0, 0.3, 0.01],
    },
    { id: "home-block-v14", persist: true }
  );
  return (
    <>
      <Dusk settings={duskDefaults}>
        <BacklitBlock
          mask={duskDefaults.mask}
          settings={block}
          sky={duskDefaults.gradient}
        />
      </Dusk>
      <header {...stylex.props(styles.nav)}>
        <Link aria-label="nora home" to="/">
          <NoraLogo style={styles.logo} />
        </Link>
      </header>
      {/* After Dusk so it paints above its vignette and grain. */}
      <div {...stylex.props(styles.hero)}>
        <h1 {...stylex.props(headings[72], styles.heading)}>
          Lorem ipsum dolor sit
        </h1>
        <div {...stylex.props(styles.actions)}>
          <Button size="lg" nativeButton={false} render={<Link to="/login" />}>
            <ButtonIcon icon={LightningBoltFilledIcon} />
            Get started
          </Button>
          <Button size="lg" variant="outline">
            Learn more
          </Button>
        </div>
      </div>
      <DialRoot position="top-right" theme="dark" />
    </>
  );
};

export const Route = createFileRoute("/_landing/")({
  head: () => ({
    links: [{ rel: "stylesheet", href: dialkitCss }],
    meta: [{ title: "Nora" }],
  }),
  component: Home,
});
