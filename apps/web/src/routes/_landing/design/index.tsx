import { ArrowRightIcon, PlusIcon } from "@radix-ui/react-icons";
import * as stylex from "@stylexjs/stylex";
import { useHotkey } from "@tanstack/react-hotkeys";
import type { DisplayHotkey } from "@tanstack/react-hotkeys";
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";

import {
  Button,
  ButtonIcon,
  buttonSizes,
  buttonVariants,
} from "@/components/ui/button";
import { Input, inputSizes } from "@/components/ui/input";
import { Hotkey, Kbd } from "@/components/ui/kbd";
import {
  MenuRadioGroup,
  MenuRadioItem,
  SearchMenu,
} from "@/components/ui/menu";
import {
  Select,
  SelectGroup,
  SelectItem,
  selectSizes,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { headings, text } from "@/styles/text";
import { colors } from "@/styles/tokens.stylex";

const styles = stylex.create({
  page: {
    padding: stylex.env.spacing(16),
    gap: stylex.env.spacing(10),
    marginInline: "auto",
    display: "flex",
    flexDirection: "column",
    maxWidth: stylex.env.spacing(240),
  },
  section: {
    gap: stylex.env.spacing(3),
    display: "flex",
    flexDirection: "column",
  },
  heading: {
    color: colors.gray11,
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
  },
  field: {
    maxWidth: stylex.env.spacing(70),
  },
  row: {
    gap: stylex.env.spacing(3),
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
  },
  stack: {
    gap: stylex.env.spacing(4),
    display: "flex",
    flexDirection: "column",
  },
  // One step of a type scale: its px size, then a sample.
  scaleStep: {
    gap: stylex.env.spacing(6),
    alignItems: "baseline",
    display: "flex",
  },
  scaleLabel: {
    color: colors.gray11,
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
    width: stylex.env.spacing(10),
  },
  // A stand-in asset card: logo, name, a line of copy and a control.
  sampleCard: {
    gap: stylex.env.spacing(3),
    display: "flex",
    flexDirection: "column",
    maxWidth: stylex.env.spacing(100),
  },
  sampleIdentity: {
    gap: stylex.env.spacing(2),
    alignItems: "center",
    display: "flex",
  },
  sampleLogo: {
    borderRadius: "4px",
    backgroundColor: colors.indigo9,
    flexShrink: 0,
    height: stylex.env.spacing(10),
    width: stylex.env.spacing(10),
  },
  sampleCopy: {
    color: colors.gray11,
  },
  scaleSample: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },
});

// Integer keys enumerate in ascending order, so these run smallest first.
const textScale = Object.entries(text);
const headingScale = Object.entries(headings);

/** The select samples' options, so the trigger shows a label per value. */
const sampleSectors = [
  { value: "technology", label: "Technology" },
  { value: "banks", label: "Banks" },
  { value: "insurance", label: "Insurance" },
];

const iconSizes = buttonSizes.filter((size) => size.startsWith("icon"));
const textSizes = buttonSizes.filter((size) => !size.startsWith("icon"));

const Section = ({
  title,
  children,
  stack = false,
}: {
  title: string;
  children: ReactNode;
  /** Lay children out in a column instead of a wrapping row. */
  stack?: boolean;
}) => (
  <section {...stylex.props(styles.section)}>
    <h2 {...stylex.props(styles.heading)}>{title}</h2>
    <div {...stylex.props(stack ? styles.stack : styles.row)}>{children}</div>
  </section>
);

const ScaleStep = ({
  size,
  style,
  children,
}: {
  size: string;
  style: stylex.StyleXStyles;
  children: ReactNode;
}) => (
  <div {...stylex.props(styles.scaleStep)}>
    <span {...stylex.props(text[12], styles.scaleLabel)}>{size}</span>
    <span {...stylex.props(style, styles.scaleSample)}>{children}</span>
  </div>
);

/** Toggles a sample card between its skeleton and its content. */
const SkeletonDemo = () => {
  const [loading, setLoading] = useState(true);
  return (
    <>
      <Button variant="secondary" onClick={() => setLoading(!loading)}>
        {loading ? "Show content" : "Show skeleton"}
      </Button>
      <Skeleton loading={loading} label="Loading the sample card">
        <div {...stylex.props(styles.sampleCard)}>
          <div {...stylex.props(styles.sampleIdentity)}>
            <div {...stylex.props(styles.sampleLogo)} />
            <span {...stylex.props(headings[24])}>Apple Inc.</span>
          </div>
          <p {...stylex.props(text[14], styles.sampleCopy)}>
            Designs and sells phones, computers, tablets, wearables and
            accessories, and a growing range of services.
          </p>
          <span {...stylex.props(text[12], styles.sampleCopy)}>
            NASDAQ · AAPL
          </span>
          <Input aria-label="Quantity" placeholder="Quantity" />
        </div>
      </Skeleton>
    </>
  );
};

/** Shortcuts covering a lone key, modifiers, named keys and a sequence. */
const sampleHotkeys: DisplayHotkey[] = [
  "K",
  "Mod+K",
  "Mod+Shift+P",
  "Alt+ArrowUp",
  "Escape",
  ["G", "G"],
];

const LIVE_HOTKEY = "Mod+K";

