import * as stylex from "@stylexjs/stylex";

import { locations } from "@/components/location-flags";
import type { LocationKey } from "@/components/location-flags";

/**
 * Each currency IBKR holds cash in, with the location key of the country
 * (or, for the euro, the union) that issues it, so currencies show the same
 * flags as listing exchanges. IBKR's apps instead load per-currency images
 * (`USD.png`) from the `fx_flag_url` link, an `iserver` call that needs the
 * brokerage session.
 */
const currencyLocations = {
  AED: "TP_United_Arab_Emirates",
  AUD: "TP_Australia",
  CAD: "TP_Canada",
  CHF: "TP_Switzerland",
  CNH: "TP_China",
  CNY: "TP_China",
  CZK: "TP_Czech",
  DKK: "TP_Denmark",
  EUR: "TP_EU",
  GBP: "TP_United Kingdom",
  HKD: "TP_Hong_Kong",
  HUF: "TP_Hungary",
  ILS: "TP_Israel",
  INR: "TP_India",
  JPY: "TP_Japan",
  KRW: "TP_South_Korea",
  MXN: "TP_Mexico",
  NOK: "TP_Norway",
  NZD: "TP_New_Zealand",
  PLN: "TP_Poland",
  RUB: "TP_Russian_Federation",
  SAR: "TP_Saudi_Arabia",
  SEK: "TP_Sweden",
  SGD: "TP_Singapore",
  TRY: "TP_Turkey",
  TWD: "TP_Taiwan",
  USD: "TP_US",
  ZAR: "TP_SouthAfrica",
} as const satisfies Record<string, LocationKey>;

const isMappedCurrency = (
  code: string
): code is keyof typeof currencyLocations =>
  Object.hasOwn(currencyLocations, code);

const styles = stylex.create({
  // Sized to the surrounding text.
  flag: {
    display: "block",
    flexShrink: 0,
    height: "1em",
    width: "1em",
  },
});

/**
 * The flag of the country issuing a currency, sized to the text around it;
 * nothing for a currency without one. Named for screen readers, e.g.
 * "United States".
 */
export const CurrencyFlag = ({ currency }: { currency: string }) => {
  const code = currency.toUpperCase();
  if (!isMappedCurrency(code)) {
    return null;
  }
  const location = locations[currencyLocations[code]];
  return (
    <img
      alt={location.country}
      title={location.country}
      draggable={false}
      src={location.src}
      {...stylex.props(styles.flag)}
    />
  );
};
