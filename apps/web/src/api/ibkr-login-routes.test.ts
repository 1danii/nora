import { ibkrGenericLoginMessage } from "@nora/ibkr/browser-schemas";
import { Layer } from "effect";
import { FetchHttpClient, HttpRouter } from "effect/http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import fixtures from "../../../../packages/ibkr/src/ibkr-browser-srp.fixtures.json";
import {
  requestForm,
  requestHeaders,
} from "../../../../packages/ibkr/src/ibkr-browser-test-utils";
import { makeIbkrLoginRoutes } from "./ibkr-login-routes";

const [fixture] = fixtures;
if (!fixture) {
  throw new Error("IBKR test: missing synthetic fixture");
}
const origin = "https://nora.test";
const secret = "synthetic-server-cookie-secret-32-characters";
const allowedUsername = fixture.input.username;

beforeEach(() => {
  vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
    if (array) {
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(
        0xaa
      );
    }
    return array;
  });
});
afterEach(() => vi.restoreAllMocks());

const vendorMock = (
  options: { invalidProof?: boolean; factor?: string; pushSent?: boolean } = {}
) => {
  let polls = 0;
  return vi.fn<typeof globalThis.fetch>().mockImplementation((input, init) =>
    Promise.resolve().then(() => {
      const url = String(input);
      if (url.endsWith("/Login")) {
        return new Response("SERVICE: 'AM.LOGIN'");
      }
      if (url.endsWith("/Dispatcher")) {
        return new Response("Portal");
      }
      if (url.endsWith("/portal.proxy/v1/portal/tickle")) {
        expect(init?.method).toBe("POST");
        expect(requestHeaders(init).get("Cookie")).toContain("XYZAB=");
        expect(requestHeaders(init).get("Origin")).toBe(
          "https://ndcdyn.interactivebrokers.com"
        );
        return Response.json({ session: "synthetic" });
      }
      if (url.endsWith("/portal.proxy/v1/portal/iserver/accounts")) {
        return Response.json({ error: "no session" }, { status: 401 });
      }
      if (
        url.endsWith("/tws.proxy/news2/landing/4815747?widgets=news&lang=en")
      ) {
        expect(init?.method).toBe("GET");
        expect(requestHeaders(init).get("Cookie")).toContain("XYZAB=");
        expect(requestHeaders(init).get("X-XYZAB")).toBeTruthy();
        expect(requestHeaders(init).get("X-SERVICE")).toBe("AM.LOGIN");
        return Response.json({
          news: { content: [{ newsId: "123", headlineContent: "Results" }] },
        });
      }
      const form = requestForm(init);
      switch (form.get("ACTION")) {
        case "INIT": {
          expect(form.get("A")).toBe(fixture.expected.A);
          return Response.json({
            ...fixture.parameters,
            B: fixture.input.serverPublic,
            s: fixture.input.salt,
            rsapub: "f".repeat(512),
            lp: true,
          });
        }
        case "COMPLETEAUTH": {
          expect(form.get("M1")).toBe(fixture.expected.M1);
          return Response.json({
            M2: options.invalidProof ? "bad" : fixture.expected.M2,
            sftypes: [options.factor ?? "5.2a"],
          });
        }
        case "COMPLETEAUTH_1": {
          return Response.json({
            type: "SWCR",
            push_sent: options.pushSent ?? true,
          });
        }
        case "COMPLETETWOFACT": {
          polls += 1;
          return Response.json({ auth_res: polls > 1 ? "true" : "false" });
        }
        case "LOGOUT": {
          return Response.json({ RESULT: true });
        }
        default: {
          throw new Error("IBKR test: unexpected vendor action");
        }
      }
    })
  );
};

const makeHandler = (
  fetch: typeof globalThis.fetch,
  username: string | undefined
) =>
  HttpRouter.toWebHandler(
    makeIbkrLoginRoutes({
      origin,
      secret,
      allowedUsername: username,
      demoLatencyMs: 0,
    }).pipe(
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch))
    ),
    { disableLogger: true }
  ).handler;

const startRequest = () =>
  new Request(`${origin}/api/ibkr/start`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      username: fixture.input.username,
      password: fixture.input.password,
    }),
  });

