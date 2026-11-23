import * as stylex from "@stylexjs/stylex";
import { useId } from "react";

/*
 * "nora" outlined from the app's Inter (inter-ui 4.1.1, InterVariable) with
 * HarfBuzz: weight 600, opsz 22, letter-spacing -0.03em, liga + calt on.
 * Units are 2048 per em; the line box is 0..2048 like `line-height: 1`.
 */
const wordmark = {
  width: 4084,
  // Where the "a" ink ends; the rest of `width` is its right side bearing.
  inkRight: 4019.3,
  d: "M382.9 1139.8V1769H126.2V678.6H373.5L375.5 951.5H342.2Q390.6 808.2 482.4 734.7Q574.3 661.2 711.5 661.2Q824.7 661.2 910.1 709.9Q995.5 758.5 1043.4 852.1Q1091.2 945.7 1091.2 1081V1769H834.4V1120.9Q834.4 1006.7 777.3 944.6Q720.2 882.5 618.2 882.5Q550.5 882.5 497.3 911.3Q444 940 413.5 997.1Q382.9 1054.3 382.9 1139.8ZM1761.1 1792.2Q1601.8 1792.2 1482.8 1721.2Q1363.9 1650.3 1298.3 1523.1Q1232.8 1395.8 1232.8 1227.4Q1232.8 1057.7 1298.3 930.1Q1363.9 802.5 1482.8 731.3Q1601.8 660.1 1761.1 660.1Q1921.2 660.1 2039.9 731.3Q2158.6 802.5 2224.2 930.1Q2289.7 1057.7 2289.7 1227.4Q2289.7 1395.8 2224.2 1523.1Q2158.6 1650.3 2039.9 1721.2Q1921.2 1792.2 1761.1 1792.2ZM1761.1 1581.2Q1847.8 1581.2 1907.7 1535.8Q1967.6 1490.3 1998.5 1410.2Q2029.4 1330 2029.4 1227Q2029.4 1122.8 1998.5 1042.7Q1967.6 962.6 1907.7 916.8Q1847.8 871.1 1761.1 871.1Q1675 871.1 1615.1 916.7Q1555.3 962.3 1524.3 1042.3Q1493.4 1122.4 1493.4 1227Q1493.4 1330.3 1524.3 1410.3Q1555.3 1490.3 1615 1535.8Q1674.7 1581.2 1761.1 1581.2ZM2431.3 1769V678.6H2679.3V860.4H2687.4Q2717.4 766 2786.6 715.7Q2855.8 665.5 2954.8 665.5Q2978.3 665.5 3002.6 667.2Q3026.9 669 3044 671.5V903.8Q3029 900 2993.8 896.4Q2958.7 892.8 2923.1 892.8Q2856.4 892.8 2802.9 922.2Q2749.3 951.6 2718.7 1006.3Q2688 1061.1 2688 1137.9V1769ZM3443 1789.4Q3337.1 1789.4 3253.2 1752.4Q3169.4 1715.4 3120.9 1642.3Q3072.4 1569.1 3072.4 1461.1Q3072.4 1368.5 3107.2 1308.1Q3142 1247.7 3201.6 1211.6Q3261.1 1175.4 3336.7 1156.8Q3412.3 1138.1 3493.5 1129.6Q3591.5 1118.6 3650.7 1110.4Q3710 1102.3 3736.9 1084.9Q3763.8 1067.5 3763.8 1030.5V1024.1Q3763.8 973.3 3741.2 936.6Q3718.7 900 3675.4 879.9Q3632.1 859.8 3569.6 859.8Q3506.6 859.8 3459.5 879.6Q3412.4 899.4 3383.6 932.5Q3354.8 965.6 3345.2 1006.3L3103.5 978.9Q3124.9 877 3188.5 806.3Q3252.1 735.7 3350.1 698.5Q3448.2 661.2 3571.6 661.2Q3661 661.2 3741.9 682.7Q3822.8 704.1 3885.2 749.1Q3947.6 794.1 3983.5 864.6Q4019.3 935.2 4019.3 1033.7V1769H3771V1617H3763.4Q3738.8 1664.4 3696.7 1703.6Q3654.5 1742.9 3592 1766.1Q3529.5 1789.4 3443 1789.4ZM3507.6 1599Q3588.8 1599 3646.4 1568.1Q3704.1 1537.1 3734.6 1485.6Q3765.2 1434.1 3765.2 1372.5V1248Q3752.9 1257.2 3725.9 1265.2Q3699 1273.2 3664 1279.9Q3629.1 1286.6 3592.6 1292.1Q3556.1 1297.6 3524.8 1301.9Q3468.4 1309.6 3422.2 1327.6Q3376 1345.6 3348.8 1377.1Q3321.7 1408.6 3321.7 1458.5Q3321.7 1503.6 3345.3 1535Q3368.9 1566.4 3410.7 1582.7Q3452.5 1599 3507.6 1599Z",
};

