import { IbkrLoginStatusSchema } from "@nora/ibkr/browser-schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import {
  ibkrSessionQuery,
  ibkrTickleQuery,
  requestIbkrLogin,
} from "@/lib/ibkr-login-queries";

/**
 * Ends the IBKR (or demo) session and goes to the login page. The
 * disconnected status replaces the session entry, and the old session's
 * portal reads are dropped.
 */
export const useIbkrSignOut = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => requestIbkrLogin("logout", IbkrLoginStatusSchema, {}),
    onSuccess: async (status) => {
      queryClient.setQueryData(ibkrSessionQuery.queryKey, status);
      queryClient.removeQueries({ queryKey: ["ibkr", "portal"] });
      queryClient.removeQueries({ queryKey: ibkrTickleQuery.queryKey });
      await navigate({ to: "/login", replace: true });
    },
  });
};
