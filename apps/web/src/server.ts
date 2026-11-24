import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

import {
  accessDeniedResponse,
  hasCloudflareAccess,
} from "@/api/cloudflare-access";

/**
 * Private deployments answer only requests that came through Cloudflare
 * Access: pages, server functions and `/api`. Static assets skip the Worker,
 * and Access guards them itself. Local dev has no Access in front of it.
 */
const requiresAccess = () =>
  !import.meta.env.DEV && process.env.IBKR_LOGIN_MODE === "private";

export default createServerEntry({
  async fetch(request, opts) {
    if (requiresAccess() && !(await hasCloudflareAccess(request))) {
      console.warn(
        "Refused a request without Cloudflare Access. Private mode needs Access on all traffic to this Worker."
      );
      return accessDeniedResponse(request);
    }
    return handler.fetch(request, opts);
  },
});
