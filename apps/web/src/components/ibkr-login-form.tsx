import { Field } from "@base-ui/react/field";
import type {
  IbkrLoginStart,
  IbkrLoginStatus,
} from "@nora/ibkr/browser-schemas";
import {
  IbkrLoginStartSchema,
  IbkrLoginStatusSchema,
} from "@nora/ibkr/browser-schemas";
import * as stylex from "@stylexjs/stylex";
import type { AnyFieldApi } from "@tanstack/react-form";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Schema } from "effect";
import { Classic } from "loading-dev";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ComponentProps, ReactNode } from "react";
import { useEffect, useRef } from "react";

import { AuthStep } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ibkrLoginModeQuery,
  ibkrSessionQuery,
  requestIbkrLogin,
} from "@/lib/ibkr-login-queries";
import { text } from "@/styles/text";
import { colors, radius } from "@/styles/tokens.stylex";

const styles = stylex.create({
  stack: {
    gap: stylex.env.spacing(3),
    display: "flex",
    flexDirection: "column",
  },
  // Keeps the submit button 32px below its fields.
  form: {
    gap: stylex.env.spacing(8),
    display: "flex",
    flexDirection: "column",
  },
  // Same surface as Input: background, radius and hairline shadow.
  pending: {
    borderRadius: radius.lg,
    gap: stylex.env.spacing(3),
    paddingInline: stylex.env.spacing(4),
    alignItems: "center",
    backgroundColor: colors.gray2,
    boxShadow: `0 0 0 0.5px ${colors.whiteA2}`,
    color: colors.gray11,
    display: "flex",
    height: stylex.env.spacing(16),
  },
  // Sign-in step: the demo link sits 24px below the form and its error.
  signInBody: {
    gap: stylex.env.spacing(6),
    display: "flex",
    flexDirection: "column",
  },
  // Approval steps: Cancel 32px below the main element, the error 12px
  // below Cancel.
  approvalBody: {
    gap: stylex.env.spacing(8),
    display: "flex",
    flexDirection: "column",
  },
  demo: {
    color: colors.gray11,
    textAlign: "center",
  },
  // Reads as part of the sentence: no padding, in the default text color.
  demoButton: {
    padding: 0,
    color: colors.gray12,
    opacity: { default: null, ":disabled": 0.5 },
    pointerEvents: { default: null, ":disabled": "none" },
    transitionDuration: {
      default: "100ms",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionProperty: "opacity",
  },
  // A link inside sentence text, colored like the demo button.
  inlineLink: {
    color: colors.gray12,
  },
  formError: {
    color: colors.red9,
    textAlign: "center",
    textWrap: "pretty",
  },
  // Clips the message while its height animates.
  errorFrame: {
    overflow: "hidden",
  },
  error: {
    color: colors.red9,
    textAlign: "start",
    // Padding instead of a gap, so the spacing animates with the height.
    paddingTop: stylex.env.spacing(1.5),
  },
});

/** Nora's source, for people who want to run their own copy. */
const repositoryUrl = "https://github.com/1danii/nora";

// The same Effect schema validates the API request body on the server.
const startValidator = Schema.toStandardSchemaV1(IbkrLoginStartSchema);

/** Validate on the first submit, then live on every change. */
const validationLogic = revalidateLogic({
  mode: "submit",
  modeAfterSubmission: "change",
});

/** Field errors are Standard Schema issues from the Effect validators. */
const errorMessage = (errors: readonly { message: string }[]) =>
  errors.map((issue) => issue.message).join(" ");

const startDefaults: IbkrLoginStart = { username: "", password: "" };

/**
 * A TanStack Form field rendered as a Base UI Field, so an invalid field sets
 * `aria-invalid` on the input and shows its message below it.
 */
const TextField = ({
  field,
  ...props
}: { field: AnyFieldApi } & Omit<
  ComponentProps<typeof Input>,
  "name" | "value" | "onValueChange" | "onBlur"
>) => {
  const reduceMotion = useReducedMotion();
  const duration = reduceMotion ? 0 : 0.15;
  const invalid = !field.state.meta.isValid;
  return (
    <Field.Root
      name={field.name}
      invalid={invalid}
      dirty={field.state.meta.isDirty}
      touched={field.state.meta.isTouched}
    >
      <Input
        {...props}
        value={field.state.value}
        onValueChange={(value) => field.handleChange(value)}
        onBlur={field.handleBlur}
      />
      {/* Height pushes the layout (ease-in-out) while the text fades in and
          out (ease-out). On exit, AnimatePresence keeps the last message. */}
      <AnimatePresence initial={false}>
        {invalid && (
          <motion.div
            key="error"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration, ease: "easeInOut" },
              opacity: { duration, ease: "easeOut" },
            }}
            {...stylex.props(styles.errorFrame)}
          >
            <Field.Error match {...stylex.props(text[12], styles.error)}>
              {errorMessage(field.state.meta.errors)}
            </Field.Error>
          </motion.div>
        )}
      </AnimatePresence>
    </Field.Root>
  );
};