describe("IBKR login API", () => {
  it("restores login across Worker requests, waits for approval, and proxies the portal API", async () => {
    const fetch = vendorMock();
    let cookies = "";
    const call = async (
      path: string,
      body?: Record<string, string>,
      expectedStatus = 200
    ) => {
      const headers = new Headers({ Origin: origin, Cookie: cookies });
      if (body) {
        headers.set("Content-Type", "application/json");
      }
      // A new handler per call has no shared session memory, matching separate Worker isolates.
      const response = await makeHandler(
        fetch,
        allowedUsername
      )(
        new Request(`${origin}/api/ibkr/${path}`, {
          method: body ? "POST" : "GET",
          headers,
          body: body ? JSON.stringify(body) : undefined,
        })
      );
      const updates = response.headers.getSetCookie();
      if (updates.length > 0) {
        cookies = updates
          .filter((value) => !value.includes("Max-Age=0"))
          .map((value) => value.split(";")[0])
          .join("; ");
      }
      expect(response.status).toBe(expectedStatus);
      expect(updates.join(" ")).not.toContain(fixture.input.password);
      return response.json();
    };
    expect(
      await call("start", {
        username: fixture.input.username,
        password: fixture.input.password,
      })
    ).toMatchObject({ state: "secondFactor" });
    expect(await call("poll", {})).toMatchObject({ state: "secondFactor" });
    expect(await call("poll", {})).toMatchObject({ state: "authenticated" });
    expect(await call("session")).toMatchObject({ state: "authenticated" });
    expect(await call("portal/tickle", {})).toEqual({
      status: 200,
      body: { session: "synthetic" },
    });
    expect(await call("portal/iserver/accounts", undefined, 401)).toEqual({
      status: 401,
      body: { error: "no session" },
    });
    expect(await call("news2/landing/4815747?widgets=news&lang=en")).toEqual({
      status: 200,
      body: {
        news: { content: [{ newsId: "123", headlineContent: "Results" }] },
      },
    });
    expect(await call("logout", {})).toMatchObject({ state: "disconnected" });
    expect(await call("session")).toMatchObject({ state: "disconnected" });
  });

  it("signs in to the demo without credentials or IBKR calls", async () => {
    const fetch = vendorMock();
    const handler = makeHandler(fetch, allowedUsername);
    const login = await handler(
      new Request(`${origin}/api/ibkr/demo`, {
        method: "POST",
        headers: { Origin: origin },
      })
    );
    expect(login.status).toBe(200);
    expect(await login.json()).toMatchObject({
      state: "authenticated",
      demo: true,
    });
    const cookies = login.headers
      .getSetCookie()
      .filter((value) => !value.includes("Max-Age=0"))
      .map((value) => value.split(";")[0])
      .join("; ");
    const accounts = await handler(
      new Request(`${origin}/api/ibkr/portal/portfolio/accounts`, {
        headers: { Cookie: cookies },
      })
    );
    expect(await accounts.json()).toMatchObject({
      status: 200,
      body: [{ accountId: "U1234567" }],
    });
    const news = await handler(
      new Request(
        `${origin}/api/ibkr/news2/landing/265598?widgets=news&lang=en`,
        {
          headers: { Cookie: cookies },
        }
      )
    );
    expect(news.status).toBe(200);
    expect(await news.json()).toMatchObject({
      status: 200,
      body: {
        news: {
          content: expect.arrayContaining([
            expect.objectContaining({ headlineContent: expect.any(String) }),
          ]),
        },
      },
    });
    const logout = await handler(
      new Request(`${origin}/api/ibkr/logout`, {
        method: "POST",
        headers: { Origin: origin, Cookie: cookies },
      })
    );
    expect(await logout.json()).toEqual({ state: "disconnected" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a mismatched server proof before issuing session cookies", async () => {
    const response = await makeHandler(
      vendorMock({ invalidProof: true }),
      allowedUsername
    )(startRequest());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Incorrect username or password.",
    });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("does not silently skip an unsupported second factor", async () => {
    // 5.4 is unknown; 4.2 (SMS) needs code entry, which Nora does not offer.
    await Promise.all(
      ["5.4", "4.2"].map(async (factor) => {
        const response = await makeHandler(
          vendorMock({ factor }),
          allowedUsername
        )(startRequest());
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
          error: "Your account uses an unsupported verification method.",
        });
        expect(response.headers.getSetCookie()).toEqual([]);
      })
    );
  });

  it("hides upstream failures behind the generic message", async () => {
    const response = await makeHandler(
      vendorMock({ pushSent: false }),
      allowedUsername
    )(startRequest());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: ibkrGenericLoginMessage });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("rejects cross-origin login before contacting IBKR", async () => {
    const fetch = vendorMock();
    const response = await makeHandler(
      fetch,
      allowedUsername
    )(
      new Request(`${origin}/api/ibkr/start`, {
        method: "POST",
        headers: { Origin: "https://other.test" },
      })
    );
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses usernames other than the configured one before contacting IBKR", async () => {
    await Promise.all(
      ["someone-else", undefined].map(async (configured) => {
        const fetch = vendorMock();
        const response = await makeHandler(fetch, configured)(startRequest());
        expect(response.status).toBe(403);
        expect(fetch).not.toHaveBeenCalled();
      })
    );
  });
});
