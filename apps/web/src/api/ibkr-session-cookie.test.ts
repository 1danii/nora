import { emptyIbkrBrowserSnapshot } from "@nora/ibkr/browser-login";
import type { IbkrBrowserSnapshot } from "@nora/ibkr/browser-login";
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ibkrDemoSessionCookie,
  ibkrDemoSnapshot,
  ibkrDemoWindowMs,
  makeIbkrSessionCookie,
} from "./ibkr-session-cookie";
import type { IbkrCookieWrite } from "./ibkr-session-cookie";

const secret = "synthetic-test-secret-with-32-characters";
const withCookie = (name: string, value: string): IbkrBrowserSnapshot => ({
  ...emptyIbkrBrowserSnapshot,
  cookies: [
    {
      name,
      value,
      domain: "ndcdyn.interactivebrokers.com",
      path: "/",
      secure: true,
    },
  ],
});
/** What the browser would send back after receiving these cookies. */
const sentBack = (writes: readonly IbkrCookieWrite[]) =>
  Object.fromEntries(
    writes
      .filter((write) => write.maxAgeSeconds > 0)
      .map((write) => [write.name, write.value])
  );
afterEach(() => vi.useRealTimers());

describe("IBKR encrypted session cookies", () => {
  it("restores a private cookie jar without exposing its plaintext", async () => {
    const codec = await Effect.runPromise(makeIbkrSessionCookie(secret));
    const snapshot = withCookie("XYZAB", "private-upstream-cookie");
    const writes = await Effect.runPromise(codec.write(snapshot));
    expect(JSON.stringify(writes)).not.toContain("private-upstream-cookie");
    expect(await Effect.runPromise(codec.read(sentBack(writes)))).toEqual(
      snapshot
    );
  });

  it("rejects expired, tampered, and differently keyed cookies", async () => {
    const codec = await Effect.runPromise(makeIbkrSessionCookie(secret));
    const cookies = sentBack(
      await Effect.runPromise(codec.write(emptyIbkrBrowserSnapshot))
    );
    const value = cookies.nora_ibkr ?? "";
    const tampered = {
      nora_ibkr: value.replace(/.$/u, (c) => (c === "A" ? "B" : "A")),
    };
    expect(await Effect.runPromise(codec.read(tampered))).toBeNull();
    const other = await Effect.runPromise(
      makeIbkrSessionCookie(`${secret}-other`)
    );
    expect(await Effect.runPromise(other.read(cookies))).toBeNull();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 301_000);
    expect(await Effect.runPromise(codec.read(cookies))).toBeNull();
  });

  it("reassembles chunks and rejects a missing chunk", async () => {
    const codec = await Effect.runPromise(makeIbkrSessionCookie(secret));
    const writes = await Effect.runPromise(
      codec.write(withCookie("large", "x".repeat(5000)))
    );
    const cookies = sentBack(writes);
    expect(Object.keys(cookies).length).toBeGreaterThan(1);
    expect(await Effect.runPromise(codec.read(cookies))).toBeDefined();
    expect(
      await Effect.runPromise(
        codec.read({ nora_ibkr: cookies.nora_ibkr ?? "" })
      )
    ).toBeNull();
    expect(writes.every((write) => write.value.length < 4000)).toBe(true);
  });
});

const readDemo = (value: string) =>
  Effect.runPromise(ibkrDemoSessionCookie.read({ nora_ibkr: value }));

describe("IBKR demo session cookie", () => {
  it("round-trips a demo session", async () => {
    const snapshot = ibkrDemoSnapshot(Date.now() + 60_000);
    const writes = await Effect.runPromise(
      ibkrDemoSessionCookie.write(snapshot)
    );
    expect(
      await Effect.runPromise(ibkrDemoSessionCookie.read(sentBack(writes)))
    ).toEqual(snapshot);
  });

  it("refuses to store anything but a demo session", async () => {
    const exit = await Effect.runPromiseExit(
      ibkrDemoSessionCookie.write(withCookie("XYZAB", "upstream"))
    );
    expect(exit._tag).toBe("Failure");
  });

  it("rejects malformed, expired and over-long values", async () => {
    const now = Date.now();
    expect(await readDemo("1.encrypted-token")).toBeNull();
    expect(await readDemo("demo.not-a-number")).toBeNull();
    expect(await readDemo(`demo.${now - 1000}`)).toBeNull();
    expect(
      await readDemo(`demo.${now + ibkrDemoWindowMs + 60_000}`)
    ).toBeNull();
  });
});