const SignInForm = ({
  busy,
  signIn,
}: {
  busy: boolean;
  signIn: (value: IbkrLoginStart) => Promise<IbkrLoginStatus>;
}) => {
  const form = useForm({
    defaultValues: startDefaults,
    validationLogic,
    validators: { onDynamic: startValidator },
    onSubmit: async ({ value, formApi }) => {
      try {
        await signIn(value);
      } catch {
        // The error is shown by the parent; only the password is cleared.
        formApi.resetField("password");
      }
    },
  });
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      {...stylex.props(styles.form)}
    >
      <div {...stylex.props(styles.stack)}>
        <form.Field name="username">
          {(field) => (
            <TextField
              field={field}
              aria-label="Username"
              placeholder="Username"
              autoComplete="username"
              disabled={busy}
            />
          )}
        </form.Field>
        <form.Field name="password">
          {(field) => (
            <TextField
              field={field}
              aria-label="Password"
              placeholder="Password"
              type="password"
              autoComplete="current-password"
              disabled={busy}
            />
          )}
        </form.Field>
      </div>
      <Button type="submit" variant="secondary" disabled={busy}>
        Log in
      </Button>
    </form>
  );
};

/** IBKR login: password, then approval in IBKR Mobile, polled until it lands. */
export const IbkrLoginForm = () => {
  const { data: status } = useSuspenseQuery(ibkrSessionQuery);
  const { data: loginMode } = useSuspenseQuery(ibkrLoginModeQuery);
  const queryClient = useQueryClient();
  const update = (value: IbkrLoginStatus) => {
    queryClient.setQueryData(ibkrSessionQuery.queryKey, value);
  };
  const start = useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: (body: IbkrLoginStart) =>
      requestIbkrLogin("start", IbkrLoginStatusSchema, body),
    onSuccess: update,
  });
  const action = useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: ({
      path,
      body,
    }: {
      path: string;
      body: Record<string, string>;
    }) => requestIbkrLogin(path, IbkrLoginStatusSchema, body),
    onSuccess: update,
  });
  const poll = useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: () => requestIbkrLogin("poll", IbkrLoginStatusSchema, {}),
    onSuccess: update,
  });
  // Cancel waits for an in-flight poll, so a late poll response can't write
  // the session cookie back after logout clears it.
  const pendingPoll = useRef<Promise<unknown>>(Promise.resolve());
  const cancel = useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: async () => {
      await pendingPoll.current;
      return requestIbkrLogin("logout", IbkrLoginStatusSchema, {});
    },
    onSuccess: update,
  });
  const demo = useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: () => requestIbkrLogin("demo", IbkrLoginStatusSchema, {}),
    onSuccess: update,
  });
  const pollMutate = poll.mutateAsync;
  const pollPending = poll.isPending;
  const pollError = poll.error;
  // Polling runs in the background and does not disable anything.
  const busy =
    start.isPending || action.isPending || cancel.isPending || demo.isPending;
  useEffect(() => {
    if (
      status.state !== "secondFactor" ||
      busy ||
      pollPending ||
      pollError ||
      (status.expiresAt ?? 0) <= Date.now()
    ) {
      return;
    }
    const timer = setTimeout(() => {
      // allSettled: the error is shown through poll.error, not rethrown here.
      pendingPoll.current = Promise.allSettled([pollMutate()]);
    }, 3000);
    return () => clearTimeout(timer);
  }, [status, busy, pollPending, pollError, pollMutate]);
  const error =
    start.error ?? demo.error ?? action.error ?? poll.error ?? cancel.error;
  const reduceMotion = useReducedMotion();
  const duration = reduceMotion ? 0 : 0.15;
  const formError = (
    // Fades like the field errors; AnimatePresence keeps the last message
    // while it fades out.
    <AnimatePresence initial={false}>
      {error && (
        <motion.div
          key="error"
          role="alert"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration, ease: "easeOut" }}
          {...stylex.props(text[12], styles.formError)}
        >
          {error.message}
        </motion.div>
      )}
    </AnimatePresence>
  );
  const cancelButton = (
    <Button
      variant="outline"
      disabled={busy}
      onClick={() => {
        start.reset();
        poll.reset();
        cancel.mutate();
      }}
    >
      Cancel
    </Button>
  );
  // A public demo deployment has no credential fields at all, so nobody
  // types an IBKR password into it.
  const demoOnly = (
    <AuthStep
      title="Try Nora"
      description={
        <>
          Explore Nora with a sample IBKR account, or{" "}
          <a
            href={repositoryUrl}
            target="_blank"
            rel="noopener noreferrer"
            {...stylex.props(styles.inlineLink)}
          >
            deploy your own
          </a>
          .
        </>
      }
    >
      <div {...stylex.props(styles.stack)}>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => demo.mutate()}
        >
          Try the demo
        </Button>
        {formError}
      </div>
    </AuthStep>
  );
  const steps = {
    disconnected:
      loginMode === "demo" ? (
        demoOnly
      ) : (
        <AuthStep
          title="Log in to IBKR"
          description="Use your IBKR credentials."
        >
          <div {...stylex.props(styles.signInBody)}>
            {/* The form error sits 12px below the form. */}
            <div {...stylex.props(styles.stack)}>
              <SignInForm
                busy={busy}
                signIn={(value) => {
                  demo.reset();
                  return start.mutateAsync(value);
                }}
              />
              {formError}
            </div>
            <p {...stylex.props(text[12], styles.demo)}>
              No IBKR account?{" "}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  start.reset();
                  demo.mutate();
                }}
                {...stylex.props(styles.demoButton)}
              >
                Try the demo
              </button>
            </p>
          </div>
        </AuthStep>
      ),
    chooseFactor: (
      <AuthStep
        title="Approve the login"
        description="Choose how to verify your login."
      >
        <div {...stylex.props(styles.approvalBody)}>
          <div {...stylex.props(styles.stack)}>
            {status.factors?.map((factor) => (
              <Button
                key={factor.id}
                variant="outline"
                disabled={busy}
                onClick={() =>
                  action.mutate({ path: "factor", body: { factor: factor.id } })
                }
              >
                {factor.label}
              </Button>
            ))}
          </div>
          <div {...stylex.props(styles.stack)}>
            {cancelButton}
            {formError}
          </div>
        </div>
      </AuthStep>
    ),
    secondFactor: (
      <AuthStep
        title="Approve the login"
        description="IBKR sent you a notification to your phone. Tap the notification to complete two-factor authentication."
      >
        <div {...stylex.props(styles.approvalBody)}>
          <output {...stylex.props(text[14], styles.pending)}>
            {/* The spinner is aria-hidden; the text is what gets announced. */}
            <Classic size={20} color={colors.gray12} />
            Awaiting confirmation
          </output>
          <div {...stylex.props(styles.stack)}>
            {cancelButton}
            {formError}
          </div>
        </div>
      </AuthStep>
    ),
    // The login route sends an authenticated session to /dashboard.
    authenticated: null,
  } satisfies Record<IbkrLoginStatus["state"], ReactNode>;
  return (
    // mode="wait": the old step scales and fades out before the next one
    // comes in the same way.
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={status.state}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
      >
        {steps[status.state]}
      </motion.div>
    </AnimatePresence>
  );
};
