import { Effect, Ref } from "effect";
import type { Cookies } from "effect/http";
import { describe, expect, it, vi } from "vitest";

import { ibkrBrowserRequest } from "./ibkr-browser-http";
import { requestHeaders, runWithFetch } from "./ibkr-browser-test-utils";

const newJar = () => Ref.makeUnsafe<readonly Cookies.Cookie[]>([]);

describe("IBKR browser HTTP", () => {
  it("retains redirect cookies and applies domain and path restrictions", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            location: "/sso/next",
            "Set-Cookie": "session=private; Path=/sso; Secure",
          },
        })
      )
      .mockImplementation(() => Promise.resolve(new Response("OK")));
    const jar = newJar();
    await runWithFetch(
      ibkrBrowserRequest(
        jar,
        "https://ndcdyn.interactivebrokers.com/sso/Login"
      ),
      fetch
    );
    expect(requestHeaders(fetch.mock.calls[1]?.[1]).get("Cookie")).toBe(
      "session=private"
    );
    await runWithFetch(
      ibkrBrowserRequest(jar, "https://api.ibkr.com/v1/api/test"),
      fetch
    );
    expect(requestHeaders(fetch.mock.calls[2]?.[1]).get("Cookie")).toBeNull();
  });

  it("rejects redirects outside IBKR before issuing the next request", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(() =>
      Promise.resolve(
        new Response(null, {
          status: 307,
          headers: { location: "https://example.com/collect" },
        })
      )
    );
    const error = await runWithFetch(
      Effect.flip(
        ibkrBrowserRequest(
          newJar(),
          "https://ndcdyn.interactivebrokers.com/sso/Authenticator",
          new URLSearchParams({ M1: "proof" })
        )
      ),
      fetch
    );
    expect(error.message).toContain("rejected upstream destination");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
