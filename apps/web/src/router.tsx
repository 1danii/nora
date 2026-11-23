import { QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import Loader from "./components/loader";
import { NotFound } from "./components/not-found";
import { ErrorNotice } from "./components/query-boundary";
import { routeTree } from "./routeTree.gen";

/** One router and QueryClient per SSR request, so readers never share cached data. */
export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: 1, refetchOnWindowFocus: false },
    },
  });
  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: Loader,
    // Once shown, the loader stays at least this long, so it never flashes.
    defaultPendingMinMs: 600,
    // Covers `notFound()` from a loader. The root route's `notFoundComponent`
    // covers unknown URLs and `notFound()` thrown while rendering.
    defaultNotFoundComponent: NotFound,
    // A route whose loader or render fails shows the same retry as a section.
    defaultErrorComponent: ErrorNotice,
  });
  // Provides the QueryClient, and moves server-fetched query data to the browser.
  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
