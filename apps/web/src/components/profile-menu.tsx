import { Menu } from "@base-ui/react/menu";
import { ExitIcon } from "@radix-ui/react-icons";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";

import { QueryBoundary } from "@/components/query-boundary";
import { popupStyles } from "@/components/ui/popup-styles";
import { ibkrUserQuery } from "@/lib/ibkr-account-queries";
import { ibkrSessionQuery } from "@/lib/ibkr-login-queries";
import { useIbkrSignOut } from "@/lib/ibkr-sign-out";
import { text } from "@/styles/text";
import { colors } from "@/styles/tokens.stylex";

const styles = stylex.create({
  // A round button with the username's first letter.
  avatar: {
    padding: 0,
    borderRadius: "50%",
    borderStyle: "none",
    alignItems: "center",
    backgroundColor: {
      "[data-popup-open]": colors.gray4,
      default: colors.gray3,
      ":hover": colors.gray4,
    },
    boxShadow: `0 0 0 0.5px ${colors.whiteA3}`,
    color: colors.gray12,
    cursor: "pointer",
    display: "flex",
    flexShrink: 0,
    fontWeight: 550,
    justifyContent: "center",
    textTransform: "uppercase",
    transitionDuration: {
      default: "100ms",
      "@media (prefers-reduced-motion: reduce)": "0s",
    },
    transitionProperty: "background-color",
    transitionTimingFunction: "ease",
    userSelect: "none",
    height: stylex.env.spacing(8),
    width: stylex.env.spacing(8),
  },
  popup: {
    padding: stylex.env.spacing(1),
    minWidth: stylex.env.spacing(56),
  },
  // Lined up with the options' text; tighter than an option, since the two
  // lines read as one label.
  identity: {
    paddingBlock: stylex.env.spacing(1.5),
    paddingInline: stylex.env.spacing(3),
    display: "flex",
    flexDirection: "column",
  },
  username: {
    overflow: "hidden",
    color: colors.gray12,
    fontWeight: 550,
    // 18px instead of text[14]'s 20px, so the login type sits close under it.
    lineHeight: "calc(1.125 / .875)",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  loginType: {
    color: colors.gray11,
  },
  separator: {
    marginBlock: stylex.env.spacing(1),
    marginInline: stylex.env.spacing(-1),
    backgroundColor: colors.whiteA3,
    height: 0.5,
  },
  // The destructive red the inputs use for invalid values.
  destructive: {
    color: colors.red9,
    justifyContent: "start",
  },
});

const loginTypeLabels = {
  live: "Live account",
  paper: "Paper trading account",
} as const;

const signOutLabel = ({
  isPending,
  isError,
}: {
  isPending: boolean;
  isError: boolean;
}) => {
  if (isPending) {
    return "Signing out…";
  }
  return isError ? "Sign out failed. Try again" : "Sign out";
};

/** Without the login type the menu still works, so a failure shows nothing. */
const NoLoginType = () => null;

/** Live or paper, from IBKR; a demo session says so instead. */
const LoginType = () => {
  const { data: user } = useSuspenseQuery(ibkrUserQuery);
  return (
    <span {...stylex.props(text[12], styles.loginType)}>
      {loginTypeLabels[user.loginType]}
    </span>
  );
};

/**
 * The avatar at the header's end: who's signed in, how, and signing out.
 * The avatar and username come from Nora's own session, so the menu opens
 * at once; only the login type waits on IBKR.
 */
export const ProfileMenu = () => {
  const { data: session } = useSuspenseQuery(ibkrSessionQuery);
  const signOut = useIbkrSignOut();
  const username = session.username ?? "";
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Account menu for ${username}`}
        {...stylex.props(text[12], styles.avatar)}
      >
        {username.slice(0, 1) || "?"}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          sideOffset={6}
          align="end"
          {...stylex.props(popupStyles.positioner)}
        >
          <Menu.Popup {...stylex.props(popupStyles.popup, styles.popup)}>
            <div {...stylex.props(styles.identity)}>
              <span {...stylex.props(text[14], styles.username)}>
                {username}
              </span>
              {session.demo ? (
                <span {...stylex.props(text[12], styles.loginType)}>
                  Demo account
                </span>
              ) : (
                <QueryBoundary
                  skeleton={
                    <span {...stylex.props(text[12], styles.loginType)}>
                      {loginTypeLabels.live}
                    </span>
                  }
                  errorComponent={NoLoginType}
                >
                  <LoginType />
                </QueryBoundary>
              )}
            </div>
            <Menu.Separator {...stylex.props(styles.separator)} />
            {/* Stays open while signing out; success leaves for login. */}
            <Menu.Item
              closeOnClick={false}
              disabled={signOut.isPending}
              onClick={() => {
                signOut.mutate();
              }}
              {...stylex.props(popupStyles.item, styles.destructive)}
            >
              <span {...stylex.props(popupStyles.icon)}>
                <ExitIcon {...stylex.props(popupStyles.iconGlyph)} />
              </span>
              {signOutLabel(signOut)}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
};
