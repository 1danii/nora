import { useQueryClient } from "@tanstack/react-query";
import { Option, Schema } from "effect";
import { useEffect, useState } from "react";

import {
  assetOvernightQuoteQuery,
  assetPriceQuery,
  inUsOvernightSession,
  withQuoteFields,
} from "@/lib/ibkr-asset-queries";

/** One relayed push, as `/api/ibkr/stream/quote` sends it. */
const decodeUpdate = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      conidEx: Schema.String,
      fields: Schema.Record(
        Schema.String,
        Schema.Union([Schema.String, Schema.Number])
      ),
    })
  )
);

/**
 * Keeps a contract's cached quote current from IBKR's live stream, relayed
 * by our server, as IBKR's apps get every change pushed rather than polling.
 * With `overnight`, its overnight-venue quote too. Returns whether the
 * stream is up, so polling can stand in while it isn't: EventSource
 * reconnects on its own, and a demo session has no stream.
 */
export const useLiveQuote = (conid: number, overnight: boolean) => {
  const client = useQueryClient();
  const [live, setLive] = useState(false);
  useEffect(() => {
    const source = new EventSource(
      `/api/ibkr/stream/quote?conid=${conid}${overnight ? "&overnight=1" : ""}`
    );
    source.addEventListener("message", (event) => {
      const update = Option.getOrUndefined(decodeUpdate(event.data));
      if (!update) {
        return;
      }
      setLive(true);
      // "265598@OVERNIGHT" is the overnight venue's; the bare conid, the
      // regular quote's.
      if (update.conidEx.includes("@")) {
        client.setQueryData(assetOvernightQuoteQuery(conid).queryKey, (old) =>
          withQuoteFields(old, update.fields)
        );
      } else {
        client.setQueryData(assetPriceQuery(conid).queryKey, (old) =>
          withQuoteFields(old, update.fields)
        );
      }
    });
    source.addEventListener("error", () => setLive(false));
    return () => {
      source.close();
      setLive(false);
    };
  }, [client, conid, overnight]);
  return live;
};

/** How often to check whether the overnight session has started or ended. */
const sessionCheckInterval = 30_000;

/** Whether it's IBKR's US overnight session now, rechecked every 30s. */
export const useInUsOvernightSession = () => {
  const [overnight, setOvernight] = useState(() =>
    inUsOvernightSession(Date.now())
  );
  useEffect(() => {
    const timer = setInterval(
      () => setOvernight(inUsOvernightSession(Date.now())),
      sessionCheckInterval
    );
    return () => clearInterval(timer);
  }, []);
  return overnight;
};
