import { IbkrAuthStatusSchema } from "@nora/ibkr/api-schemas";
import { useQuery } from "@tanstack/react-query";
import { Option, Schema } from "effect";

import { ibkrBrokerageQuery } from "@/lib/ibkr-asset-queries";
import { ibkrTickleQuery, requestIbkrPortal } from "@/lib/ibkr-login-queries";

/**
 * Whether `iserver` data (quotes, scans, today's P&L) can load: the
 * dashboard opens the brokerage session when it opens.
 *
 * `expected` while it's opening or open, so skeletons can hold the data's
 * place; `ready` once calls can go out; `unavailable` after another platform
 * (TWS, IBKR Mobile, the Client Portal elsewhere) took it over, until Nora
 * takes it back, or when IBKR didn't open it.
 */
export const useBrokerageAccess = () => {
  const brokerage = useQuery(ibkrBrokerageQuery);
  return {
    expected: brokerage.isPending || brokerage.data?.open === true,
    ready: brokerage.data?.open === true,
    unavailable: brokerage.isError || brokerage.data?.open === false,
  };
};

/** `/tickle`'s report on the brokerage session, when it sends one. */
const decodeTickle = Schema.decodeUnknownOption(
  Schema.Struct({
    iserver: Schema.optional(
      Schema.NullOr(
        Schema.Struct({
          authStatus: Schema.optional(Schema.NullOr(IbkrAuthStatusSchema)),
        })
      )
    ),
  })
);

/**
 * Keeps the IBKR session alive while the dashboard is open, with `/tickle`
 * every minute as IBKR's web app does. Its reply also says whether the
 * brokerage session is still here, so one another platform took over shows
 * as unavailable rather than as failing calls, and isn't fought over every
 * minute.
 */
export const useIbkrKeepAlive = () => {
  useQuery({
    ...ibkrTickleQuery,
    queryFn: async ({ client }) => {
      const body = await requestIbkrPortal("POST", "tickle");
      const status = Option.getOrUndefined(decodeTickle(body))?.iserver
        ?.authStatus;
      const cached = client.getQueryData(ibkrBrokerageQuery.queryKey);
      if (status && status.authenticated !== true && cached?.open) {
        client.setQueryData(ibkrBrokerageQuery.queryKey, {
          open: false,
          competing: status.competing === true,
        });
      }
      return body;
    },
  });
};
