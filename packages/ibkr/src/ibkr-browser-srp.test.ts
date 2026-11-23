import { constants, generateKeyPairSync, privateDecrypt } from "node:crypto";

import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  createIbkrSrp,
  encryptIbkrSessionKey,
  ibkrSrpDefaults,
} from "./ibkr-browser-srp";
import fixtures from "./ibkr-browser-srp.fixtures.json";

const rsa = generateKeyPairSync("rsa", {
  modulusLength: 1024,
  publicExponent: 3,
});
const modulus = Buffer.from(
  rsa.publicKey.export({ format: "jwk" }).n ?? "",
  "base64url"
).toString("hex");

describe("IBKR browser SRP", () => {
  // Synthetic reference outputs from IBKR's public login page script.
  for (const fixture of fixtures) {
    it(`matches the vendor's ${fixture.parameters.proto}/${fixture.parameters.hash} proof and session key`, async () => {
      const proof = await Effect.runPromise(
        Effect.gen(function* proveFixture() {
          const srp = yield* createIbkrSrp(
            fixture.parameters,
            fixture.input.privateHex
          );
          expect(srp.A).toBe(fixture.expected.A);
          return yield* srp.prove({
            username: fixture.input.username,
            password: fixture.input.password,
            salt: fixture.input.salt,
            serverPublic: fixture.input.serverPublic,
            rsaModulus: modulus,
          });
        })
      );
      expect(proof).toMatchObject({
        M1: fixture.expected.M1,
        M2: fixture.expected.M2,
        sessionKey: fixture.expected.sessionKey,
      });
    });
  }

  it("encrypts the key text with exponent 3 and randomized nonzero PKCS#1 padding", async () => {
    const key = "00abc123";
    const encrypted = await Effect.runPromise(
      encryptIbkrSessionKey(key, modulus)
    );
    const decoded = privateDecrypt(
      { key: rsa.privateKey, padding: constants.RSA_NO_PADDING },
      Buffer.from(encrypted, "hex")
    );
    expect(decoded.subarray(0, 2)).toEqual(Buffer.from([0, 2]));
    const separator = decoded.indexOf(0, 2);
    expect(separator).toBeGreaterThanOrEqual(10);
    expect(decoded.subarray(separator + 1).toString()).toBe(key);
    expect(
      await Effect.runPromise(encryptIbkrSessionKey(key, modulus))
    ).not.toBe(encrypted);
  });

  it("rejects invalid public values before computing a password proof", async () => {
    const invalidServer = await Effect.runPromise(
      Effect.flip(
        Effect.flatMap(createIbkrSrp(ibkrSrpDefaults, "a".repeat(64)), (srp) =>
          srp.prove({
            username: "nora",
            password: "password",
            salt: "01",
            serverPublic: ibkrSrpDefaults.N,
            rsaModulus: modulus,
          })
        )
      )
    );
    expect(invalidServer.message).toContain("invalid server public value");
    const unsupported = await Effect.runPromise(
      Effect.flip(createIbkrSrp({ ...ibkrSrpDefaults, hash: "MD5" }))
    );
    expect(unsupported.message).toContain("unsupported negotiation");
  });
});