/** Counts presses of a real shortcut, registered while the page is open. */
const HotkeyDemo = () => {
  const [presses, setPresses] = useState(0);
  useHotkey(LIVE_HOTKEY, () => setPresses((count) => count + 1));
  return (
    <span {...stylex.props(text[14], styles.sampleCopy)}>
      Press <Hotkey hotkey={LIVE_HOTKEY} /> · pressed {presses} times
    </span>
  );
};

/** A filter menu that F opens with its search focused. */
const MenuDemo = () => {
  const [sector, setSector] = useState("");
  return (
    <SearchMenu
      label={sampleSectors.find((s) => s.value === sector)?.label ?? "Sector"}
      searchLabel="Filter sectors…"
      hotkey="F"
      empty="No sectors match"
    >
      <MenuRadioGroup value={sector} onValueChange={setSector}>
        {sampleSectors.map((option) => (
          <MenuRadioItem key={option.value} value={option.value}>
            {option.label}
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </SearchMenu>
  );
};

const DesignPage = () => (
  <main {...stylex.props(styles.page)}>
    <h1>Design</h1>
    <Section stack title="Text">
      {textScale.map(([size, style]) => (
        <ScaleStep key={size} size={size} style={style}>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit
        </ScaleStep>
      ))}
    </Section>
    <Section stack title="Headings">
      {headingScale.map(([size, style]) => (
        <ScaleStep key={size} size={size} style={style}>
          Lorem ipsum dolor
        </ScaleStep>
      ))}
    </Section>
    {buttonVariants.map((variant) => (
      <Section key={variant} title={`Button · ${variant}`}>
        {textSizes.map((size) => (
          <Button key={size} variant={variant} size={size}>
            Button
          </Button>
        ))}
      </Section>
    ))}
    <Section title="Button · with icon">
      {textSizes.map((size) => (
        <Button key={size} size={size}>
          <ButtonIcon icon={PlusIcon} />
          Button
        </Button>
      ))}
      {textSizes.map((size) => (
        <Button key={size} size={size}>
          Button
          <ButtonIcon icon={ArrowRightIcon} />
        </Button>
      ))}
    </Section>
    <Section title="Button · icon sizes">
      {iconSizes.map((size) => (
        <Button key={size} size={size} aria-label={`Add (${size})`}>
          <ButtonIcon icon={PlusIcon} />
        </Button>
      ))}
    </Section>
    <Section title="Kbd">
      <Kbd>⌘</Kbd>
      <Kbd>K</Kbd>
      <Kbd>Esc</Kbd>
    </Section>
    <Section title="Hotkey">
      {sampleHotkeys.map((hotkey) => (
        <Hotkey key={String(hotkey)} hotkey={hotkey} />
      ))}
    </Section>
    <Section title="Hotkey · live">
      <HotkeyDemo />
    </Section>
    <Section title="Tooltip">
      <TooltipProvider>
        {(["top", "right", "bottom", "left"] as const).map((side) => (
          <Tooltip key={side} side={side} content={`Tooltip on ${side}`}>
            <Button variant="outline" size="sm">
              {side}
            </Button>
          </Tooltip>
        ))}
        <Tooltip open content="Add to watchlist">
          <Button variant="outline" size="icon-sm" aria-label="Add">
            <ButtonIcon icon={PlusIcon} />
          </Button>
        </Tooltip>
      </TooltipProvider>
    </Section>
    <Section title="Tooltip · with hotkey">
      {/* To the right, so it covers neither the heading nor the always-open tooltip above. */}
      <Tooltip
        side="right"
        content={
          <>
            Add to watchlist
            <Hotkey hotkey="Mod+Shift+A" />
          </>
        }
      >
        <Button variant="outline" size="sm">
          <ButtonIcon icon={PlusIcon} />
          Add
        </Button>
      </Tooltip>
    </Section>
    <Section stack title="Skeleton">
      <SkeletonDemo />
    </Section>
    <Section title="Input">
      {inputSizes.map((size) => (
        <Input
          key={size}
          size={size}
          aria-label={`Username (${size})`}
          placeholder="Username"
          style={styles.field}
        />
      ))}
    </Section>
    <Section title="Input · with hotkey">
      <Input
        type="search"
        aria-label="Search name or ticker"
        placeholder="Search name or ticker"
        hotkey="/"
        style={styles.field}
      />
    </Section>
    <Section title="Menu · with hotkey">
      <MenuDemo />
    </Section>
    <Section title="Select">
      {selectSizes.map((size) => (
        <Select
          key={size}
          size={size}
          aria-label={`Sector (${size})`}
          placeholder="Sector"
          items={sampleSectors}
          style={styles.field}
        >
          <SelectItem value="technology">Technology</SelectItem>
          <SelectGroup label="Financial">
            <SelectItem value="banks">Banks</SelectItem>
            <SelectItem value="insurance">Insurance</SelectItem>
          </SelectGroup>
        </Select>
      ))}
      <Select
        aria-label="Sector (disabled)"
        placeholder="Disabled"
        disabled
        style={styles.field}
      >
        <SelectItem value="technology">Technology</SelectItem>
      </Select>
    </Section>
  </main>
);

export const Route = createFileRoute("/_landing/design/")({
  head: () => ({ meta: [{ title: "Design · Nora" }] }),
  component: DesignPage,
});
