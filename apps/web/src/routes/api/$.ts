import { createFileRoute } from "@tanstack/react-router";

import { handleApiRequest } from "@/api/api-handler.server";

/** Hands every `/api/*` request to the Effect router in `src/api`. */
export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      ANY: ({ request }) => handleApiRequest(request),
    },
  },
});