/*
 * The "Smaller symbol" lockup from Wonder (Iguana › Brand), drawn in wordmark
 * units (2048 per em): at a 72px wordmark the symbol is 80px and the gap 18px,
 * and the wordmark's line box shares the symbol's top edge.
 */
const em = 2048 / 72;
const symbolSize = 80 * em;
const gap = 18 * em;
const symbolScale = symbolSize / 128;
// The ring (r 50 + half its 10-unit stroke) leaves 9 of the symbol's 128
// units empty on every side; the viewBoxes crop it, and the wordmark's ink
// sits inside the ring's top and bottom.
const ringInset = 9;
const lockupInset = ringInset * symbolScale;

const styles = stylex.create({
  root: {
    // The viewBoxes end exactly on the ring's edge; at fractional sizes and
    // positions the browser would clip its anti-aliased last pixel row.
    overflow: "visible",
    display: "block",
    // Width follows the viewBox; size the lockup with `height`.
    width: "auto",
  },
});

/** The ring-sun symbol in its 128-unit box; the clip id must be unique. */
const RingSun = ({ clipId }: { clipId: string }) => (
  <>
    <defs>
      <clipPath id={clipId}>
        <circle cx="64" cy="64" r="46" />
      </clipPath>
    </defs>
    <circle
      cx="64"
      cy="64"
      fill="none"
      r="50"
      stroke="currentColor"
      strokeWidth="10"
    />
    <circle clipPath={`url(#${clipId})`} cx="64" cy="114" r="57" />
  </>
);

/**
 * The nora lockup as one SVG: the ring-sun symbol and the wordmark outlined
 * from the app's Inter, so it renders identically everywhere. Decorative:
 * label the link or heading around it. Size it with `height`.
 */
export const NoraLogo = ({ style }: { style?: stylex.StyleXStyles }) => {
  const clipId = useId();
  const width = symbolSize + gap + wordmark.inkRight - lockupInset;
  const height = symbolSize - 2 * lockupInset;
  return (
    <svg
      {...stylex.props(styles.root, style)}
      aria-hidden="true"
      fill="currentColor"
      viewBox={`${lockupInset} ${lockupInset} ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform={`scale(${symbolScale})`}>
        <RingSun clipId={clipId} />
      </g>
      <path d={wordmark.d} transform={`translate(${symbolSize + gap} 0)`} />
    </svg>
  );
};

/**
 * Just the ring-sun symbol, square, cropped to the ring's outer edge
 * (r 50 + half the 10-unit stroke = 55 around the 64 center) so the box has
 * no padding. Decorative: label the link around it. Size it with `height`.
 */
export const NoraSymbol = ({ style }: { style?: stylex.StyleXStyles }) => {
  const clipId = useId();
  return (
    <svg
      {...stylex.props(styles.root, style)}
      aria-hidden="true"
      fill="currentColor"
      viewBox={`${ringInset} ${ringInset} ${128 - 2 * ringInset} ${
        128 - 2 * ringInset
      }`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <RingSun clipId={clipId} />
    </svg>
  );
};
