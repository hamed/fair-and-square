// The about page's formulas, typeset by LaTeX as a textbook would (Computer Modern, in the page's ink) and saved as
// SVG with the glyphs as paths: public/about/math/<name>.svg. Run: node scripts/about-math.mjs (needs latex, dvisvgm).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT = new URL('../public/about/math/', import.meta.url).pathname;

/** Each formula as LaTeX, display style. */
export const FORMULAS = {
  // the Gini as the clip makes it: the area between the straight line and the Lorenz curve, over the area under the line
  gini: String.raw`G \;=\; \frac{\displaystyle\int_0^1 \bigl(p - L(p)\bigr)\,dp}{\displaystyle\int_0^1 p\,dp}`,
  // the box (area 1) over the pile (each square's side its share s_i): how many copies fit
  neff: String.raw`N_{\mathrm{eff}} \;=\; \frac{1}{\displaystyle\sum_{i=1}^{n} s_i^{2}}`,
  // the line's count: how many bars reach it
  ccdf: String.raw`N(w) \;=\; \sum_{i=1}^{n} \mathbf{1}\{\, w_i \ge w \,\}`,
};

mkdirSync(OUT, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'about-math-'));
for (const [name, tex] of Object.entries(FORMULAS)) {
  const doc = String.raw`\documentclass[border=2pt]{standalone}
\usepackage{amsmath,amssymb}
\usepackage{xcolor}
\definecolor{ink}{HTML}{28251F}
\begin{document}
\color{ink}$\displaystyle ${tex}$
\end{document}
`;
  writeFileSync(join(dir, `${name}.tex`), doc);
  execFileSync('latex', ['-interaction=nonstopmode', '-halt-on-error', `${name}.tex`], { cwd: dir, stdio: 'pipe' });
  execFileSync('dvisvgm', ['--no-fonts', '--exact-bbox', '--scale=1.5', '--output=' + join(OUT, `${name}.svg`), `${name}.dvi`], { cwd: dir, stdio: 'pipe' });
  console.log(name);
}
rmSync(dir, { recursive: true, force: true });
