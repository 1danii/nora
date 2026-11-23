// A gradient that flows through its stops along one smooth curve (monotone
// cubic per channel) instead of straight lines between them, so there are no
// visible kinks at the stops. Sampled into many CSS stops.

type Vec3 = [number, number, number];
export type Stop = [color: string, position: number];
export type SmoothSpace = "oklab" | "srgb";

const SAMPLES = 64;

// Hex only (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`; alpha is ignored): what
// DialKit's color picker and the defaults use. Parsed by hand rather than via a
// canvas so it runs the same on the server, keeping SSR and hydration equal.
const toSrgb = (color: string): Vec3 => {
  const digits = color.trim().replace(/^#/u, "");
  const full =
    digits.length <= 4
      ? [...digits].map((digit) => digit + digit).join("")
      : digits;
  const channel = (index: number) => {
    const value = Number.parseInt(full.slice(index * 2, index * 2 + 2), 16);
    return Number.isNaN(value) ? 0 : value / 255;
  };
  return [channel(0), channel(1), channel(2)];
};

const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

const toOklab = ([r, g, b]: Vec3): Vec3 => {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.41222147 * lr + 0.53633254 * lg + 0.05144599 * lb);
  const m = Math.cbrt(0.2119035 * lr + 0.68069955 * lg + 0.10739696 * lb);
  const s = Math.cbrt(0.08830246 * lr + 0.28171884 * lg + 0.6299787 * lb);
  return [
    0.21045426 * l + 0.7936178 * m - 0.00407205 * s,
    1.9779985 * l - 2.4285922 * m + 0.4505937 * s,
    0.02590404 * l + 0.78277177 * m - 0.80867577 * s,
  ];
};

// Fritsch–Butland tangents keep each channel monotone between stops, so the
// curve never overshoots into colors that are not in the stops.
const tangents = (xs: number[], ys: number[]) => {
  const slopes = xs
    .slice(0, -1)
    .map((x, index) => (ys[index + 1] - ys[index]) / (xs[index + 1] - x));
  return xs.map((_, index) => {
    if (index === 0) {
      return slopes[0];
    }
    if (index === xs.length - 1) {
      return slopes.at(-1) ?? 0;
    }
    const [before, after] = [slopes[index - 1], slopes[index]];
    if (before * after <= 0) {
      return 0;
    }
    const h0 = xs[index] - xs[index - 1];
    const h1 = xs[index + 1] - xs[index];
    return (3 * (h0 + h1)) / ((2 * h1 + h0) / before + (h1 + 2 * h0) / after);
  });
};

const hermite = (
  xs: number[],
  ys: number[],
  ms: number[],
  x: number
): number => {
  const index = Math.max(
    0,
    Math.min(
      xs.length - 2,
      xs.findLastIndex((stop) => stop <= x)
    )
  );
  const h = xs[index + 1] - xs[index];
  const t = (x - xs[index]) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * ys[index] +
    (t3 - 2 * t2 + t) * h * ms[index] +
    (-2 * t3 + 3 * t2) * ys[index + 1] +
    (t3 - t2) * h * ms[index + 1]
  );
};

const format = (space: SmoothSpace, [a, b, c]: Vec3) =>
  space === "oklab"
    ? `oklab(${a} ${b} ${c})`
    : `rgb(${a * 255} ${b * 255} ${c * 255})`;

export const smoothGradient = (stops: Stop[], space: SmoothSpace) => {
  // Stops at the same position would make a zero-width segment.
  const sorted = stops
    .toSorted((a, b) => a[1] - b[1])
    .filter((stop, index, all) => index === 0 || stop[1] > all[index - 1][1]);
  if (sorted.length < 2) {
    return sorted.map(([color, position]) => `${color} ${position}%`);
  }
  const xs = sorted.map(([, position]) => position);
  const colors = sorted.map(([color]) =>
    space === "oklab" ? toOklab(toSrgb(color)) : toSrgb(color)
  );
  const channels = [0, 1, 2].map((channel) => {
    const ys = colors.map((color) => color[channel]);
    return { ms: tangents(xs, ys), ys };
  });
  const [start, end] = [xs[0], xs.at(-1) ?? 100];
  return Array.from({ length: SAMPLES + 1 }, (_, step) => {
    const x = start + ((end - start) * step) / SAMPLES;
    const [a, b, c] = channels.map(({ ms, ys }) => hermite(xs, ys, ms, x));
    const color: Vec3 = [a, b, c];
    return `${format(space, color)} ${x}%`;
  });
};
