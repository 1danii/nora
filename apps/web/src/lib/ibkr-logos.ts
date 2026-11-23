/**
 * IBKR's company logo for a contract, the one its mobile app shows: a
 * Benzinga mark on a transparent background, light for dark UIs. Public, so
 * the browser loads it directly with no session. Unknown conids 404, so the
 * caller can show its own fallback. Undocumented; IBKR can change it.
 *
 * `size` is the rendered size in CSS pixels; the image has twice the pixels.
 */
export const assetLogoUrl = (conid: number, size: number) => {
  const params = new URLSearchParams({
    conid: String(conid),
    type: "mark_dark",
    scale: `${size * 2}x${size * 2}`,
  });
  return `https://api.ibkr.com/tws.proxy/public/icons/benzinga?${params}`;
};
