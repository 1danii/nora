/**
 * Number formats shared across the app, all en-US. Prices and money take the
 * asset's own currency (IBKR's ISO code, e.g. "EUR"), never an assumed USD.
 */

/** Number formats NumberFlow also takes: no scientific notation. */
type MoneyOptions = Pick<
  Intl.NumberFormatOptions,
  | "style"
  | "currency"
  | "minimumFractionDigits"
  | "maximumFractionDigits"
  | "signDisplay"
> & { notation?: "compact" };

/** The ISO codes `Intl` can format, e.g. "USD", "EUR", "CZK". */
const knownCurrencies = new Set(Intl.supportedValuesOf("currency"));

/**
 * `Intl` options for an amount in `currency`. Without a currency IBKR gave,
 * or with one `Intl` doesn't know, a plain two-decimal number: better no
 * symbol than a wrong one.
 */
export const moneyOptions = (
  currency: string | undefined,
  notation?: "compact"
): MoneyOptions => {
  const plain: MoneyOptions = notation
    ? { notation, maximumFractionDigits: 2 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  const code = currency?.trim().toUpperCase();
  return code && knownCurrencies.has(code)
    ? { ...plain, style: "currency", currency: code }
    : plain;
};

const moneyFormats = new Map<string, Intl.NumberFormat>();

const cachedMoney = (currency: string | undefined, notation?: "compact") => {
  const key = `${currency ?? ""}:${notation ?? ""}`;
  let format = moneyFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat("en-US", moneyOptions(currency, notation));
    moneyFormats.set(key, format);
  }
  return format;
};

/** A price, e.g. "$1,234.50", "€98.10", "CHF 12.00". */
export const formatMoney = (amount: number, currency: string | undefined) =>
  cachedMoney(currency).format(amount);

const signedMoneyFormats = new Map<string, Intl.NumberFormat>();

/** A gain or loss, e.g. "+$1,234.50" or "-€98.10". */
export const formatSignedMoney = (
  amount: number,
  currency: string | undefined
) => {
  const key = currency ?? "";
  let format = signedMoneyFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat("en-US", {
      ...moneyOptions(currency),
      signDisplay: "exceptZero",
    });
    signedMoneyFormats.set(key, format);
  }
  return format.format(amount);
};

const priceFormats = new Map<string, Intl.NumberFormat>();

/**
 * A price to the decimals IBKR quoted it with, e.g. "$0.0178" or "$35.81",
 * so a sub-dollar price isn't rounded away.
 */
export const formatPrice = (
  amount: number,
  currency: string | undefined,
  decimals: number
) => {
  const key = `${currency ?? ""}:${decimals}`;
  let format = priceFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat("en-US", {
      ...moneyOptions(currency),
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    priceFormats.set(key, format);
  }
  return format.format(amount);
};

/** A large amount, e.g. market cap: "$2.95T". */
export const formatCompactMoney = (
  amount: number,
  currency: string | undefined
) => cachedMoney(currency, "compact").format(amount);

/** A move, signed and without a currency: "+1.23", "-0.40". */
export const signedNumber = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

/** A plain figure such as P/E or beta: "35.12". */
export const decimalNumber = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** A count such as volume: "12.4M". */
export const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

/** A share given as a fraction: 0.0052 → "0.52%". */
export const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const magnitudes = new Map([
  ["K", 1e3],
  ["M", 1e6],
  ["B", 1e9],
  ["T", 1e12],
]);

/**
 * A number from IBKR's text: "1,234.50", "C231.85" (a status prefix),
 * "12.4M", "-16.01%" (the percent sign dropped, the number kept as written).
 * Undefined when it isn't one.
 */
export const parseIbkrNumber = (value: string | undefined) => {
  const match =
    /^[A-Z]*(?<digits>[+\-\u2212]?[\d,]*\.?\d+)(?<magnitude>[KMBT])?%?$/iu.exec(
      value?.replaceAll(/\s/gu, "") ?? ""
    );
  const digits = match?.groups?.digits;
  if (!digits) {
    return;
  }
  const number = Number(digits.replace("\u2212", "-").replaceAll(",", ""));
  const magnitude = match.groups?.magnitude?.toUpperCase();
  const scale = magnitude ? (magnitudes.get(magnitude) ?? 1) : 1;
  return Number.isFinite(number) ? number * scale : undefined;
};
