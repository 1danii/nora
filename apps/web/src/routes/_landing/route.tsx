import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Landing and design pages: fully server-rendered (the root's default), so
 * the HTML arrives with content for first paint and crawlers.
 */
const LandingLayout = () => (
  // `data-landing` opts these pages out of the reserved scrollbar gutter
  // (global.css): their full-bleed backgrounds would leave an empty strip.
  <div data-landing="" style={{ display: "contents" }}>
    <Outlet />
  </div>
);

export const Route = createFileRoute("/_landing")({
  component: LandingLayout,
  ssr: true,
});
