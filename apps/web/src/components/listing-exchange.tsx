import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";

import { isLocationKey, locations } from "@/components/location-flags";
import type { LocationKey } from "@/components/location-flags";
import { assetPriceQuery, listingOf } from "@/lib/ibkr-asset-queries";
import { text } from "@/styles/text";
import { colors, radius } from "@/styles/tokens.stylex";

/**
 * When IBKR sends no location key: the key for the listing's exchange, as
 * contract search names it.
 */
const exchangeLocations = {
  AEB: "TP_Netherlands",
  AMEX: "TP_US",
  ARCA: "TP_US",
  ASX: "TP_Australia",
  BATS: "TP_US",
  BM: "TP_Spain",
  BVL: "TP_Portugal",
  BVME: "TP_Italy",
  CPH: "TP_Denmark",
  EBS: "TP_Switzerland",
  "ENEXT.BE": "TP_Belgium",
  FWB: "TP_Germany",
  FWB2: "TP_Germany",
  GETTEX: "TP_Germany",
  HEX: "TP_Finland",
  IBIS: "TP_Germany",
  IBIS2: "TP_Germany",
  // IBKR has no Irish key; Dublin listings fall under the EU.
  ISED: "TP_EU",
  KSE: "TP_South_Korea",
  LSE: "TP_United Kingdom",
  LSEETF: "TP_United Kingdom",
  MEXI: "TP_Mexico",
  NASDAQ: "TP_US",
  NSE: "TP_India",
  NYSE: "TP_US",
  OSE: "TP_Norway",
  PINK: "TP_US",
  PRA: "TP_Czech",
  SBF: "TP_France",
  SEHK: "TP_Hong_Kong",
  SFB: "TP_Sweden",
  SGX: "TP_Singapore",
  SWB: "TP_Germany",
  // IBKR's Toronto exchange; Tokyo's is TSEJ.
  TSE: "TP_Canada",
  TSEJ: "TP_Japan",
  VENTURE: "TP_Canada",
  VSE: "TP_Austria",
  WSE: "TP_Poland",
} as const satisfies Record<string, LocationKey>;

const isMappedExchange = (
  code: string
): code is keyof typeof exchangeLocations =>
  Object.hasOwn(exchangeLocations, code);

const locationOf = (iconKey: string | undefined, exchange: string) => {
  if (iconKey && isLocationKey(iconKey)) {
    return locations[iconKey];
  }
  return isMappedExchange(exchange)
    ? locations[exchangeLocations[exchange]]
    : undefined;
};

const styles = stylex.create({
  // The timeframe picker's selected pill: its background and label colour.
  // 6px left of the 16px flag, matching the 6px above and below it in the
  // 28px pill; 6px between it and the label, 10px on the right.
  pill: {
    borderRadius: radius.full,
    gap: stylex.env.spacing(1.5),
    alignItems: "center",
    backgroundColor: colors.gray2,
    color: colors.gray12,
    display: "inline-flex",
    flexShrink: 0,
    fontWeight: 400,
    height: stylex.env.spacing(7),
    paddingLeft: stylex.env.spacing(1.5),
    paddingRight: stylex.env.spacing(2.5),
  },
  // Without a flag, as far in as the label is from the right.
  textOnly: {
    paddingLeft: stylex.env.spacing(2.5),
  },
  flag: {
    display: "block",
    flexShrink: 0,
    height: stylex.env.spacing(4),
    width: stylex.env.spacing(4),
  },
  // Sized to the surrounding text.
  inlineFlag: {
    display: "block",
    flexShrink: 0,
    height: "1em",
    width: "1em",
  },
});

/**
 * Just the flag of the country an exchange is in, sized to the text around
 * it. Worked out from the exchange alone, so it needs no quote: for lists
 * such as search results, where a quote per row would be wasted.
 */
export const ExchangeFlag = ({ exchange }: { exchange: string }) => {
  const location = locationOf(undefined, exchange.toUpperCase());
  if (!location) {
    return null;
  }
  return (
    <img
      alt={location.country}
      title={location.country}
      draggable={false}
      src={location.src}
      {...stylex.props(styles.inlineFlag)}
    />
  );
};

/**
 * The exchange a listing trades on, in a pill with its country's flag, as
 * IBKR's apps show it. The country is IBKR's own (`7988`, e.g. "United
 * States") once the quote has it; until then, or without it, it's worked
 * out from the exchange. Not suspended on: the quote is already loading.
 */
export const ListingExchange = ({
  conid,
  exchange,
}: {
  conid: number;
  exchange: string | undefined;
}) => {
  const { data: listing } = useQuery({
    ...assetPriceQuery(conid),
    select: listingOf,
  });
  const code = exchange?.toUpperCase();
  if (!code) {
    return null;
  }
  const location = locationOf(listing?.iconKey, code);
  const country = listing?.location ?? location?.country;
  return (
    <span
      title={country ? `${code} · ${country}` : code}
      {...stylex.props(text[12], styles.pill, !location && styles.textOnly)}
    >
      {location && (
        <img
          alt={country}
          draggable={false}
          src={location.src}
          {...stylex.props(styles.flag)}
        />
      )}
      {code}
    </span>
  );
};
