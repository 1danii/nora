import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { headings, text } from "@/styles/text";
import { colors } from "@/styles/tokens.stylex";

const styles = stylex.create({
  main: {
    paddingInline: stylex.env.spacing(4),
    display: "flex",
    justifyContent: "center",
    // 336px on tall screens, shrinking with the viewport so the form stays
    // near the middle on short ones.
    paddingTop: "clamp(64px, 30svh, 336px)",
  },
  column: {
    maxWidth: "100%",
    width: stylex.env.spacing(72),
  },
  step: {
    // Keeps the heading 40px above the step's content.
    gap: stylex.env.spacing(10),
    display: "flex",
    flexDirection: "column",
  },
  header: {
    gap: stylex.env.spacing(3),
    display: "flex",
    flexDirection: "column",
    textAlign: "center",
  },
  description: {
    color: colors.gray11,
    textWrap: "pretty",
  },
});

/** Sign-in page: one 288px column, up to 336px below the top. */
export const AuthShell = ({ children }: { children: ReactNode }) => (
  <main {...stylex.props(styles.main)}>
    <div {...stylex.props(styles.column)}>{children}</div>
  </main>
);

/** One sign-in step: heading and description, then the step's content. */
export const AuthStep = ({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) => (
  <section {...stylex.props(styles.step)}>
    <header {...stylex.props(styles.header)}>
      <h1 {...stylex.props(headings[30])}>{title}</h1>
      <p {...stylex.props(text[14], styles.description)}>{description}</p>
    </header>
    {children}
  </section>
);
