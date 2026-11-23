import interItalicUrl from "inter-ui/variable/InterVariable-Italic.woff2?url";
import interUrl from "inter-ui/variable/InterVariable.woff2?url";

import paperMonoUrl from "@/assets/fonts/PaperMono.woff2?url";

/**
 * Inter 4 (rsms/inter via inter-ui), not the Google Fonts build. The
 * font faces and the preload share one URL, so the browser reuses the
 * preloaded file instead of downloading it twice. Paper Mono (variable,
 * 100–800, OFL) is self-hosted from src/assets/fonts.
 */
export const fontFaces = `
@font-face {
  font-family: InterVariable;
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url("${interUrl}") format("woff2");
}
@font-face {
  font-family: InterVariable;
  font-style: italic;
  font-weight: 100 900;
  font-display: swap;
  src: url("${interItalicUrl}") format("woff2");
}
@font-face {
  font-family: PaperMono;
  font-style: normal;
  font-weight: 100 800;
  font-display: swap;
  src: url("${paperMonoUrl}") format("woff2");
}`;

/** Only the upright face is preloaded; italics load on first use. */
export const fontPreload = {
  rel: "preload",
  href: interUrl,
  as: "font",
  type: "font/woff2",
  // Fonts are always fetched in CORS mode; without this the preload is unused.
  crossOrigin: "anonymous",
} as const;
