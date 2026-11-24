import * as stylex from "@stylexjs/stylex";
import { Link, createFileRoute } from "@tanstack/react-router";
import { DialRoot, useDialKit } from "dialkit";

import dashboard1x from "@/assets/landing/dashboard-1x.webp?url";
import dashboard2x from "@/assets/landing/dashboard-2x.webp?url";
import { NoraLogo } from "@/components/brand/nora-logo";
import {
  BacklitBlock,
  backlitDefaults,
  backlitSkyHeight,
  backlitTopEdge,
} from "@/components/dusk/backlit-block";
import type { BacklitScreen } from "@/components/dusk/backlit-block";
import { backlit } from "@/components/dusk/backlit.stylex";
import { Dusk, duskDefaults } from "@/components/dusk/dusk";
import { heroLayout } from "@/components/dusk/hero.stylex";
import { LightningBoltFilledIcon } from "@/components/icons/lightning-bolt-filled";
import { Button, ButtonIcon } from "@/components/ui/button";
import { headings, text } from "@/styles/text";
import {
  breakpoints,
  colors,
  fontSizeLineHeights,
  fontSizes,
} from "@/styles/tokens.stylex";

import dialkitCss from "dialkit/styles.css?url";

const b = backlitDefaults;

/**
 * The demo dashboard at the panel's width (1196px, captured at 2x), without
 * the demo banner, trimmed below its last section.
 */
const dashboard: BacklitScreen = {
  alt: "The Nora dashboard: total value, a performance chart, holdings and market movers",
  height: 1240,
  src: dashboard1x,
  srcSet: `${dashboard1x} 1x, ${dashboard2x} 2x`,
  width: 1196,
};

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
  // The box is the ring's height; the dashboard's symbol matches it.
  logo: {
    height: stylex.env.spacing(6),
  },
  // Over the dusk, outside it, so the vignette and grain don't touch it.
  // Font and color are inherited from <html>. At this size the browser's
  // automatic optical sizing already picks Inter Display (opsz 32).
  // As wide as the panel and centred like it, so the text shares its edges.
  // Placed by its bottom edge (see Home), so however its text wraps it never
  // runs into the panel.
  hero: {
    gap: stylex.env.spacing(4),
    insetInline: 0,
    marginInline: "auto",
    display: "flex",
    flexDirection: "column",
    position: "absolute",
    transform: "translateY(-100%)",
    width: backlit.width,
  },
  heroBottom: (bottom: string) => ({
    top: bottom,
  }),
  // The heading tokens' sizes, stepping down with the screen.
  heading: {
    fontSize: {
      default: fontSizes[36],
      // Keeps "Interactive Brokers" on one line on the smallest phones.
      "@media (width < 360px)": fontSizes[30],
      [breakpoints.sm]: fontSizes[48],
      // From 1024px, where the button has room beside the description.
      [breakpoints.lg]: fontSizes[60],
    },
    lineHeight: {
      default: fontSizeLineHeights[36],
      "@media (width < 360px)": fontSizeLineHeights[30],
      [breakpoints.sm]: fontSizeLineHeights[48],
      [breakpoints.lg]: fontSizeLineHeights[60],
    },
    textWrap: "balance",
  },
  // Phones drop the line breaks: the heading balances into two even lines
  // and the description wraps on its own.
  wideBreak: {
    display: {
      default: "none",
      [breakpoints.sm]: "inline",
    },
  },
  // Phones stack the action under the description; wider screens put it on
  // the right, bottoms aligned.
  details: {
    gap: stylex.env.spacing(6),
    alignItems: {
      default: "flex-start",
      [breakpoints.sm]: "flex-end",
    },
    display: "flex",
    flexDirection: {
      default: "column",
      [breakpoints.sm]: "row",
    },
    justifyContent: "space-between",
  },
  description: {
    color: colors.gray11,
    textWrap: "pretty",
  },
});

const Home = () => {
  const block = useDialKit(
    "Block",
    {
      anchor: [b.anchor, -40, 30, 0.5],
      intensity: [b.intensity, 0, 1, 0.01],
      blur: [b.blur, 0, 200],
      spread: [b.spread, -40, 40],
      offset: [b.offset, -60, 60],
      rimOpacity: [b.rimOpacity, 0, 1, 0.01],
      rimWidth: [b.rimWidth, 0, 4, 0.5],
      topEdge: [b.topEdge, 0, 0.3, 0.01],
      fadeFrom: [b.fadeFrom, 50, 110, 0.5],
      fadeTo: [b.fadeTo, 50, 110, 0.5],
    },
    { id: "home-block-v19", persist: true }
  );
  // Where the panel's top edge falls with the sky where it is tuned (a share
  // of the screen height). The hero sits `gap` above it, but no higher than
  // `minTop`; on screens too short for that, the sky and panel move down
  // instead, so the gap and the composition stay the same.
  //
  // On narrow screens the sky is shorter than `height`vh and shrinks around
  // the screen's middle, which would leave the hero floating mid-screen under
  // an empty top. There the whole scene moves up instead, at most until the
  // sky's top is back where it sits at full height, and never past `minTop`.
  const sky = duskDefaults.gradient;
  const skyHeight = backlitSkyHeight(block, sky);
  const tunedTop = backlitTopEdge(block, sky);
  const heroMinBottom = `${heroLayout.minTop} + ${heroLayout.height}`;
  const lift = `(${sky.height}vh - ${skyHeight}) / 2`;
  const shift = `max(${heroMinBottom} + ${heroLayout.gap} - ${tunedTop}, -1 * ${lift})`;
  const heroBottom = `calc(${tunedTop} + ${shift} - ${heroLayout.gap})`;
  return (
    <>
      <Dusk height={skyHeight} settings={duskDefaults} shift={shift}>
        <BacklitBlock screen={dashboard} settings={block} sky={sky} />
      </Dusk>
      <header {...stylex.props(styles.nav)}>
        <Link aria-label="nora home" to="/">
          <NoraLogo style={styles.logo} />
        </Link>
      </header>
      {/* After Dusk so it paints above its vignette and grain. */}
      <div {...stylex.props(styles.hero, styles.heroBottom(heroBottom))}>
        <h1 {...stylex.props(headings[36], styles.heading)}>
          A clean client <br {...stylex.props(styles.wideBreak)} />
          for Interactive Brokers
        </h1>
        <div {...stylex.props(styles.details)}>
          <p {...stylex.props(text[14], styles.description)}>
            Same account, a much calmer interface.{" "}
            <br {...stylex.props(styles.wideBreak)} />
            Built on the same APIs as IBKR’s own apps.
          </p>
          <Button size="lg" nativeButton={false} render={<Link to="/login" />}>
            <ButtonIcon icon={LightningBoltFilledIcon} />
            Get started
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
