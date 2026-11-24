import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Landing and design pages: fully server-rendered (the root's default), so
 * the HTML arrives with content for first paint and crawlers.
 */
const LandingLayout = () => <Outlet />;

export const Route = createFileRoute("/_landing")({
  component: LandingLayout,
  ssr: true,
});
