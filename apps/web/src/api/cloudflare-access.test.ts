import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  accessDeniedMessage,
  accessDeniedResponse,
  hasCloudflareAccess,
  resetCloudflareAccessKeys,
} from "./cloudflare-access";

const issuer = "https://synthetic-team.cloudflareaccess.com";
const kid = "synthetic-key";

let signingKey: CryptoKey;
let publicJwk: JsonWebKey;

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"]
  );
  signingKey = pair.privateKey;
  publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
});

afterEach(() => {
  resetCloudflareAccessKeys();
});

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

interface TokenHeader {
  readonly alg?: string;
  readonly kid?: string;
}

interface TokenClaims {
  readonly iss?: string;
  readonly exp?: number;
  readonly email?: string;
}

const encodeJson = (value: TokenHeader | TokenClaims) =>
  base64Url(new TextEncoder().encode(JSON.stringify(value)));

const signToken = async (
  claims: TokenClaims = {},
  header: TokenHeader = {}
) => {
  const head = encodeJson({ alg: "RS256", kid, ...header });
  const body = encodeJson({
    iss: issuer,
    exp: Math.floor(Date.now() / 1000) + 300,
    ...claims,
  });
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signingKey,
    new TextEncoder().encode(`${head}.${body}`)
  );
  return `${head}.${body}.${base64Url(new Uint8Array(signature))}`;
};

const requestWith = (token?: string) =>
  new Request("https://nora.example.com/", {
    headers: token ? { "cf-access-jwt-assertion": token } : {},
  });

const keysFetch = () =>
  vi.fn((url: string) =>
    Promise.resolve(
      url === `${issuer}/cdn-cgi/access/certs`
        ? Response.json({ keys: [{ ...publicJwk, kid }] })
        : new Response("Not found", { status: 404 })
    )
  );

describe("hasCloudflareAccess", () => {
  it("accepts a token signed by the issuer's published key", async () => {
    const fetchKeys = keysFetch();
    expect(
      await hasCloudflareAccess(requestWith(await signToken()), fetchKeys)
    ).toBe(true);
    expect(fetchKeys).toHaveBeenCalledWith(`${issuer}/cdn-cgi/access/certs`);
  });

  it("fetches the keys once for repeated requests", async () => {
    const fetchKeys = keysFetch();
    const token = await signToken();
    await hasCloudflareAccess(requestWith(token), fetchKeys);
    await hasCloudflareAccess(requestWith(token), fetchKeys);
    expect(fetchKeys).toHaveBeenCalledTimes(1);
  });

  it("refuses a request without the header", async () => {
    const fetchKeys = keysFetch();
    expect(await hasCloudflareAccess(requestWith(), fetchKeys)).toBe(false);
    expect(fetchKeys).not.toHaveBeenCalled();
  });

  it("refuses a made-up header", async () => {
    expect(
      await hasCloudflareAccess(requestWith("not-a-token"), keysFetch())
    ).toBe(false);
  });

  it("refuses a tampered token", async () => {
    const token = await signToken();
    const [head, , signature] = token.split(".");
    const forged = `${head}.${encodeJson({ iss: issuer, exp: 9_999_999_999, email: "x" })}.${signature}`;
    expect(await hasCloudflareAccess(requestWith(forged), keysFetch())).toBe(
      false
    );
  });

  it("refuses an expired token", async () => {
    const token = await signToken({ exp: Math.floor(Date.now() / 1000) - 600 });
    expect(await hasCloudflareAccess(requestWith(token), keysFetch())).toBe(
      false
    );
  });

  it("never fetches keys from an issuer outside Cloudflare Access", async () => {
    const fetchKeys = keysFetch();
    const token = await signToken({ iss: "https://attacker.example.com" });
    expect(await hasCloudflareAccess(requestWith(token), fetchKeys)).toBe(
      false
    );
    expect(fetchKeys).not.toHaveBeenCalled();
  });

  it("refuses a token whose key the issuer doesn't publish", async () => {
    const token = await signToken({}, { kid: "unknown-key" });
    expect(await hasCloudflareAccess(requestWith(token), keysFetch())).toBe(
      false
    );
  });

  it("refuses when the keys can't be fetched, and retries next time", async () => {
    const failing = vi.fn(() =>
      Promise.resolve(new Response("Unavailable", { status: 503 }))
    );
    const token = await signToken();
    expect(await hasCloudflareAccess(requestWith(token), failing)).toBe(false);
    expect(await hasCloudflareAccess(requestWith(token), keysFetch())).toBe(
      true
    );
  });
});

describe("accessDeniedResponse", () => {
  it("sends browsers a page", async () => {
    const response = accessDeniedResponse(
      new Request("https://nora.example.com/", {
        headers: { accept: "text/html,application/xhtml+xml" },
      })
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("Access denied");
  });

  it("sends API calls JSON", async () => {
    const response = accessDeniedResponse(
      new Request("https://nora.example.com/api/ibkr/status")
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: accessDeniedMessage });
  });
});
