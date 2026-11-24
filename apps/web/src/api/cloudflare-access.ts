import { Schema } from "effect";

/**
 * Detects whether a request came through Cloudflare Access, with no Access
 * settings to configure.
 *
 * `ctx.access` can't be used: Cloudflare doesn't pass it to Workers with static
 * assets, and every TanStack Start Worker has them. Access also adds a signed
 * `Cf-Access-Jwt-Assertion` header to every request it lets through, so this
 * checks that header instead. The token must be unexpired and signed by a key
 * that its own `*.cloudflareaccess.com` team publishes.
 *
 * Nothing pins the team or application, since that would need env vars. So
 * this catches a private deployment left without Access, and anyone who sends
 * a made-up header. It doesn't stop someone who signs a token with their own
 * Access team. Access in front of the Worker is the real guard.
 */

/** An Access team's issuer, e.g. `https://acme.cloudflareaccess.com`. */
const issuerPattern = /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/u;
/** Seconds a token may run past `exp`, for clock drift. */
const clockSkewSeconds = 60;
/** Signing keys are refetched after this, or on an unknown key id. */
const keysMaxAgeMs = 60 * 60 * 1000;
/** Unknown key ids refetch at most this often, so bad tokens can't spam it. */
const refetchIntervalMs = 60 * 1000;

const decodeBase64Url = (value: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (char) => char.codePointAt(0) ?? 0
  );

/** A token part's JSON text. */
const tokenPartJson = (value: string) =>
  new TextDecoder().decode(decodeBase64Url(value));

const decodeTokenHeader = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({ alg: Schema.Literals(["RS256"]), kid: Schema.String })
  )
);
const decodeTokenClaims = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      iss: Schema.String.pipe(Schema.check(Schema.isPattern(issuerPattern))),
      exp: Schema.Number,
    })
  )
);

/** An Access team's public keys, from `<issuer>/cdn-cgi/access/certs`. */
const decodeKeySet = Schema.decodeUnknownOption(
  Schema.Struct({
    keys: Schema.Array(
      Schema.Struct({
        kid: Schema.String,
        kty: Schema.Literals(["RSA"]),
        n: Schema.String,
        e: Schema.String,
      })
    ),
  })
);

type FetchLike = (input: string) => Promise<Response>;

interface KeySet {
  readonly fetchedAt: number;
  readonly keys: Promise<ReadonlyMap<string, CryptoKey>>;
}

const keySets = new Map<string, KeySet>();

const importKeys = async (
  issuer: string,
  fetchKeys: FetchLike
): Promise<ReadonlyMap<string, CryptoKey>> => {
  const response = await fetchKeys(`${issuer}/cdn-cgi/access/certs`);
  if (!response.ok) {
    throw new Error(`Access keys request failed: ${response.status}`);
  }
  const body = decodeKeySet(await response.json());
  if (body._tag === "None") {
    throw new Error("Access keys response had an unexpected shape");
  }
  const entries = await Promise.all(
    body.value.keys.map(
      async ({ kid, kty, n, e }) =>
        [
          kid,
          await crypto.subtle.importKey(
            "jwk",
            { kty, n, e },
            { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
            false,
            ["verify"]
          ),
        ] as const
    )
  );
  return new Map(entries);
};

/** A failed fetch isn't kept, so the next request tries again. */
const forgetOnFailure = async (issuer: string, keySet: KeySet) => {
  try {
    await keySet.keys;
  } catch {
    if (keySets.get(issuer) === keySet) {
      keySets.delete(issuer);
    }
  }
};

const loadKeys = (issuer: string, fetchKeys: FetchLike, maxAgeMs: number) => {
  const cached = keySets.get(issuer);
  if (cached && Date.now() - cached.fetchedAt < maxAgeMs) {
    return cached.keys;
  }
  const keySet = { fetchedAt: Date.now(), keys: importKeys(issuer, fetchKeys) };
  keySets.set(issuer, keySet);
  void forgetOnFailure(issuer, keySet);
  return keySet.keys;
};

const findKey = async (issuer: string, kid: string, fetchKeys: FetchLike) => {
  const keys = await loadKeys(issuer, fetchKeys, keysMaxAgeMs);
  if (keys.has(kid)) {
    return keys.get(kid);
  }
  // Access rotates its keys, so an unknown id may be a new one.
  const refetched = await loadKeys(issuer, fetchKeys, refetchIntervalMs);
  return refetched.get(kid);
};

/** Whether the request carries a valid Cloudflare Access token. */
export const hasCloudflareAccess = async (
  request: Request,
  fetchKeys: FetchLike = fetch
): Promise<boolean> => {
  const token = request.headers.get("cf-access-jwt-assertion");
  const [header, payload, signature, ...rest] = token?.split(".") ?? [];
  if (!(header && payload && signature) || rest.length > 0) {
    return false;
  }
  try {
    const head = decodeTokenHeader(tokenPartJson(header));
    const claims = decodeTokenClaims(tokenPartJson(payload));
    if (
      head._tag === "None" ||
      claims._tag === "None" ||
      claims.value.exp + clockSkewSeconds < Date.now() / 1000
    ) {
      return false;
    }
    const key = await findKey(claims.value.iss, head.value.kid, fetchKeys);
    return (
      key !== undefined &&
      (await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        decodeBase64Url(signature),
        new TextEncoder().encode(`${header}.${payload}`)
      ))
    );
  } catch {
    return false;
  }
};

/** Clears cached signing keys. For tests. */
export const resetCloudflareAccessKeys = () => {
  keySets.clear();
};

export const accessDeniedMessage = "Access denied.";

const accessDeniedPage = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Access denied</title>
<style>
  body { margin: 0; min-height: 100svh; display: grid; place-items: center; font: 14px/1.5 system-ui, sans-serif; text-align: center; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { margin: 0; opacity: 0.7; }
</style>
<main>
  <h1>Access denied</h1>
  <p>You don't have permission to view this page.</p>
</main>
</html>`;

/** 403 reply: a small page for browsers, JSON for API calls. */
export const accessDeniedResponse = (request: Request): Response => {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (!request.headers.get("accept")?.includes("text/html")) {
    return Response.json(
      { error: accessDeniedMessage },
      { status: 403, headers }
    );
  }
  return new Response(accessDeniedPage, {
    status: 403,
    headers: {
      ...headers,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
};
