import { Popover } from "@base-ui/react/popover";
import type { IbkrAccountSummary } from "@nora/ibkr/api-schemas";
import * as stylex from "@stylexjs/stylex";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ErrorComponentProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { CurrencyFlag } from "@/components/currency-flag";
import { ChangeFigures } from "@/components/price-change";
import { QueryBoundary, TryAgain } from "@/components/query-boundary";
import { popupStyles } from "@/components/ui/popup-styles";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format";
import {
  ibkrAccountSummaryQuery,
  ibkrAccountsQuery,
  ibkrLedgerQuery,
  ibkrPnlQuery,
} from "@/lib/ibkr-account-queries";
import { useBrokerageAccess } from "@/lib/ibkr-brokerage";
import { text } from "@/styles/text";
import { breakpoints, colors, radius } from "@/styles/tokens.stylex";

const styles = stylex.create({
  // The figures as one button, as tall as the search beside it, so the
  // hover background has room above and below the two lines.
  trigger: {
    borderRadius: radius.lg,
    borderStyle: "none",
    gap: stylex.env.spacing(5),
    paddingBlock: 0,
    paddingInline: stylex.env.spacing(3),
    alignItems: "center",
    backgroundColor: {
      "[data-popup-open]": colors.gray2,
      default: "transparent",
      ":hover": colors.gray2,
    },
    color: "inherit",
    cursor: "pointer",
    display: "flex",
    fontFamily: "inherit",
    textAlign: "end",
    transitionDuration: {
      default: "100ms",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionProperty: "background-color",
    transitionTimingFunction: "ease",
    height: stylex.env.spacing(11),
  },
  // A small label over its amount.
  stat: {
    alignItems: "end",
    display: "flex",
    flexDirection: "column",
  },
  // Only cash is dropped when the header gets narrow; the total stays.
  secondary: {
    display: {
      default: "none",
      [breakpoints.lg]: "flex",
    },
  },
  label: {
    color: colors.gray11,
    whiteSpace: "nowrap",
  },
  // A flex row, so the day change's triangle centres on its line instead of
  // sitting on the baseline and pushing the numbers down.
  amount: {
    alignItems: "center",
    color: colors.gray12,
    display: "flex",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 550,
    whiteSpace: "nowrap",
  },
  popup: {
    padding: stylex.env.spacing(1),
    width: stylex.env.spacing(72),
  },
  rows: {
    margin: 0,
    paddingBlock: stylex.env.spacing(1),
    display: "flex",
    flexDirection: "column",
  },
  row: {
    gap: stylex.env.spacing(4),
    paddingBlock: stylex.env.spacing(1),
    paddingInline: stylex.env.spacing(3),
    display: "flex",
    justifyContent: "space-between",
  },
  term: {
    color: colors.gray11,
  },
  // The flag before the code.
  currency: {
    gap: stylex.env.spacing(1.5),
    alignItems: "center",
    display: "flex",
  },
  value: {
    margin: 0,
    color: colors.gray12,
    fontVariantNumeric: "tabular-nums",
  },
  separator: {
    marginBlock: stylex.env.spacing(1),
    marginInline: stylex.env.spacing(-1),
    backgroundColor: colors.whiteA3,
    height: 0.5,
  },
  error: {
    gap: stylex.env.spacing(2),
    alignItems: "center",
    color: colors.gray11,
    display: "flex",
    whiteSpace: "nowrap",
  },
});

/** One summary figure in the account's currency; undefined when IBKR left it out. */
export const summaryAmount = (
  summary: IbkrAccountSummary,
  key: string,
  fallbackCurrency: string | undefined
) => {
  const entry = summary[key];
  if (entry?.amount === undefined || entry.amount === null || entry.isNull) {
    return;
  }
  return formatMoney(
    entry.amount,
    entry.currency ?? fallbackCurrency ?? undefined
  );
};

const Stat = ({
  label,
  amount,
  secondary = false,
}: {
  label: ReactNode;
  amount: ReactNode;
  secondary?: boolean;
}) => (
  <span {...stylex.props(styles.stat, secondary && styles.secondary)}>
    <span {...stylex.props(text[12], styles.label)}>{label}</span>
    <span {...stylex.props(text[14], styles.amount)}>{amount}</span>
  </span>
);

const Row = ({ term, value }: { term: ReactNode; value: ReactNode }) => (
  <div {...stylex.props(text[14], styles.row)}>
    <dt {...stylex.props(styles.term)}>{term}</dt>
    <dd {...stylex.props(styles.value)}>{value}</dd>
  </div>
);

/** Cash in each currency the account holds, from the ledger. */
const CashByCurrency = ({ accountId }: { accountId: string }) => {
  const { data: ledger } = useSuspenseQuery(ibkrLedgerQuery(accountId));
  const entries = Object.entries(ledger).filter(
    ([currency, entry]) => currency !== "BASE" && entry.cashbalance
  );
  if (entries.length === 0) {
    return null;
  }
  return (
    <>
      <div {...stylex.props(styles.separator)} />
      <div {...stylex.props(popupStyles.groupLabel)}>Cash by currency</div>
      <dl {...stylex.props(styles.rows)}>
        {entries.map(([currency, entry]) => (
          <Row
            key={currency}
            term={
              <span {...stylex.props(styles.currency)}>
                <CurrencyFlag currency={currency} />
                {currency}
              </span>
            }
            value={formatMoney(entry.cashbalance ?? 0, currency)}
          />
        ))}
      </dl>
    </>
  );
};

/**
 * Today's profit and loss: `expected` while it's loading or shown, so its
 * place is held by a skeleton rather than popping in after the rest. It's an
 * `iserver` call, so it waits for the brokerage session the dashboard opens,
 * and drops out while another platform holds it.
 */
const useTodaysPnl = (accountId: string) => {
  const brokerage = useBrokerageAccess();
  const pnl = useQuery({
    ...ibkrPnlQuery(accountId),
    enabled: brokerage.ready,
  });
  // A failure, or no row for the account, drops the figure.
  const failed = pnl.isError || pnl.data === null;
  return {
    expected: brokerage.expected && !failed,
    value: pnl.data ?? undefined,
  };
};

/** The day change's shape while it loads. */
const changeSample = <ChangeFigures change={0} ratio={0} />;

const Balance = ({
  accountId,
  currency,
}: {
  accountId: string;
  currency: string | undefined;
}) => {
  const { data: summary } = useSuspenseQuery(
    ibkrAccountSummaryQuery(accountId)
  );
  const pnl = useTodaysPnl(accountId);
  const total = summary.netliquidation?.amount ?? undefined;
  const money = (key: string) => summaryAmount(summary, key, currency) ?? "—";
  const change =
    pnl.value !== undefined &&
    total !== undefined &&
    total - pnl.value !== 0 ? (
      <ChangeFigures
        change={pnl.value}
        ratio={pnl.value / (total - pnl.value)}
      />
    ) : undefined;
  const today = pnl.expected ? (
    <Skeleton loading={change === undefined} label="Loading today's change">
      {change ?? changeSample}
    </Skeleton>
  ) : undefined;
  return (
    <Popover.Root>
      <Popover.Trigger {...stylex.props(styles.trigger)}>
        <Stat secondary label="Cash" amount={money("totalcashvalue")} />
        {today ? <Stat secondary label="Today" amount={today} /> : null}
        <Stat label="Total value" amount={money("netliquidation")} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          sideOffset={6}
          align="end"
          {...stylex.props(popupStyles.positioner)}
        >
          <Popover.Popup {...stylex.props(popupStyles.popup, styles.popup)}>
            <Popover.Title {...stylex.props(popupStyles.groupLabel)}>
              Account {accountId}
            </Popover.Title>
            <dl {...stylex.props(styles.rows)}>
              <Row term="Total value" value={money("netliquidation")} />
              {today ? <Row term="Today" value={today} /> : null}
              <Row term="Cash" value={money("totalcashvalue")} />
              <Row term="Stocks" value={money("grosspositionvalue")} />
              <Row term="Buying power" value={money("buyingpower")} />
              <Row term="Available funds" value={money("availablefunds")} />
              <Row term="Excess liquidity" value={money("excessliquidity")} />
            </dl>
            <QueryBoundary label="Loading cash by currency">
              <CashByCurrency accountId={accountId} />
            </QueryBoundary>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
};

/** The first account's figures; IBKR Mobile shows the selected one, too. */
const AccountBalanceContent = () => {
  const { data: accounts } = useSuspenseQuery(ibkrAccountsQuery);
  const [account] = accounts;
  return account ? (
    <Balance
      accountId={account.accountId}
      currency={account.currency ?? undefined}
    />
  ) : null;
};

/** Fits the header: one line, the retry a default-size button. */
const BalanceError = ({ reset }: ErrorComponentProps) => (
  <div {...stylex.props(text[14], styles.error)}>
    <TryAgain reset={reset} />
  </div>
);

/** Drawn in the balance's own shape while it loads, Today included when it'll show. */
const BalanceSkeleton = () => (
  <div {...stylex.props(styles.trigger)}>
    <Stat secondary label="Cash" amount="$0,000.00" />
    {useBrokerageAccess().expected ? (
      <Stat secondary label="Today" amount={changeSample} />
    ) : null}
    <Stat label="Total value" amount="$00,000.00" />
  </div>
);

/**
 * Total value and cash at the header's end, refreshed every minute; a click
 * shows the rest of the account summary and cash by currency. Loads and
 * fails on its own, so pages never wait for it.
 */
export const AccountBalance = () => (
  <QueryBoundary
    label="Loading balance"
    skeleton={<BalanceSkeleton />}
    errorComponent={BalanceError}
  >
    <AccountBalanceContent />
  </QueryBoundary>
);
