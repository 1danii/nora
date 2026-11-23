import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { buttonLook } from "@/components/ui/button";
import { headings, text } from "@/styles/text";
import { colors } from "@/styles/tokens.stylex";

const styles = stylex.create({
  // Centred in the viewport, like `ErrorNotice` but at page scale.
  page: {
    gap: stylex.env.spacing(6),
    paddingBlock: stylex.env.spacing(16),
    paddingInline: stylex.env.spacing(4),
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    textAlign: "center",
    minHeight: "100svh",
  },
  copy: {
    gap: stylex.env.spacing(2),
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
  },
  title: {
    margin: 0,
    color: colors.gray12,
  },
  description: {
    margin: 0,
    color: colors.gray11,
    maxWidth: "32ch",
  },
});

/** The one not-found page, for unknown URLs and for anything a route or query throws `notFound()` for. */
export const NotFound = () => (
  <main {...stylex.props(styles.page)}>
    <div {...stylex.props(styles.copy)}>
      <h1 {...stylex.props(headings[36], styles.title)}>Page not found</h1>
      <p {...stylex.props(text[14], styles.description)}>
        The page you requested doesn’t exist or has moved.
      </p>
    </div>
    <Link to="/dashboard" {...stylex.props(...buttonLook("outline", "lg"))}>
      Back to dashboard
    </Link>
  </main>
);
