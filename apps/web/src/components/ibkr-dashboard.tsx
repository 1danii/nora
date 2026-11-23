import { IbkrPositionSchema } from "@nora/ibkr/api-schemas";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Schema } from "effect";

import { JsonBlock, QueryJson } from "@/components/json-block";
import { QueryBoundary } from "@/components/query-boundary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listingSlug } from "@/lib/ibkr-asset-queries";
import {
  ibkrPortalQuery,
  ibkrTickleQuery,
  requestIbkrPortal,
} from "@/lib/ibkr-login-queries";
import { useIbkrSignOut } from "@/lib/ibkr-sign-out";

const portalMethods = ["GET", "POST", "PUT", "DELETE"] as const;
const PortalCallSchema = Schema.Struct({
  method: Schema.Literals(portalMethods),
  path: Schema.String,
  body: Schema.String,
});

const AccountsSchema = Schema.Array(
  Schema.Struct({ accountId: Schema.String })
);
const decodeAccounts = Schema.decodeUnknownSync(AccountsSchema);

const decodePositions = Schema.decodeUnknownSync(
  Schema.Array(IbkrPositionSchema)
);

/** One Client Portal GET, shown as raw JSON; loads and fails on its own. */
const PortalCall = ({ path }: { path: string }) => (
  <section>
    <h2>GET {path}</h2>
    <QueryBoundary>
      <QueryJson query={ibkrPortalQuery(path)} />
    </QueryBoundary>
  </section>
);

/** Links to each held asset's page; shares the positions request below. */
const AssetLinks = ({ accountId }: { accountId: string }) => {
  const { data } = useSuspenseQuery(
    ibkrPortalQuery(`portfolio/${accountId}/positions/0`)
  );
  const positions = decodePositions(data);
  return (
    <nav aria-label="Assets">
      <h2>Assets</h2>
      <ul>
        {positions.flatMap((position) =>
          position.ticker
            ? [
                <li key={position.conid}>
                  <Link
                    to="/dashboard/assets/$symbol"
                    // The loader can open the brokerage session, which may
                    // sign out TWS or the mobile app, so it waits for a click.
                    preload={false}
                    params={{
                      symbol: listingSlug(
                        position.ticker,
                        position.listingExchange
                      ),
                    }}
                  >
                    {position.ticker}
                  </Link>
                </li>,
              ]
            : []
        )}
      </ul>
    </nav>
  );
};

/** Sends any Client Portal call. Defaults to opening a brokerage session. */
const PortalConsole = () => {
  const queryClient = useQueryClient();
  const send = useMutation({
    mutationFn: (call: typeof PortalCallSchema.Type) =>
      requestIbkrPortal(call.method, call.path, call.body),
    // Any call can change account state, so cached reads are refetched.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["ibkr", "portal"] }),
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        send.mutate(
          Schema.decodeUnknownSync(PortalCallSchema)(Object.fromEntries(form))
        );
      }}
    >
      <div>
        <div>
          <div>
            <label htmlFor="portal-method">Method</label>
            <select id="portal-method" name="method" defaultValue="POST">
              {portalMethods.map((method) => (
                <option key={method}>{method}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="portal-path">Path</label>
            <Input
              id="portal-path"
              name="path"
              required
              defaultValue="iserver/auth/ssodh/init"
            />
          </div>
        </div>
        <div>
          <label htmlFor="portal-body">JSON body</label>
          <textarea
            id="portal-body"
            name="body"
            rows={3}
            defaultValue='{"publish":true,"compete":true}'
          />
        </div>
      </div>
      <Button type="submit" disabled={send.isPending}>
        {send.isPending ? "Sending…" : "Send"}
      </Button>
      {send.error && <div role="alert">{send.error.message}</div>}
      {send.data !== undefined && <JsonBlock value={send.data} />}
    </form>
  );
};

/** Calls that need an account ID; IBKR expects the account list first. */
const AccountCalls = () => {
  const { data } = useSuspenseQuery(ibkrPortalQuery("portfolio/accounts"));
  const accountId = decodeAccounts(data)[0]?.accountId;
  if (!accountId) {
    return null;
  }
  return (
    <>
      <QueryBoundary>
        <AssetLinks accountId={accountId} />
      </QueryBoundary>
      <PortalCall path={`portfolio/${accountId}/summary`} />
      <PortalCall path={`portfolio/${accountId}/positions/0`} />
    </>
  );
};

/** Client Portal calls through Nora's passthrough, as IBKR's web app makes them. */
const IbkrApiPanel = () => {
  // Renders nothing; it only keeps the session alive, so it never suspends.
  useQuery(ibkrTickleQuery);
  return (
    <section>
      <header>
        <h2>Client Portal API</h2>
        <p>The session is kept alive with /tickle every minute.</p>
      </header>
      <div>
        <PortalConsole />
        <PortalCall path="sso/validate" />
        <PortalCall path="iserver/auth/status" />
        <PortalCall path="portfolio/accounts" />
        <QueryBoundary>
          <AccountCalls />
        </QueryBoundary>
      </div>
    </section>
  );
};

/** Signed-in IBKR session: the user card with sign out, plus the API console. */
export const IbkrDashboard = ({
  username,
  demo = false,
}: {
  username?: string;
  demo?: boolean;
}) => {
  const logout = useIbkrSignOut();
  return (
    <>
      <section>
        <header>
          <h2>{username}</h2>
          <p>
            {demo
              ? "Demo account with sample data. Nothing is sent to IBKR."
              : "Signed in with password and 2FA."}
          </p>
        </header>
        {logout.error && (
          <div>
            <div role="alert">Sign out failed. Please try again.</div>
          </div>
        )}
        <footer>
          <Button
            disabled={logout.isPending}
            onClick={() => {
              logout.mutate();
            }}
          >
            {logout.isPending ? "Signing out…" : "Sign out"}
          </Button>
        </footer>
      </section>
      <IbkrApiPanel />
    </>
  );
};
