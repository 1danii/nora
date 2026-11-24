import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  Navigate,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router";

import { AccountBalance } from "@/components/account-balance";
import { NoraSymbol } from "@/components/brand/nora-logo";
import { GlobalSearch } from "@/components/global-search";
import { ProfileMenu } from "@/components/profile-menu";
import { QueryBoundary } from "@/components/query-boundary";
import { prefetchAccountHeader } from "@/lib/ibkr-account-queries";
import { ibkrBrokerageQuery } from "@/lib/ibkr-asset-queries";
import { useIbkrKeepAlive } from "@/lib/ibkr-brokerage";
import { ibkrLoginModeQuery, ibkrSessionQuery } from "@/lib/ibkr-login-queries";
import { useIbkrSignOut } from "@/lib/ibkr-sign-out";
import { repositoryUrl } from "@/lib/repository";
import { text } from "@/styles/text";
import { colors } from "@/styles/tokens.stylex";

const styles = stylex.create({
  // 1440px wide including the 32px side padding, centred.
  container: {
    marginInline: "auto",
    paddingInline: stylex.env.spacing(8),
    maxWidth: stylex.env.spacing(360),
  },
  // Three columns with equal sides, so the search sits in the page's centre
  // whatever the links beside it take. A side never gets narrower than its
  // content: when the balance needs more room, the search gives it up
  // instead of the balance running over it.
  nav: {
    gap: stylex.env.spacing(6),
    paddingBlock: stylex.env.spacing(6),
    alignItems: "center",
    display: "grid",
    gridTemplateColumns:
      "minmax(max-content, 1fr) minmax(0, 480px) minmax(max-content, 1fr)",
  },
  start: {
    gap: stylex.env.spacing(6),
    alignItems: "center",
    display: "flex",
  },
  // The homepage logo's height, without the wordmark.
  logo: {
    height: 24,
  },
  items: {
    margin: 0,
    padding: 0,
    gap: stylex.env.spacing(2),
    listStyle: "none",
    display: "flex",
  },
  // A default-size button's box and type, as text: secondary until hovered.
  item: {
    paddingInline: stylex.env.spacing(3),
    alignItems: "center",
    color: {
      default: colors.gray11,
      ":hover": colors.gray12,
    },
    display: "flex",
    fontWeight: 550,
    transitionDuration: {
      default: "100ms",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionProperty: "color",
    transitionTimingFunction: "ease",
    height: stylex.env.spacing(9),
  },
  // The balance, then the avatar, against the header's end.
  end: {
    gap: stylex.env.spacing(3),
    alignItems: "center",
    display: "flex",
    justifyContent: "end",
    minWidth: 0,
  },
  // In the page's flow above the header, so it scrolls away with it.
  demoBanner: {
    gap: stylex.env.spacing(3),
    paddingBlock: stylex.env.spacing(2),
    paddingInline: stylex.env.spacing(4),
    alignItems: "center",
    backgroundColor: colors.indigo9,
    color: colors.white,
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    textAlign: "center",
  },
  demoAction: {
    padding: 0,
    borderStyle: "none",
    backgroundColor: "transparent",
    color: "inherit",
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 550,
    textDecorationLine: "underline",
    textDecorationThickness: "1px",
    textUnderlineOffset: "3px",
  },
});

/**
 * Says the figures are made up, with the way to a real login, or where only
 * the demo runs, to deploying your own.
 */
const DemoBanner = () => {
  const { data: session } = useSuspenseQuery(ibkrSessionQuery);
  if (!session.demo) {
    return null;
  }
  return (
    <div {...stylex.props(text[14], styles.demoBanner)}>
      <span>You’re exploring a demo account with sample data.</span>
      <DemoAction />
    </div>
  );
};

/** Leaves the demo for a real login, or points to deploying your own. */
const DemoAction = () => {
  const { loginMode } = Route.useRouteContext();
  const signOut = useIbkrSignOut();
  if (loginMode === "demo") {
    return (
      <a
        href={repositoryUrl}
        target="_blank"
        rel="noopener noreferrer"
        {...stylex.props(styles.demoAction)}
      >
        Deploy your own
      </a>
    );
  }
  return (
    <button
      type="button"
      disabled={signOut.isPending}
      onClick={() => {
        signOut.mutate();
      }}
      {...stylex.props(styles.demoAction)}
    >
      {signOut.isPending ? "Leaving demo…" : "Log in with IBKR"}
    </button>
  );
};

/**
 * The balance and profile menu, only while signed in: signing out drops the
 * IBKR reads, and the balance would otherwise ask for them again.
 */
const AccountEnd = () => {
  const { data: session } = useSuspenseQuery(ibkrSessionQuery);
  return (
    <div {...stylex.props(styles.end)}>
      {session.state === "authenticated" ? (
        <>
          <AccountBalance />
          <ProfileMenu />
        </>
      ) : null}
    </div>
  );
};

/** Outside the suspending boundary, so it stays put while pages load. */
const DashboardNav = () => (
  <header {...stylex.props(styles.nav)}>
    <div {...stylex.props(styles.start)}>
      <Link aria-label="nora dashboard" to="/dashboard">
        <NoraSymbol style={styles.logo} />
      </Link>
      <nav aria-label="Main">
        <ul {...stylex.props(styles.items)}>
          <li>
            <Link {...stylex.props(text[14], styles.item)} to="/dashboard">
              Overview
            </Link>
          </li>
          <li>
            <Link
              {...stylex.props(text[14], styles.item)}
              to="/dashboard/explore"
            >
              Explore
            </Link>
          </li>
        </ul>
      </nav>
    </div>
    <GlobalSearch />
    <AccountEnd />
  </header>
);

/** Keeps the IBKR session alive while signed in; nothing once it has ended. */
const SessionUpkeep = () => {
  const { data: session } = useSuspenseQuery(ibkrSessionQuery);
  return session.state === "authenticated" ? <KeepAlive /> : null;
};

const KeepAlive = () => {
  useIbkrKeepAlive();
  return null;
};

/**
 * Leaves for login as soon as the session ends, e.g. it expires or another
 * tab signs out. The return address is the dashboard page shown (the last
 * resolved location), not wherever a pending navigation is heading: while
 * leaving for login this layout is still on screen, and pointing back at
 * the login URL itself would redirect to it again, endlessly.
 */
const SignedIn = () => {
  const { data: session } = useSuspenseQuery(ibkrSessionQuery);
  const shown = useRouterState({
    select: (state) => state.resolvedLocation?.href,
  });
  // Already on the way out (e.g. signing out navigates to login itself).
  const leaving = useRouterState({
    select: (state) => !state.location.pathname.startsWith("/dashboard"),
  });
  if (session.state === "authenticated") {
    return <Outlet />;
  }
  // Nothing of the old session's pages while the login loads.
  return leaving ? null : (
    <Navigate to="/login" search={{ redirect: shown }} replace />
  );
};

/**
 * Every dashboard page needs a signed-in IBKR session. The check runs in
 * `beforeLoad`, which finishes before any child loader starts, so pages never
 * call IBKR without a session. It only reads Nora's own cookie, so it's cheap.
 */
export const Route = createFileRoute("/_app/dashboard")({
  beforeLoad: async ({ context, location }) => {
    // The login mode is fixed per deployment, so after the first load (or the
    // login page) it's already cached.
    const [session, loginMode] = await Promise.all([
      context.queryClient.query({ ...ibkrSessionQuery, staleTime: "static" }),
      context.queryClient.ensureQueryData(ibkrLoginModeQuery),
    ]);
    if (session.state !== "authenticated") {
      // Login sends the user back here afterwards.
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
        replace: true,
      });
    }
    return { session, loginMode };
  },
  // Not awaited: the header's balance loads beside the page, never before it.
  loader: ({ context }) => {
    prefetchAccountHeader(context.queryClient);
    // The trading session, opened on load as the Client Portal does, but
    // taken over from TWS or IBKR Mobile if they hold it.
    void context.queryClient.prefetchQuery(ibkrBrokerageQuery);
  },
  component: () => (
    <>
      <DemoBanner />
      <SessionUpkeep />
      <div {...stylex.props(styles.container)}>
        <DashboardNav />
        <QueryBoundary>
          <SignedIn />
        </QueryBoundary>
      </div>
    </>
  ),
});
