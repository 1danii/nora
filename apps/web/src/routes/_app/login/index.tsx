import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Navigate, redirect } from "@tanstack/react-router";

import { AuthShell } from "@/components/auth-shell";
import { IbkrLoginForm } from "@/components/ibkr-login-form";
import { QueryBoundary } from "@/components/query-boundary";
import { ibkrSessionQuery } from "@/lib/ibkr-login-queries";

interface LoginSearch {
  /** Where to go after logging in: an in-app path, set by the dashboard guard. */
  redirect?: string;
}

/**
 * Only same-origin paths, so a crafted `?redirect=` link can't send a fresh
 * login to another site (`//evil.com` and `/\evil.com` are protocol-relative).
 */
const safeRedirect = (value: string): string | undefined =>
  value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
    ? value
    : undefined;

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
  component: () => (
    <QueryBoundary>
      <IbkrLogin />
    </QueryBoundary>
  ),
});
