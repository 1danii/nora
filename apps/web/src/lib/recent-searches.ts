import { Option, Schema } from "effect";

import { SearchResultSchema } from "@/lib/ibkr-search-queries";
import type { SearchResult } from "@/lib/ibkr-search-queries";

const storageKey = "nora:recent-searches";

/** As many as IBKR's own search keeps. */
const maxRecent = 10;

const decodeRecent = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Array(SearchResultSchema))
);

/**
 * The contracts last opened from the search, newest first. This browser's
 * only: storage may be unavailable (private windows, blocked site data), and
 * then there are none.
 */
export const readRecentSearches = (): readonly SearchResult[] => {
  try {
    const stored = localStorage.getItem(storageKey);
    return stored === null
      ? []
      : Option.getOrElse(decodeRecent(stored), () => []);
  } catch {
    return [];
  }
};

/** Puts a contract first, once, keeping the newest ten. */
export const saveRecentSearch = (result: SearchResult) => {
  const recent = [
    result,
    ...readRecentSearches().filter((item) => item.conid !== result.conid),
  ].slice(0, maxRecent);
  try {
    localStorage.setItem(storageKey, JSON.stringify(recent));
  } catch {
    // Not remembered; the search works the same without it.
  }
};
