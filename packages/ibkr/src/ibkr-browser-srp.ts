import { Effect } from "effect";

import { bytesToHex, hexToBytes, modPow } from "./bigint-bytes";
import { ibkrLoginError } from "./ibkr-login-error";

/** Initial parameters from IBKR's public browser bundle; the server can renegotiate them. */
export const ibkrSrpDefaults = {
  N: "d4c7f8a2b32c11b8fba9581ec4ba4f1b04215642ef7355e37c0fc0443ef756ea2c6b8eeb755a1c723027663caa265ef785b8ff6a9b35227a52d86633dbdfca43",
  g: "2",
  hash: "SHA-1",
  proto: "6",
};

/** Negotiated browser SRP parameters, separate from IBKR OAuth signing. */
export interface IbkrSrpParameters {
  readonly N: string;
  readonly g: string;
  readonly hash: string;
  readonly proto: string;
}

export interface IbkrSrpProofInput {
  readonly username: string;
  readonly password: string;
  readonly salt: string;
  readonly serverPublic: string;
  readonly rsaModulus: string;
}

const srpError = (message: string) =>
  ibkrLoginError("Upstream", `IBKR SRP: ${message}`);

const padHex = (value: string, width = 2) =>
  value.padStart(Math.ceil(value.length / width) * width, "0");
const integerHex = (value: bigint) => value.toString(16);

const parseHex = (value: string) =>
  /^[\da-f]+$/iu.test(value) && value.length <= 2048
    ? Effect.succeed(BigInt(`0x${value}`))
    : Effect.fail(srpError("invalid integer encoding"));

const hashHex = (value: string, algorithm: string) =>
  Effect.promise(() => crypto.subtle.digest(algorithm, hexToBytes(value))).pipe(
    Effect.map((digest) => bytesToHex(new Uint8Array(digest)))
  );

// Forge hashes binary strings here, not UTF-8. IBKR's username/password contract uses bytes.
const binaryHex = (value: string) => {
  const bytes = Array.from(value, (character) => character.codePointAt(0) ?? 0);
  return bytes.some((byte) => byte > 255)
    ? Effect.fail(srpError("unsupported credential character encoding"))
    : Effect.succeed(bytesToHex(Uint8Array.from(bytes)));
};

const randomPrivateHex = () =>
  bytesToHex(crypto.getRandomValues(new Uint8Array(32)));

/** Encrypts the SRP key text using the browser protocol's RSAES-PKCS1-v1_5 and exponent 3. */
export const encryptIbkrSessionKey = Effect.fn("IbkrSrp.encryptSessionKey")(
  function* encryptIbkrSessionKey(key: string, modulusHex: string) {
    const modulus = yield* parseHex(modulusHex);
    const width = Math.ceil(integerHex(modulus).length / 2);
    const message = new TextEncoder().encode(key);
    const paddingLength = width - message.length - 3;
    if (paddingLength < 8 || width > 1024) {
      return yield* Effect.fail(srpError("invalid RSA encryption key size"));
    }
    const encoded = new Uint8Array(width);
    encoded[1] = 2;
    for (let index = 2; index < paddingLength + 2; index += 1) {
      let byte = 0;
      while (byte === 0) {
        byte = crypto.getRandomValues(new Uint8Array(1))[0] ?? 0;
      }
      encoded[index] = byte;
    }
    encoded.set(message, paddingLength + 3);
    const padded = yield* parseHex(bytesToHex(encoded));
    return integerHex(modPow(padded, 3n, modulus)).padStart(width * 2, "0");
  }
);

/** Creates one browser password proof; the private exponent never leaves the server. */
export const createIbkrSrp = Effect.fn("IbkrSrp.create")(
  function* createIbkrSrp(
    parameters: IbkrSrpParameters,
    privateHex: string = randomPrivateHex()
  ) {
    const modulus = yield* parseHex(parameters.N);
    const generator = yield* parseHex(parameters.g);
    const algorithm = parameters.hash.toUpperCase();
    if (
      !["SHA-1", "SHA-256"].includes(algorithm) ||
      !["6", "6a"].includes(parameters.proto) ||
      modulus <= 3n ||
      generator <= 1n ||
      generator >= modulus
    ) {
      return yield* Effect.fail(srpError("unsupported negotiation"));
    }
    const privateValue = yield* parseHex(privateHex);
    if (privateValue < 2n || privateValue >= modulus) {
      return yield* Effect.fail(srpError("invalid private exponent"));
    }
    const publicValue = modPow(generator, privateValue, modulus);
    if (publicValue === 0n) {
      return yield* Effect.fail(srpError("invalid public value"));
    }
    const hash = (value: string) => hashHex(value, algorithm);
    const width = 2 * Math.floor((4 * integerHex(modulus).length + 7) / 8);
    const hashInteger = (parts: readonly string[], padded = false) =>
      hash(
        parts
          .map((part) => (padded ? part.padStart(width, "0") : part))
          .join("")
      ).pipe(
        Effect.flatMap(parseHex),
        Effect.map((value) => value % modulus)
      );

    const prove = Effect.fn("IbkrSrp.prove")(function* prove(
      input: IbkrSrpProofInput
    ) {
      yield* parseHex(input.salt);
      const serverValue = yield* parseHex(input.serverPublic);
      if (serverValue % modulus === 0n) {
        return yield* Effect.fail(srpError("invalid server public value"));
      }
      const aHex = padHex(integerHex(publicValue));
      const bHex = padHex(integerHex(serverValue));
      const multiplier =
        parameters.proto === "6"
          ? 3n
          : yield* hashInteger(
              [integerHex(modulus), integerHex(generator)],
              true
            );
      const credentials = yield* binaryHex(
        `${input.username}:${input.password}`
      );
      const x = yield* parseHex(
        yield* hash(padHex(input.salt) + (yield* hash(credentials)))
      );
      const u = yield* hashInteger([aHex, bHex]);
      const base =
        (((serverValue - multiplier * modPow(generator, x, modulus)) %
          modulus) +
          modulus) %
        modulus;
      const secret = modPow(base, privateValue + x * u, modulus);
      const K = (yield* hash(integerHex(secret))).replace(/^0+/u, "");
      const nHash = yield* hashInteger([integerHex(modulus)]);
      const gHash = yield* hashInteger([integerHex(generator)]);
      const userHash = yield* hashInteger([yield* binaryHex(input.username)]);
      const M1 = yield* hashInteger([
        // oxlint-disable-next-line no-bitwise -- XOR is required by the SRP proof definition.
        padHex(integerHex(nHash ^ gHash)),
        padHex(integerHex(userHash), 8),
        padHex(input.salt),
        aHex,
        bHex,
        padHex(K),
      ]);
      const M2 = yield* hashInteger([aHex, padHex(integerHex(M1)), padHex(K)]);
      return {
        M1: padHex(integerHex(M1), 8),
        M2: integerHex(M2),
        sessionKey: yield* hash(bHex + padHex(K)),
        EKX: yield* encryptIbkrSessionKey(K, input.rsaModulus),
      };
    });

    return { A: padHex(integerHex(publicValue), 8), prove };
  }
);
