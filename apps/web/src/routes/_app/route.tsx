import { createFileRoute } from "@tanstack/react-router";

/**
 * The signed-in app and its login: loaders run on the server, but
 * components render only in the browser.
 */
export const Route = createFileRoute("/_app")({
  ssr: "data-only",
});
