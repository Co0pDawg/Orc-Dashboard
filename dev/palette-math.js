// Colour maths for the palette generator: WCAG contrast and a minimal "lift until readable" adjustment.

const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hex = c => "#" + c.map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
/** WCAG relative luminance of a #rrggbb colour. */
export const luminance = h => {
  const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG contrast ratio of two colours (1 to 21). */
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** a mixed toward b by t (0 = a, 1 = b). */
export const mix = (a, b, t) => { const p = rgb(a), q = rgb(b); return hex(p.map((v, i) => v + (q[i] - v) * t)); };
// The smallest step toward `toward` (in 2% steps) that reads at `min`:1 on every background; the colour itself
// when it already does, so palettes keep their own values wherever they are readable.
/** c moved toward `toward` just far enough to reach `min` contrast on all of `bgs`. */
export function lift(c, toward, bgs, min = 4.5){
  for (let i = 0; i <= 50; i++){
    const m = mix(c, toward, i / 50);
    if (bgs.every(b => contrast(m, b) >= min)) return m;
  }
  return toward;
}
