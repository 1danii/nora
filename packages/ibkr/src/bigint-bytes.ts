/** Hex, byte and BigInt helpers for the SRP login, on Web Crypto-free primitives. */

export const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export const hexToBytes = (hex: string): Uint8Array<ArrayBuffer> => {
  const normalized = hex.length % 2 === 0 ? hex : `0${hex}`;
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(
      normalized.slice(index * 2, index * 2 + 2),
      16
    );
  }
  return bytes;
};

export const modPow = (
  base: bigint,
  exponent: bigint,
  modulus: bigint
): bigint => {
  if (modulus === 1n) {
    return 0n;
  }
  let result = 1n;
  let remainingBase = base % modulus;
  let remainingExponent = exponent;
  while (remainingExponent > 0n) {
    if (remainingExponent % 2n === 1n) {
      result = (result * remainingBase) % modulus;
    }
    remainingBase = (remainingBase * remainingBase) % modulus;
    remainingExponent /= 2n;
  }
  return result;
};
