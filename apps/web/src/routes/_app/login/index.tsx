import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Navigate, redirect } from "@tanstack/react-router";

import { AuthShell } from "@/components/auth-shell";
import { IbkrLoginForm } from "@/components/ibkr-login-form";
import { QueryBoundary } from "@/components/query-boundary";
import { ibkrLoginModeQuery, ibkrSessionQuery } from "@/lib/ibkr-login-queries";

interface LoginSearch {
  /** Where to go after logging in: an in-app path, set by the dashboard guard. */
  redirect?: string;
}

/** A stand-in origin: only used to tell whether a path stays on this site. */
const localOrigin = "http://nora.invalid";

/**
 * Only same-origin paths, so a crafted `?redirect=` link can't send a fresh
 * login to another site. Parsed as a browser would, which also catches
 * `//evil.com`, `/\evil.com` and `/<tab>/evil.com` (URLs drop tabs and
 * newlines). Returns the parsed path, never the raw input.
 */
const safeRedirect = (value: string): string | undefined => {
  if (!value.startsWith("/")) {
    return undefined;
  }
  // `new URL` rather than `URL.parse`, which older Safari lacks.
  let url: URL;
  try {
    url = new URL(value, localOrigin);
  } catch {
    return undefined;
  }
  return url.origin === localOrigin
    ? `${url.pathname}${url.search}${url.hash}`
    : undefined;
};

/** The login form until the session is authenticated, then where the user was headed. */
const IbkrLogin = () => {
  const { data: session } = useSuspenseQuery(ibkrSessionQuery);
  const { redirect: target = "/dashboard" } = Route.useSearch();
  // `beforeLoad` redirects on arrival; this covers a login completed here.
  if (session.state === "authenticated") {
    // `href` takes precedence over `to`, which only satisfies the types.
    return <Navigate to="/dashboard" href={target} replace />;
  }
  return (
    <AuthShell>
      <IbkrLoginForm />
    </AuthShell>
  );
};

export const Route = createFileRoute("/_app/login/")({
  head: () => ({ meta: [{ title: "Log in – Nora" }] }),
  // The search parser may hand back a number or object, hence `String`.
  validateSearch: (search: LoginSearch): LoginSearch => {
    const target = safeRedirect(String(search.redirect));
    return target ? { redirect: target } : {};
  },
  // The session check only reads Nora's own cookie, so awaiting it is cheap.
  beforeLoad: async ({ context, search }) => {
    const session = await context.queryClient.query({
      ...ibkrSessionQuery,
      staleTime: "static",
    });
    if (session.state === "authenticated") {
      throw redirect({ href: search.redirect ?? "/dashboard", replace: true });
    }
  },
  // Started, not awaited: the form suspends on it inside its own boundary.
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(ibkrLoginModeQuery);
  },
  component: () => (
    <QueryBoundary>
      <IbkrLogin />
    </QueryBoundary>
  ),
});
