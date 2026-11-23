import { IbkrContractSearchSchema } from "@nora/ibkr/api-schemas";
import type { IbkrContractSearch } from "@nora/ibkr/api-schemas";
import { queryOptions } from "@tanstack/react-query";
import { Option, Schema } from "effect";

import { ibkrBrokerageQuery, listingSlug } from "@/lib/ibkr-asset-queries";
import { requestIbkrPortal } from "@/lib/ibkr-login-queries";

/** One row of the search: a contract, as the palette shows and links it. */
export const SearchResultSchema = Schema.Struct({
  conid: Schema.Number,
  symbol: Schema.String,
  name: Schema.String,
  exchange: Schema.String,
  /** IBKR's security type, e.g. "STK", "IND", "FUT". */
  secType: Schema.String,
});
export type SearchResult = typeof SearchResultSchema.Type;

/**
 * What IBKR's search box accepts: letters, digits, spaces and `- & .`.
 * Anything else it rejects as an invalid symbol without asking the server.
 */
const validTerm = /^[\p{L}\p{N}\-&. ]+$/u;

/** The term as IBKR's search box sends it: trimmed and uppercased. */
export const normalizeSearchTerm = (term: string) => term.trim().toUpperCase();

export const isValidSearchTerm = (term: string) => validTerm.test(term);

/** The asset page's slug for a result, e.g. `aapl` or `vwce.ibis`. */
export const searchResultSlug = (result: SearchResult) =>
  listingSlug(result.symbol, result.exchange);

/**
 * A result's own type: the section that is the result itself (same conid),
 * as IBKR's search labels its rows; else the first section's.
 */
const ownSecType = (contract: IbkrContractSearch[number]) => {
  const conid = String(contract.conid);
  const sections = contract.sections ?? [];
  const own = sections.find((section) => String(section.conid) === conid);
  return (
    own?.secType ??
    sections[0]?.secType ??
    contract.secType ??
    "STK"
  ).toUpperCase();
};

/**
 * The company's full name. Type-ahead results often leave `companyName`
 * empty or set to the ticker, so this reads IBKR's own row label,
 * `companyHeader` (e.g. "NVIDIA CORP - NASDAQ"), without the exchange its
 * search appends; else `companyName`; else the ticker.
 */
const companyNameOf = (
  contract: IbkrContractSearch[number],
  symbol: string
) => {
  const exchange = contract.description?.trim();
  let header = contract.companyHeader?.trim() ?? "";
  if (exchange) {
    for (const suffix of [` - ${exchange}`, ` (${exchange})`]) {
      if (header.endsWith(suffix)) {
        header = header.slice(0, -suffix.length).trim();
      }
    }
  }
  const name = contract.companyName?.trim();
  return (
    [header, name].find(
      (candidate) =>
        candidate && candidate.toUpperCase() !== symbol.toUpperCase()
    ) ?? symbol
  );
};

const toSearchResult = (
  contract: IbkrContractSearch[number]
): Option.Option<SearchResult> => {
  const conid = Number(contract.conid);
  const symbol = contract.symbol?.trim();
  if (!(Number.isFinite(conid) && symbol)) {
    return Option.none();
  }
  return Option.some({
    conid,
    symbol,
    name: companyNameOf(contract, symbol),
    exchange: contract.description?.trim() ?? "",
    secType: ownSecType(contract),
  });
};

const decodeContractSearch = Schema.decodeUnknownSync(IbkrContractSearchSchema);

/** IBKR answers a search with no matches with an error, not an empty list. */
const isNoMatchError = (error: Error) =>
  /no symbol found/iu.test(error.message);

/**
 * IBKR's type-ahead search (`pattern=true`, as its web portal's search box
 * sends): tickers and company names matching a normalized, valid term.
 * Opens the brokerage session, like every `iserver/*` call.
 */
export const contractSearchQuery = (term: string) =>
  queryOptions({
    queryKey: ["ibkr", "portal", "search", term],
    queryFn: async ({ client }) => {
      await client.query({ ...ibkrBrokerageQuery, staleTime: "static" });
      const response = await requestIbkrPortal(
        "GET",
        `iserver/secdef/search?symbol=${encodeURIComponent(term)}&pattern=true`
      ).catch((error: Error) => {
        if (isNoMatchError(error)) {
          return [];
        }
        throw error;
      });
      return decodeContractSearch(response).flatMap((contract) =>
        Option.toArray(toSearchResult(contract))
      );
    },
    retry: false,
    staleTime: 5 * 60_000,
  });
