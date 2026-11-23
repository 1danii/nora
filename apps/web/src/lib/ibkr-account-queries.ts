import {
  IbkrAccountSummarySchema,
  IbkrLedgerSchema,
  IbkrPnlSchema,
  IbkrPortfolioAccountSchema,
  IbkrSsoValidateSchema,
} from "@nora/ibkr/api-schemas";
import { queryOptions } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { Schema } from "effect";

import { requestIbkrPortal } from "@/lib/ibkr-login-queries";

/*
 * The signed-in user and their account, for the dashboard header. Only
 * `portfolio/*` and `sso/validate`: they don't need the brokerage session,
 * so loading them on every page never signs out TWS or the mobile app.
 * Keys sit under ["ibkr", "portal"], so signing out drops them.
 */

const decodeSso = Schema.decodeUnknownSync(IbkrSsoValidateSchema);
const decodeAccounts = Schema.decodeUnknownSync(
  Schema.Array(IbkrPortfolioAccountSchema)
);
const decodeSummary = Schema.decodeUnknownSync(IbkrAccountSummarySchema);
const decodeLedger = Schema.decodeUnknownSync(IbkrLedgerSchema);
const decodePnl = Schema.decodeUnknownSync(IbkrPnlSchema);

/** Live or paper trading, as IBKR's web apps tell them apart. */
export type IbkrLoginType = "live" | "paper";

/** Who signed in: the username and whether it's a live or paper login. */
export const ibkrUserQuery = queryOptions({
  queryKey: ["ibkr", "portal", "user"],
  queryFn: async () => {
    const sso = decodeSso(await requestIbkrPortal("GET", "sso/validate"));
    const loginType: IbkrLoginType = sso.LOGIN_TYPE === 2 ? "paper" : "live";
    return { username: sso.USER_NAME ?? undefined, loginType };
  },
  retry: false,
  // Neither changes during a session.
  staleTime: "static",
});

/** The user's accounts; IBKR expects this call before other portfolio reads. */
export const ibkrAccountsQuery = queryOptions({
  queryKey: ["ibkr", "portal", "accounts"],
  queryFn: async () =>
    decodeAccounts(await requestIbkrPortal("GET", "portfolio/accounts")),
  retry: false,
  staleTime: 5 * 60_000,
});

/** Refreshed every minute, with the session's own /tickle. */
const accountRefresh = {
  retry: false,
  staleTime: 30_000,
  refetchInterval: 60_000,
} as const;

/** Totals such as `netliquidation` (total value) and `totalcashvalue`. */
export const ibkrAccountSummaryQuery = (accountId: string) =>
  queryOptions({
    queryKey: ["ibkr", "portal", "account", accountId, "summary"],
    queryFn: async () =>
      decodeSummary(
        await requestIbkrPortal("GET", `portfolio/${accountId}/summary`)
      ),
    ...accountRefresh,
  });

/** Cash and value per currency, plus `BASE`, the account's own currency. */
export const ibkrLedgerQuery = (accountId: string) =>
  queryOptions({
    queryKey: ["ibkr", "portal", "account", accountId, "ledger"],
    queryFn: async () =>
      decodeLedger(
        await requestIbkrPortal("GET", `portfolio/${accountId}/ledger`)
      ),
    ...accountRefresh,
  });

/**
 * Today's profit and loss. An `iserver` call, so it needs the brokerage
 * session open: only enable it once something else opened it.
 */
export const ibkrPnlQuery = (accountId: string) =>
  queryOptions({
    queryKey: ["ibkr", "portal", "account", accountId, "pnl"],
    queryFn: async () => {
      const { upnl = {} } = decodePnl(
        await requestIbkrPortal("GET", "iserver/account/pnl/partitioned")
      );
      // Keyed `{accountId}.Core`; IBKR's apps read the account's own row.
      const [, row] =
        Object.entries(upnl).find(([key]) => key.startsWith(`${accountId}.`)) ??
        [];
      return row?.dpl ?? null;
    },
    ...accountRefresh,
  });

/**
 * Starts the header's reads without waiting for them, so navigation never
 * waits on the balance: who's signed in, the account list, then its summary.
 */
export const prefetchAccountHeader = (queryClient: QueryClient) => {
  void queryClient.prefetchQuery(ibkrUserQuery);
  const prefetchSummary = async () => {
    // `prefetchQuery` doesn't throw, and leaves a failure in the cache for
    // the header's own boundary to show with its retry.
    await queryClient.prefetchQuery(ibkrAccountsQuery);
    const [account] =
      queryClient.getQueryData(ibkrAccountsQuery.queryKey) ?? [];
    if (account) {
      await queryClient.prefetchQuery(
        ibkrAccountSummaryQuery(account.accountId)
      );
    }
  };
  void prefetchSummary();
};
