import * as stylex from "@stylexjs/stylex";
import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  ScriptOnce,
  Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import type { ReactNode } from "react";

import { NotFound } from "@/components/not-found";
import { SkeletonProvider } from "@/components/ui/skeleton";
import { platformScript } from "@/lib/platform";
import { fontFaces, fontPreload } from "@/styles/fonts";
import { colors } from "@/styles/tokens.stylex";

import appCss from "@/styles/global.css?url";

const styles = stylex.create({
  // On <html> so the whole canvas, overscroll included, uses the page colors.
  page: {
    backgroundColor: colors.gray1,
    color: colors.gray12,
  },
  root: {
    isolation: "isolate",
    minHeight: "100svh",
  },
});

const RootShell = ({ children }: { children: ReactNode }) => (
  // The platform script below adds `data-platform` before React hydrates.
  <html lang="en" suppressHydrationWarning {...stylex.props(styles.page)}>
    <head>
      <ScriptOnce>{platformScript}</ScriptOnce>
      <HeadContent />
      {/* In production the StyleX CSS is appended to global.css at build time. */}
      {import.meta.env.DEV && (
        <>
          {/*
           * The StyleX dev runtime moves this CSS into a <style> tag and sets
           * `disabled` on the link before React hydrates; expected, so don't
           * report it as a mismatch.
           */}
          <link
            rel="stylesheet"
            href="/virtual:stylex.css"
            suppressHydrationWarning
          />
        </>
      )}
    </head>
    <body>
      {children}
      <Scripts />
    </body>
  </html>
);

const RootDocument = () => (
  <>
    <div {...stylex.props(styles.root)}>
      <SkeletonProvider>
        <Outlet />
      </SkeletonProvider>
    </div>
    {import.meta.env.DEV && (
      <TanStackDevtools
        plugins={[
          { name: "TanStack Query", render: <ReactQueryDevtoolsPanel /> },
          {
            name: "TanStack Router",
            render: <TanStackRouterDevtoolsPanel />,
          },
        ]}
      />
    )}
  </>
);

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  // SSR is set per group: _landing renders fully, _app is data-only.
  headers: () => ({ "Cache-Control": "private, no-store" }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "color-scheme", content: "dark" },
      { title: "Nora" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      fontPreload,
      { rel: "stylesheet", href: appCss },
    ],
    styles: [{ children: fontFaces }],
    // Rendered through the router's <Script> so the client doesn't create a raw
    // <script> element (React warns and never executes those).
    scripts: import.meta.env.DEV
      ? [{ type: "module", src: "/@id/virtual:stylex:runtime" }]
      : [],
  }),
  shellComponent: RootShell,
  component: RootDocument,
  // Also catches `notFound()` thrown while rendering, e.g. by a suspense query,
  // which `defaultNotFoundComponent` doesn't.
  notFoundComponent: NotFound,
});
