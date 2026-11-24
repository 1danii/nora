import * as stylex from "@stylexjs/stylex";
import {
  QueryErrorResetBoundary,
  useQueryErrorResetBoundary,
} from "@tanstack/react-query";
import { CatchBoundary, isNotFound, useLocation } from "@tanstack/react-router";
import type {
  ErrorComponentProps,
  ErrorRouteComponent,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { SkeletonSuspense } from "@/components/ui/skeleton";
import { useBrokerageAccess } from "@/lib/ibkr-brokerage";
import { IbkrBrokerageUnavailableError } from "@/lib/ibkr-brokerage-error";
import { text } from "@/styles/text";
import { colors } from "@/styles/tokens.stylex";

/**
 * A failure's message and retry: always the same words, since the error
 * itself is for developers (React logs every caught error to the console).
 * Resets the failed queries and the boundary that caught the error.
 */
export const TryAgain = ({ reset }: Pick<ErrorComponentProps, "reset">) => {
  const { reset: resetQuery } = useQueryErrorResetBoundary();
  return (
    <>
      <span role="alert">Something went wrong.</span>
      <Button
        variant="outline"
        onClick={() => {
          resetQuery();
          reset();
        }}
      >
        Try again
      </Button>
    </>
  );
};

const styles = stylex.create({
  // Centred in whatever space the section had, message above the retry.
  error: {
    gap: stylex.env.spacing(3),
    paddingBlock: stylex.env.spacing(8),
    alignItems: "center",
    color: colors.gray11,
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    justifyContent: "center",
    textAlign: "center",
  },
});

/**
 * In place of data that needs IBKR's trading session after another platform
 * took it over. Nora takes it back when it's next used; then this retries
 * by itself.
 */
const BrokerageWaiting = ({ reset }: Pick<ErrorComponentProps, "reset">) => {
  const { reset: resetQuery } = useQueryErrorResetBoundary();
  const { ready } = useBrokerageAccess();
  useEffect(() => {
    if (ready) {
      resetQuery();
      reset();
    }
  }, [ready, reset, resetQuery]);
  return (
    <div {...stylex.props(text[14], styles.error)}>
      <span>
        IBKR&rsquo;s trading session is in use on another platform. Nora
        reconnects when you come back to it.
      </span>
    </div>
  );
};

/** A boundary's fallback: the generic message with a retry. */
export const ErrorNotice = ({ error, reset }: ErrorComponentProps) => {
  // Retrying can't find what doesn't exist: the route's not-found page shows instead.
  if (isNotFound(error)) {
    throw error;
  }
  if (error instanceof IbkrBrokerageUnavailableError) {
    return <BrokerageWaiting reset={reset} />;
  }
  return (
    <div {...stylex.props(text[14], styles.error)}>
      <TryAgain reset={reset} />
    </div>
  );
};

/**
 * Keeps one section's loading and failures inside it, with a retry. Give each
 * independent section its own boundary so a slow or failed call only affects it.
 *
 * While loading it shows a skeleton that crossfades into the content. Pass
 * `skeleton` (the section rendered from sample data) for its exact shape;
 * without it, skullet draws the shape last shown here, or a few generic lines.
 */
export const QueryBoundary = ({
  children,
  skeleton,
  label,
  errorComponent = ErrorNotice,
}: {
  children: ReactNode;
  skeleton?: ReactNode;
  /** Read to screen readers while loading. */
  label?: string;
  /** The failure's fallback, for places too small for `ErrorNotice`. */
  errorComponent?: ErrorRouteComponent;
}) => {
  const location = useLocation();
  return (
    <QueryErrorResetBoundary>
      <CatchBoundary
        getResetKey={() => location.pathname}
        errorComponent={errorComponent}
      >
        <SkeletonSuspense label={label} skeleton={skeleton}>
          {children}
        </SkeletonSuspense>
      </CatchBoundary>
    </QueryErrorResetBoundary>
  );
};
