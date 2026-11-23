import { Effect } from "effect";
import { FetchHttpClient } from "effect/http";
import type { HttpClient } from "effect/http";

/** Runs an Effect against a mocked `fetch`, as the Fetch HTTP client would call it. */
export const runWithFetch = <A, E>(
  effect: Effect.Effect<A, E, HttpClient.HttpClient>,
  fetch: typeof globalThis.fetch
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, fetch)
    )
  );

export const requestHeaders = (init: RequestInit | undefined) => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(init?.headers ?? {})) {
    headers.set(name, String(value));
  }
  return headers;
};

/** The Fetch HTTP client sends URL-encoded forms as a string or as bytes. */
export const requestForm = (init: RequestInit | undefined) => {
  const body = init?.body;
  if (body instanceof Uint8Array) {
    return new URLSearchParams(new TextDecoder().decode(body));
  }
  return new URLSearchParams(body?.toString() ?? "");
};
